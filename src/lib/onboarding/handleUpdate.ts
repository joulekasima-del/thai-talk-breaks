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
//                               purchases row, confirms the learner.
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

import type { TelegramClient, TelegramMessage, TelegramPreCheckoutQuery, TelegramUpdate } from "@/lib/telegram";
import type { Learner, LearnerStore, SchedulePeriod } from "@/lib/onboarding/learnerStore";
import type { OopsReportsStore } from "@/lib/oops/oopsReportsStore";
import type { PurchasesStore } from "@/lib/payments/purchasesStore";
import type { PaymentSupportStore } from "@/lib/payments/paymentSupportStore";
import {
  ALREADY_ONBOARDED_MESSAGE,
  GENDER_QUESTION_KEYBOARD,
  GENDER_QUESTION_MESSAGE,
  NOTIFICATION_TEST_MESSAGE,
  ONBOARDING_COMPLETE_MESSAGE,
  SCHEDULE_PERIOD_KEYBOARD,
  SCHEDULE_PERIOD_MESSAGE,
  SCHEDULE_TIME_MESSAGE,
  WELCOME_MESSAGE,
  isValidTimeForPeriod,
  scheduleTimeKeyboard,
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
    // LDTKB-053/054: the only message in the product sent with HTML
    // formatting — see telegram.ts's sendMessage signature.
    await deps.telegram.sendMessage(chatId, WELCOME_MESSAGE, undefined, "HTML");
    await deps.telegram.sendMessage(chatId, GENDER_QUESTION_MESSAGE, GENDER_QUESTION_KEYBOARD);
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
    // Design choice — not a locked message. See report item 9.
    await deps.telegram.sendMessage(chatId, ALREADY_ONBOARDED_MESSAGE);
    return;
  }

  // Mid-onboarding: resume at the current step rather than restarting.
  await resendCurrentStep(learner, chatId, deps);
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

  await deps.telegram.sendMessage(
    chatId,
    `✅ Refunded charge ${chargeId} for learner (Telegram ID: ${learner.telegram_user_id}).`,
  );
  await deps.telegram.sendMessage(learner.telegram_user_id, REFUND_ISSUED_MESSAGE);
}

async function resendCurrentStep(learner: Learner, chatId: number, deps: HandleUpdateDeps): Promise<void> {
  switch (learner.onboarding_step) {
    case "gender_pending":
      await deps.telegram.sendMessage(chatId, GENDER_QUESTION_MESSAGE, GENDER_QUESTION_KEYBOARD);
      return;
    case "schedule_period_pending":
      await deps.telegram.sendMessage(chatId, SCHEDULE_PERIOD_MESSAGE, SCHEDULE_PERIOD_KEYBOARD);
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

  if (kind === "gender") {
    await handleGenderSelection(learner, value, chatId, deps);
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

  await deps.store.update(learner.id, {
    gender_branch: value as "male" | "female",
    onboarding_step: "schedule_period_pending",
  });
  await deps.telegram.sendMessage(chatId, SCHEDULE_PERIOD_MESSAGE, SCHEDULE_PERIOD_KEYBOARD);
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

  await deps.store.update(learner.id, { schedule_time: value });

  // LDTKB-028: passive, no gate — sent regardless of any learner reaction.
  await deps.telegram.sendMessage(chatId, NOTIFICATION_TEST_MESSAGE);
  // LDTKB-036: immediately after the notification test.
  await deps.telegram.sendMessage(chatId, ONBOARDING_COMPLETE_MESSAGE);

  const now = deps.now ? deps.now() : new Date();
  await deps.store.update(learner.id, {
    onboarding_step: "complete",
    onboarding_completed_at: now.toISOString(),
    pilot_start_date: todayInBangkok(now),
  });
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
