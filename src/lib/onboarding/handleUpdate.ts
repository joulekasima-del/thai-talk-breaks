// Core onboarding logic. All I/O is behind the injected LearnerStore and
// TelegramClient interfaces, so this module can be exercised in tests with
// fakes and no real network or database — see handleUpdate.test.ts.
//
// State machine (matches the `onboarding_step` enum in
// supabase/migrations/20260820000000_initial_schema.sql exactly — see
// ONBOARDING_FLOW.md for the full diagram):
//
//   (no row) --/start--> gender_pending
//   gender_pending --gender:<male|female>--> schedule_period_pending
//   schedule_period_pending --period:<morning|afternoon|evening>--> schedule_time_pending
//   schedule_time_pending --time:<HH:MM>--> complete
//     (sends notification test + onboarding-complete messages, sets
//     pilot_start_date, in the same step — see report item 3)
//
// /start while already `complete` sends ALREADY_ONBOARDED_MESSAGE instead of
// restarting. /start while mid-onboarding re-sends the current pending
// question instead of restarting from the welcome message. Both are
// implementation-level design choices, not locked decisions — see
// ONBOARDING_FLOW.md and the Checkpoint 2 report.
//
// /oops issue reporting (added later, independent of the onboarding state
// machine above — see learners.awaiting_oops_report_since):
//   /oops (no report pending)      -> sends the prompt, sets the pending flag
//   /oops (report already pending) -> re-sends the same prompt, no state change
//   /start (report pending)        -> clears the pending flag, then proceeds
//                                      with /start's existing behavior exactly
//                                      as above
//   any plain text (report pending)-> captured verbatim as the report, flag
//                                      cleared, confirmation sent, admin DMed
//   any plain text (paywall check-in already sent, still unpaid, not yet
//                   across the boundary) -> re-sends the same one-time Day 8
//                                           check-in (LDTKB-016). Read-only:
//                                           no flag set or cleared. Checked
//                                           after both pending-capture flags.
//   any plain text (nothing pending)-> silently ignored, same as before /oops existed
//
// Stage 5 (LDTKB-014) Telegram Stars checkout — a standalone, testable
// purchase flow for checkout/support/refund verification, NOT the final
// paywall (Stage 8, out of scope here; no lesson-delivery gating is
// introduced by any of this):
//   /buy                    -> no learner row: BUY_NOT_ONBOARDED_MESSAGE.
//                               Otherwise: sendInvoice, fixed 500-Star price.
//   pre_checkout_query       -> always answerPreCheckoutQuery(id, true) — one
//                               fixed SKU, nothing to validate against yet.
//                               Routed before any text-based branch, since
//                               this update shape carries no message.text.
//   successful_payment        -> checked explicitly on update.message, before
//   (on update.message)          the plain-text/oops-capture fallback (its
//                               `text` is typically undefined and would
//                               otherwise be silently swallowed). Records a
//                               purchases row, confirms the learner. Day 8
//                               paywall gate (LDTKB-016): if the learner has
//                               already used up the 7-day free preview,
//                               sets paid_course_start_date = today and
//                               delivers Day 8 in this same call. If still
//                               mid-free-week, nothing extra — the cron
//                               route crosses them over when Day 7 ends.
//   /paysupport (no request pending)      -> sends the prompt (states
//                                             LDTKB-063's refund standard),
//                                             sets the pending flag.
//   /paysupport (request already pending) -> re-sends the same prompt, no
//                                             state change.
//   any plain text (paysupport pending)   -> captured verbatim, matched
//                                             against the learner's most
//                                             recent purchase (if any), flag
//                                             cleared, confirmation sent,
//                                             admin DMed. If BOTH
//                                             awaiting_oops_report_since and
//                                             awaiting_paysupport_request_since
//                                             are somehow set, oops is
//                                             checked first (shouldn't
//                                             normally happen).
//   /refund <charge_id>      -> admin-only (silently ignored otherwise, same
//                               as an unrecognized command). Looks up the
//                               purchase, calls refundStarPayment, marks it
//                               refunded, DMs the admin, messages the
//                               learner. Refund eligibility (LDTKB-063:
//                               genuine delivery failure only) is Joule's own
//                               judgment call each time — this command is
//                               the execution step, not an auto-approval.
//                               Day 8 paywall gate (LDTKB-016): if the
//                               refunded learner had crossed the paywall,
//                               also clears paid_course_start_date, dropping
//                               them back behind the gate.

import type { TelegramClient, TelegramMessage, TelegramPreCheckoutQuery, TelegramUpdate } from "@/lib/telegram";
import type { Learner, LearnerStore, SchedulePeriod } from "@/lib/onboarding/learnerStore";
import type { OopsReportsStore } from "@/lib/oops/oopsReportsStore";
import type { PurchasesStore } from "@/lib/payments/purchasesStore";
import type { PaymentSupportStore } from "@/lib/payments/paymentSupportStore";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";
import type { MediaLoader } from "@/lib/delivery/deliverLesson";
import type { SrsStore } from "@/lib/srs/srsStore";
import type { Day30QuizStore } from "@/lib/quiz/day30QuizStore";
import { handleMore, handleQuizAnswer, isBehindPaywall, startSession, type SessionDeps } from "@/lib/session/session";
import { LESSON_PAYWALL_MESSAGE, NEXT_LESSON_KEYBOARD } from "@/lib/session/content";
import {
  ALREADY_ONBOARDED_NEXT_MESSAGE,
  GENDER_QUESTION_KEYBOARD,
  GENDER_QUESTION_MESSAGE,
  LEAN_WELCOME_MESSAGE,
  REMINDER_NOTIFICATION_TEST_MESSAGE,
  REMINDER_PERIOD_MESSAGE,
  SCHEDULE_PERIOD_KEYBOARD,
  SCHEDULE_TIME_MESSAGE,
  SURVEY_INTRO,
  SURVEY_QUESTIONS,
  cleanName,
  firstWordMessage,
  isValidTimeForPeriod,
  nameKeyboard,
  niceToMeetYou,
  readyMessage,
  scheduleTimeKeyboard,
  surveyKeyboard,
  type SurveyQuestion,
} from "@/lib/onboarding/content";
import { OOPS_CONFIRMATION_MESSAGE, OOPS_PROMPT_MESSAGE } from "@/lib/oops/content";
import {
  BUY_INVOICE_AMOUNT_STARS,
  BUY_INVOICE_DESCRIPTION,
  BUY_INVOICE_PAYLOAD,
  BUY_INVOICE_PRICE_LABEL,
  BUY_INVOICE_TITLE,
  BUY_NOT_ONBOARDED_MESSAGE,
  PAYMENT_CONFIRMATION_MESSAGE,
  PAYSUPPORT_CONFIRMATION_MESSAGE,
  PAYSUPPORT_PROMPT_MESSAGE,
  REFUND_ISSUED_MESSAGE,
} from "@/lib/payments/content";

export interface HandleUpdateDeps {
  store: LearnerStore;
  telegram: TelegramClient;
  oopsReportsStore: OopsReportsStore;
  purchasesStore: PurchasesStore;
  paymentSupportStore: PaymentSupportStore;
  /**
   * Needed only for the Day 8 paywall gate's "deliver Day 8 the instant
   * payment succeeds" path (handleSuccessfulPayment) — the webhook route
   * wires these in, mirroring the cron route's construction. Optional so the
   * onboarding/oops/payments test suites, which never exercise that path,
   * don't have to build them. If a learner crosses the boundary on payment
   * but these are absent, delivery is left to the next cron tick.
   */
  deliveryStore?: DeliveryStore;
  media?: MediaLoader;
  appUrl?: string;
  /**
   * Instant-lessons redesign: lessons, quizzes and spaced repetition run in
   * sessions (src/lib/session/session.ts). Without these (and deliveryStore +
   * media), anything that would start or continue a session is skipped —
   * the onboarding/oops/payments test suites don't need to build them.
   */
  srsStore?: SrsStore;
  quizStore?: Day30QuizStore;
  rng?: () => number;
  /** Telegram user id to DM new /oops reports (and /paysupport requests) to. Null if ADMIN_TELEGRAM_USER_ID isn't set — the report is still saved, just no DM is attempted. Also the sole identity /refund is authorized against. */
  adminTelegramUserId: number | null;
  /** Injectable clock, for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
}

const VALID_GENDERS = new Set(["male", "female"]);
const VALID_PERIODS = new Set(["morning", "afternoon", "evening"]);

export async function handleUpdate(update: TelegramUpdate, deps: HandleUpdateDeps): Promise<void> {
  // Carries no message.text at all — must route here before any text-based
  // branch below, or it would fall straight through to "anything else."
  if (update.pre_checkout_query) {
    await handlePreCheckoutQuery(update.pre_checkout_query, deps);
    return;
  }

  const text = update.message?.text;

  if (text?.startsWith("/start")) {
    await handleStart(update.message!, deps);
    return;
  }
  if (text?.startsWith("/oops")) {
    await handleOops(update.message!, deps);
    return;
  }
  if (text?.startsWith("/buy")) {
    await handleBuy(update.message!, deps);
    return;
  }
  if (text?.startsWith("/paysupport")) {
    await handlePaySupport(update.message!, deps);
    return;
  }
  if (text?.startsWith("/refund")) {
    await handleRefund(update.message!, deps);
    return;
  }
  if (text?.startsWith("/next")) {
    await handleNextCommand(update.message!, deps);
    return;
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, deps);
    return;
  }
  // Checked explicitly, before the plain-text/oops-capture fallback below —
  // a successful_payment confirmation message typically has `text`
  // undefined and would otherwise be silently swallowed by that catch-all.
  if (update.message?.successful_payment) {
    await handleSuccessfulPayment(update.message, deps);
    return;
  }
  if (update.message && text !== undefined) {
    // Only meaningful when an /oops report or a /paysupport request is
    // pending (captured below); otherwise silently ignored, exactly as
    // before either feature existed.
    await maybeCapturePendingReport(update.message, deps);
    return;
  }
  // Anything else (non-text messages, other commands, etc.) is silently
  // ignored — no free-text or non-onboarding command handling beyond
  // /oops/payments is in scope here.
}

async function handleStart(
  message: NonNullable<TelegramUpdate["message"]>,
  deps: HandleUpdateDeps,
): Promise<void> {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;

  let learner = await deps.store.findByTelegramId(telegramUserId);

  if (!learner) {
    learner = await deps.store.create(telegramUserId);
    // Instant-lessons onboarding: one short welcome that asks for a name.
    await deps.telegram.sendMessage(chatId, LEAN_WELCOME_MESSAGE, nameKeyboard(message.from.first_name));
    return;
  }

  if (learner.awaiting_oops_report_since) {
    // /start while a report is pending: don't leave the learner stuck
    // unable to /start normally — clear it, then fall through to /start's
    // existing behavior exactly as if nothing had been pending.
    learner = await deps.store.update(learner.id, { awaiting_oops_report_since: null });
  }

  if (learner.awaiting_paysupport_request_since) {
    // Same reasoning as the /oops pending flag above, for /paysupport.
    learner = await deps.store.update(learner.id, { awaiting_paysupport_request_since: null });
  }

  if (learner.onboarding_step === "complete") {
    await deps.telegram.sendMessage(chatId, ALREADY_ONBOARDED_NEXT_MESSAGE, NEXT_LESSON_KEYBOARD);
    return;
  }

  // Mid-onboarding: resume at the current step rather than restarting.
  await resendCurrentStep(learner, chatId, deps, message.from.first_name);
}

/** Everything a session needs, or null when this webhook wasn't given it. */
function sessionDeps(deps: HandleUpdateDeps): SessionDeps | null {
  if (!deps.srsStore || !deps.deliveryStore || !deps.media) return null;
  return {
    telegram: deps.telegram,
    learnerStore: deps.store,
    srsStore: deps.srsStore,
    deliveryStore: deps.deliveryStore,
    purchasesStore: deps.purchasesStore,
    media: deps.media,
    quizStore: deps.quizStore,
    appUrl: deps.appUrl,
    now: deps.now,
    rng: deps.rng,
  };
}

/** "▶️ Next lesson" (button or /next): start a session right away, no waiting for the reminder. */
async function startNextLesson(learner: Learner, chatId: number, deps: HandleUpdateDeps): Promise<void> {
  if (learner.onboarding_step !== "complete" && learner.onboarding_step !== "first_lesson") {
    await resendCurrentStep(learner, chatId, deps);
    return;
  }
  const session = sessionDeps(deps);
  if (!session) return;
  await startSession(learner, chatId, session);
}

async function handleNextCommand(message: NonNullable<TelegramUpdate["message"]>, deps: HandleUpdateDeps): Promise<void> {
  const learner = await deps.store.findByTelegramId(message.from.id);
  if (!learner) return;
  await startNextLesson(learner, message.chat.id, deps);
}

async function handleOops(message: NonNullable<TelegramUpdate["message"]>, deps: HandleUpdateDeps): Promise<void> {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;

  const learner = await deps.store.findByTelegramId(telegramUserId);
  if (!learner) return; // /oops before ever /start-ing — no learner row to attach a report to

  if (!learner.awaiting_oops_report_since) {
    const now = deps.now ? deps.now() : new Date();
    await deps.store.update(learner.id, { awaiting_oops_report_since: now.toISOString() });
  }
  // Already pending: fall through and re-send the same prompt without
  // touching state again — no stacking, no duplicate pending state.

  await deps.telegram.sendMessage(chatId, OOPS_PROMPT_MESSAGE);
}

/**
 * Dispatches a plain-text message to whichever capture is actually pending
 * (there's only ever meant to be one, but if both are somehow set, oops
 * takes precedence — matching the order they're checked in here). Neither
 * branch fires at all if nothing is pending — silently ignored, exactly as
 * before either feature existed.
 */
async function maybeCapturePendingReport(
  message: NonNullable<TelegramUpdate["message"]>,
  deps: HandleUpdateDeps,
): Promise<void> {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const text = message.text;
  if (text === undefined) return;

  const learner = await deps.store.findByTelegramId(telegramUserId);
  if (!learner) return;

  if (learner.awaiting_oops_report_since) {
    await captureOopsReport(learner, chatId, text, deps);
    return;
  }
  if (learner.awaiting_paysupport_request_since) {
    await capturePaySupportRequest(learner, chatId, text, deps);
    return;
  }
  // Onboarding's first question: whatever they type is the name to use.
  if (learner.onboarding_step === "name_pending") {
    await saveNameAndContinue(learner, text, chatId, deps);
    return;
  }
  // Paywall gate (LDTKB-016), counted in lessons: a learner who's been shown
  // the check-in and still hasn't paid gets it again on any message.
  // Read-only, checked after the real pending-capture flags above.
  if (learner.paywall_prompt_sent_at !== null && (await isBehindPaywall(learner, deps))) {
    await deps.telegram.sendMessage(chatId, LESSON_PAYWALL_MESSAGE);
    return;
  }
  // Nothing pending — silently ignored.
}

async function captureOopsReport(
  learner: Learner,
  chatId: number,
  text: string,
  deps: HandleUpdateDeps,
): Promise<void> {
  await deps.store.update(learner.id, { awaiting_oops_report_since: null });
  await deps.oopsReportsStore.create(learner.id, text);
  await deps.telegram.sendMessage(chatId, OOPS_CONFIRMATION_MESSAGE);

  if (deps.adminTelegramUserId !== null) {
    try {
      await deps.telegram.sendMessage(
        deps.adminTelegramUserId,
        `🐛 New /oops report\nFrom learner (Telegram ID: ${learner.telegram_user_id})\n\n${text}`,
      );
    } catch (error) {
      // The report is already saved and the learner already confirmed —
      // a DM failure (e.g. a stale/invalid admin id) must not undo that.
      console.error("Failed to DM admin about /oops report", error);
    }
  }
}

async function capturePaySupportRequest(
  learner: Learner,
  chatId: number,
  text: string,
  deps: HandleUpdateDeps,
): Promise<void> {
  await deps.store.update(learner.id, { awaiting_paysupport_request_since: null });

  const mostRecentPurchase = await deps.purchasesStore.findMostRecentByLearner(learner.id);
  await deps.paymentSupportStore.create(learner.id, mostRecentPurchase?.id ?? null, text);
  await deps.telegram.sendMessage(chatId, PAYSUPPORT_CONFIRMATION_MESSAGE);

  if (deps.adminTelegramUserId !== null) {
    try {
      await deps.telegram.sendMessage(
        deps.adminTelegramUserId,
        `💳 New /paysupport request\nFrom learner (Telegram ID: ${learner.telegram_user_id})\nMost recent purchase: ${mostRecentPurchase?.telegram_payment_charge_id ?? "none found"}\n\n${text}`,
      );
    } catch (error) {
      // Same "DM failure doesn't undo the saved record" pattern as /oops.
      console.error("Failed to DM admin about /paysupport request", error);
    }
  }
}

async function handleBuy(message: NonNullable<TelegramUpdate["message"]>, deps: HandleUpdateDeps): Promise<void> {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;

  const learner = await deps.store.findByTelegramId(telegramUserId);
  if (!learner) {
    await deps.telegram.sendMessage(chatId, BUY_NOT_ONBOARDED_MESSAGE);
    return;
  }

  await deps.telegram.sendInvoice(chatId, {
    title: BUY_INVOICE_TITLE,
    description: BUY_INVOICE_DESCRIPTION,
    payload: BUY_INVOICE_PAYLOAD,
    prices: [{ label: BUY_INVOICE_PRICE_LABEL, amount: BUY_INVOICE_AMOUNT_STARS }],
  });
}

async function handlePreCheckoutQuery(preCheckoutQuery: TelegramPreCheckoutQuery, deps: HandleUpdateDeps): Promise<void> {
  // Only one fixed SKU exists right now, so there's nothing to validate the
  // payload/amount against yet — always accept, within Telegram's ~10s window.
  await deps.telegram.answerPreCheckoutQuery(preCheckoutQuery.id, true);
}

async function handleSuccessfulPayment(message: TelegramMessage, deps: HandleUpdateDeps): Promise<void> {
  const payment = message.successful_payment;
  if (!payment) return; // defensive: this function is only ever called when it's set

  const chatId = message.chat.id;
  const telegramUserId = message.from.id;

  const learner = await deps.store.findByTelegramId(telegramUserId);
  if (!learner) return; // defensive: shouldn't happen — /buy already requires an existing learner row

  await deps.purchasesStore.create({
    learnerId: learner.id,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
    providerPaymentChargeId: payment.provider_payment_charge_id ?? null,
    currency: payment.currency,
    totalAmount: payment.total_amount,
    invoicePayload: payment.invoice_payload,
  });

  await deps.telegram.sendMessage(chatId, PAYMENT_CONFIRMATION_MESSAGE);

  // Paywall gate (LDTKB-016), counted in lessons: a learner waiting at
  // Lesson 8 gets it straight away. One who pays early just carries on —
  // Lesson 8 follows Lesson 7 whenever they get there.
  const now = deps.now ? deps.now() : new Date();
  if (learner.paid_course_start_date === null) {
    await deps.store.update(learner.id, { paid_course_start_date: todayInBangkok(now) });
  }
  const session = sessionDeps(deps);
  if (session && learner.onboarding_step === "complete" && learner.next_lesson_number === 8) {
    await startSession({ ...learner, paid_course_start_date: todayInBangkok(now) }, chatId, session);
  }
}

async function handlePaySupport(message: NonNullable<TelegramUpdate["message"]>, deps: HandleUpdateDeps): Promise<void> {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;

  const learner = await deps.store.findByTelegramId(telegramUserId);
  if (!learner) return; // /paysupport before ever /start-ing — no learner row to attach a request to

  if (!learner.awaiting_paysupport_request_since) {
    const now = deps.now ? deps.now() : new Date();
    await deps.store.update(learner.id, { awaiting_paysupport_request_since: now.toISOString() });
  }
  // Already pending: fall through and re-send the same prompt without
  // touching state again — no stacking, no duplicate pending state.

  await deps.telegram.sendMessage(chatId, PAYSUPPORT_PROMPT_MESSAGE);
}

/**
 * Admin-only — silently ignored (same as an unrecognized command) if the
 * sender isn't the configured admin. Refund eligibility (LDTKB-063) is
 * Joule's own judgment call made before ever sending this command; this
 * handler is purely the execution step — look up, refund, record, notify.
 */
async function handleRefund(message: NonNullable<TelegramUpdate["message"]>, deps: HandleUpdateDeps): Promise<void> {
  const telegramUserId = message.from.id;
  if (deps.adminTelegramUserId === null || telegramUserId !== deps.adminTelegramUserId) return;

  const chatId = message.chat.id;
  const chargeId = (message.text ?? "").trim().split(/\s+/)[1];
  if (!chargeId) return; // malformed — no charge id given, nothing sensible to do

  const purchase = await deps.purchasesStore.findByChargeId(chargeId);
  if (!purchase || purchase.status === "refunded") return; // unknown charge id, or already refunded

  const learner = await deps.store.findById(purchase.learner_id);
  if (!learner) return; // defensive: shouldn't happen — learner_id has a foreign-key constraint

  await deps.telegram.refundStarPayment(learner.telegram_user_id, chargeId);

  const now = deps.now ? deps.now() : new Date();
  await deps.purchasesStore.markRefunded(purchase.id, now.toISOString());

  // Day 8 paywall gate (LDTKB-016): if this learner had crossed the paywall,
  // a refund puts them back behind it — clear the anchor so they fall back
  // to the gate (the next cron tick re-sends the check-in if they're past
  // Day 7, or their next message does if they'd already been prompted
  // before). This is what makes a refund-then-rebuy test behave correctly.
  if (learner.paid_course_start_date !== null) {
    await deps.store.update(learner.id, { paid_course_start_date: null });
  }

  await deps.telegram.sendMessage(
    chatId,
    `✅ Refunded charge ${chargeId} for learner (Telegram ID: ${learner.telegram_user_id}).`,
  );
  await deps.telegram.sendMessage(learner.telegram_user_id, REFUND_ISSUED_MESSAGE);
}

async function resendCurrentStep(learner: Learner, chatId: number, deps: HandleUpdateDeps, firstName?: string): Promise<void> {
  const survey = SURVEY_QUESTIONS.find((q) => q.step === learner.onboarding_step);
  if (survey) {
    await deps.telegram.sendMessage(chatId, survey.text, surveyKeyboard(survey));
    return;
  }
  switch (learner.onboarding_step) {
    case "name_pending":
      await deps.telegram.sendMessage(chatId, LEAN_WELCOME_MESSAGE, nameKeyboard(firstName));
      return;
    case "gender_pending":
      await deps.telegram.sendMessage(chatId, GENDER_QUESTION_MESSAGE, GENDER_QUESTION_KEYBOARD);
      return;
    case "first_lesson": {
      const session = sessionDeps(deps);
      if (session) await startSession(learner, chatId, session);
      return;
    }
    case "schedule_period_pending":
      await deps.telegram.sendMessage(chatId, REMINDER_PERIOD_MESSAGE, SCHEDULE_PERIOD_KEYBOARD);
      return;
    case "schedule_time_pending":
      if (!learner.schedule_period) return; // defensive: shouldn't happen
      await deps.telegram.sendMessage(
        chatId,
        SCHEDULE_TIME_MESSAGE,
        scheduleTimeKeyboard(learner.schedule_period),
      );
      return;
  }
}

async function handleCallbackQuery(
  callbackQuery: NonNullable<TelegramUpdate["callback_query"]>,
  deps: HandleUpdateDeps,
): Promise<void> {
  // Acknowledge immediately regardless of outcome, so Telegram clears the
  // button's loading spinner even for stale/invalid callbacks.
  await deps.telegram.answerCallbackQuery(callbackQuery.id);

  const chatId = callbackQuery.message?.chat.id;
  const data = callbackQuery.data;
  if (chatId === undefined || !data) return;

  const learner = await deps.store.findByTelegramId(callbackQuery.from.id);
  if (!learner) return; // stale callback, no learner row — nothing sensible to do

  const separatorIndex = data.indexOf(":");
  if (separatorIndex === -1) return;
  const kind = data.slice(0, separatorIndex);
  const value = data.slice(separatorIndex + 1);

  if (kind === "name") {
    if (learner.onboarding_step === "name_pending" && value === "tg") {
      await saveNameAndContinue(learner, callbackQuery.from.first_name ?? "", chatId, deps);
    }
    return;
  }
  if (kind === "gender") {
    await handleGenderSelection(learner, value, chatId, deps);
    return;
  }
  const survey = SURVEY_QUESTIONS.find((q) => q.prefix === kind);
  if (survey) {
    await handleSurveyAnswer(learner, survey, value, chatId, deps);
    return;
  }
  if (kind === "q") {
    const [promptId, chosen] = value.split(":").map(Number);
    const session = sessionDeps(deps);
    if (session && Number.isInteger(promptId) && Number.isInteger(chosen)) {
      await handleQuizAnswer(learner, promptId, chosen, chatId, callbackQuery.message?.message_id, session);
    }
    return;
  }
  if (kind === "next") {
    await startNextLesson(learner, chatId, deps);
    return;
  }
  if (kind === "more") {
    await handleMore(learner, Number(value), chatId, deps);
    return;
  }
  if (kind === "period") {
    await handlePeriodSelection(learner, value, chatId, deps);
    return;
  }
  if (kind === "time") {
    await handleTimeSelection(learner, value, chatId, deps);
    return;
  }
}

async function handleGenderSelection(
  learner: Learner,
  value: string,
  chatId: number,
  deps: HandleUpdateDeps,
): Promise<void> {
  if (learner.onboarding_step !== "gender_pending") return; // out-of-order/stale
  if (!VALID_GENDERS.has(value)) return;

  const first = SURVEY_QUESTIONS[0];
  await deps.store.update(learner.id, {
    gender_branch: value as "male" | "female",
    onboarding_step: first.step,
  });
  await deps.telegram.sendMessage(chatId, `${SURVEY_INTRO}\n\n${first.text}`, surveyKeyboard(first));
}

async function saveNameAndContinue(learner: Learner, rawName: string, chatId: number, deps: HandleUpdateDeps): Promise<void> {
  const name = cleanName(rawName);
  if (!name || name.startsWith("/")) {
    await deps.telegram.sendMessage(chatId, "Just type the name you'd like me to use 😊");
    return;
  }
  await deps.store.update(learner.id, { display_name: name, onboarding_step: "gender_pending" });
  await deps.telegram.sendMessage(chatId, niceToMeetYou(name));
  await deps.telegram.sendMessage(chatId, GENDER_QUESTION_MESSAGE, GENDER_QUESTION_KEYBOARD);
}

async function handleSurveyAnswer(
  learner: Learner,
  question: SurveyQuestion,
  value: string,
  chatId: number,
  deps: HandleUpdateDeps,
): Promise<void> {
  if (learner.onboarding_step !== question.step) return; // out-of-order/stale
  if (!question.options.some((o) => o.value === value)) return;

  const index = SURVEY_QUESTIONS.indexOf(question);
  const next = SURVEY_QUESTIONS[index + 1];
  if (next) {
    await deps.store.update(learner.id, { [question.column]: value, onboarding_step: next.step });
    await deps.telegram.sendMessage(chatId, next.text, surveyKeyboard(next));
    return;
  }

  // Survey done: Lesson 1 starts right now, no waiting for tomorrow.
  const updated = await deps.store.update(learner.id, { [question.column]: value, onboarding_step: "first_lesson" });
  await deps.telegram.sendMessage(chatId, firstWordMessage(updated.display_name));
  const session = sessionDeps(deps);
  if (session) await startSession(updated, chatId, session);
}

async function handlePeriodSelection(
  learner: Learner,
  value: string,
  chatId: number,
  deps: HandleUpdateDeps,
): Promise<void> {
  if (learner.onboarding_step !== "schedule_period_pending") return;
  if (!VALID_PERIODS.has(value)) return;

  const period = value as SchedulePeriod;
  await deps.store.update(learner.id, {
    schedule_period: period,
    onboarding_step: "schedule_time_pending",
  });
  await deps.telegram.sendMessage(chatId, SCHEDULE_TIME_MESSAGE, scheduleTimeKeyboard(period));
}

async function handleTimeSelection(
  learner: Learner,
  value: string,
  chatId: number,
  deps: HandleUpdateDeps,
): Promise<void> {
  if (learner.onboarding_step !== "schedule_time_pending") return;
  if (!learner.schedule_period) return; // defensive: shouldn't happen
  if (!isValidTimeForPeriod(learner.schedule_period, value)) return;

  const now = deps.now ? deps.now() : new Date();
  await deps.store.update(learner.id, {
    schedule_time: value,
    onboarding_step: "complete",
    onboarding_completed_at: now.toISOString(),
    pilot_start_date: todayInBangkok(now),
  });

  // LDTKB-005/028: passive notification test, no gate — now for the reminder.
  await deps.telegram.sendMessage(chatId, REMINDER_NOTIFICATION_TEST_MESSAGE);
  await deps.telegram.sendMessage(chatId, readyMessage(learner.display_name), NEXT_LESSON_KEYBOARD);
}

/**
 * The Thailand-local (UTC+7) calendar date for `date`, as YYYY-MM-DD.
 * Computed via UTC arithmetic so it doesn't depend on the server's own
 * timezone setting.
 */
export function todayInBangkok(date: Date): string {
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = bangkok.getUTCFullYear();
  const mm = String(bangkok.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bangkok.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
