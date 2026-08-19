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

import type { TelegramClient, TelegramUpdate } from "@/lib/telegram";
import type { Learner, LearnerStore, SchedulePeriod } from "@/lib/onboarding/learnerStore";
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

export interface HandleUpdateDeps {
  store: LearnerStore;
  telegram: TelegramClient;
  /** Injectable clock, for deterministic tests. Defaults to `new Date()`. */
  now?: () => Date;
}

const VALID_GENDERS = new Set(["male", "female"]);
const VALID_PERIODS = new Set(["morning", "afternoon", "evening"]);

export async function handleUpdate(update: TelegramUpdate, deps: HandleUpdateDeps): Promise<void> {
  if (update.message?.text?.startsWith("/start")) {
    await handleStart(update.message, deps);
    return;
  }
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query, deps);
    return;
  }
  // Anything else (other commands, plain text, etc.) is silently ignored in
  // this checkpoint — no free-text or non-onboarding command handling is in
  // scope here.
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

  if (learner.onboarding_step === "complete") {
    // Design choice — not a locked message. See report item 9.
    await deps.telegram.sendMessage(chatId, ALREADY_ONBOARDED_MESSAGE);
    return;
  }

  // Mid-onboarding: resume at the current step rather than restarting.
  await resendCurrentStep(learner, chatId, deps);
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
