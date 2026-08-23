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

import type { TelegramClient, TelegramUpdate } from "@/lib/telegram";
import type { Learner, LearnerStore, SchedulePeriod } from "@/lib/onboarding/learnerStore";
import type { OopsReportsStore } from "@/lib/oops/oopsReportsStore";
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

export interface HandleUpdateDeps {
  store: LearnerStore;
  telegram: TelegramClient;
  oopsReportsStore: OopsReportsStore;
  /** Telegram user id to DM new /oops reports to. Null if ADMIN_TELEGRAM_USER_ID isn't set — the report is still saved, just no DM is attempted. */
  adminTelegramUserId: number | null;
  /** Injectable clock, for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
}

const VALID_GENDERS = new Set(["male", "female"]);
const VALID_PERIODS = new Set(["morning", "afternoon", "evening"]);

export async function handleUpdate(update: TelegramUpdate, deps: HandleUpdateDeps): Promise<void> {
  const text = update.message?.text;

  if (text?.startsWith("/start")) {
    await handleStart(update.message!, deps);
    return;
  }
  if (text?.startsWith("/oops")) {
    await handleOops(update.message!, deps);
    return;
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, deps);
    return;
  }
  if (update.message && text !== undefined) {
    // Only meaningful when a report is pending (captured below); otherwise
    // silently ignored, exactly as before /oops existed.
    await maybeCaptureOopsReport(update.message, deps);
    return;
  }
  // Anything else (non-text messages, other commands, etc.) is silently
  // ignored — no free-text or non-onboarding command handling beyond /oops
  // is in scope here.
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
    await deps.telegram.sendMessage(chatId, WELCOME_MESSAGE);
    await deps.telegram.sendMessage(chatId, GENDER_QUESTION_MESSAGE, GENDER_QUESTION_KEYBOARD);
    return;
  }

  if (learner.awaiting_oops_report_since) {
    // /start while a report is pending: don't leave the learner stuck
    // unable to /start normally — clear it, then fall through to /start's
    // existing behavior exactly as if nothing had been pending.
    learner = await deps.store.update(learner.id, { awaiting_oops_report_since: null });
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

async function maybeCaptureOopsReport(
  message: NonNullable<TelegramUpdate["message"]>,
  deps: HandleUpdateDeps,
): Promise<void> {
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;
  const text = message.text;
  if (text === undefined) return;

  const learner = await deps.store.findByTelegramId(telegramUserId);
  if (!learner || !learner.awaiting_oops_report_since) return; // no pending report — silently ignored

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
