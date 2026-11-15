import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { handleUpdate, todayInBangkok } from "@/lib/onboarding/handleUpdate";
import {
  ALREADY_ONBOARDED_NEXT_MESSAGE,
  LEAN_WELCOME_MESSAGE,
  REMINDER_NOTIFICATION_TEST_MESSAGE,
  SURVEY_INTRO,
  SURVEY_QUESTIONS,
  firstWordMessage,
  niceToMeetYou,
  readyMessage,
  GENDER_QUESTION_MESSAGE,
  NOTIFICATION_TEST_MESSAGE,
  ONBOARDING_COMPLETE_MESSAGE,
  SCHEDULE_PERIOD_MESSAGE,
  SCHEDULE_TIME_MESSAGE,
  WELCOME_MESSAGE,
} from "@/lib/onboarding/content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeOopsReportsStore } from "./oopsFakes";
import { FakePaymentSupportStore, FakePurchasesStore } from "./paymentsFakes";
import type { TelegramUpdate } from "@/lib/telegram";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Extracts the content of the first fenced code block in a markdown file. */
function fencedBlock(relativePath: string): string {
  const raw = readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
  const match = raw.match(/```\n([\s\S]*?)```/);
  if (!match) throw new Error(`No fenced code block found in ${relativePath}`);
  // Drop exactly the one trailing newline before the closing fence; the
  // source files always end their fence on its own line.
  return match[1].replace(/\n$/, "");
}

// --- Regression check: content.ts must match onboarding/*.md byte-for-byte ---
// This re-derives the expected text directly from the locked source files,
// independent of any manual copy-paste, per the checkpoint's requirement to
// verify (not just assert) that the locked copy is implemented verbatim.

test("locked message text matches onboarding/*.md verbatim", () => {
  assert.equal(WELCOME_MESSAGE, fencedBlock("onboarding/welcome-message.md"));
  assert.equal(GENDER_QUESTION_MESSAGE, fencedBlock("onboarding/gender-question.md"));
  assert.equal(NOTIFICATION_TEST_MESSAGE, fencedBlock("onboarding/notification-test.md"));
  assert.equal(ONBOARDING_COMPLETE_MESSAGE, fencedBlock("onboarding/onboarding-complete.md"));

  const scheduleSource = readFileSync(
    path.join(REPO_ROOT, "onboarding/schedule-selection.md"),
    "utf8",
  );
  const blocks = [...scheduleSource.matchAll(/```\n([\s\S]*?)```/g)].map((m) =>
    m[1].replace(/\n$/, ""),
  );
  assert.equal(blocks.length, 2, "expected exactly 2 fenced blocks in schedule-selection.md");
  assert.equal(SCHEDULE_PERIOD_MESSAGE, blocks[0]);
  assert.equal(SCHEDULE_TIME_MESSAGE, blocks[1]);
});

function makeDeps(now = new Date("2026-08-21T03:00:00.000Z")) {
  return {
    store: new FakeLearnerStore(),
    telegram: new FakeTelegramClient(),
    oopsReportsStore: new FakeOopsReportsStore(),
    // Stage 5 (LDTKB-014): HandleUpdateDeps now requires these two — this
    // file's tests never exercise payments, but the type requires them.
    purchasesStore: new FakePurchasesStore(),
    paymentSupportStore: new FakePaymentSupportStore(),
    adminTelegramUserId: null,
    now: () => now,
  };
}

let nextUpdateId = 1;

function startUpdate(telegramUserId: number, chatId = telegramUserId): TelegramUpdate {
  return { update_id: nextUpdateId++, message: { text: "/start", chat: { id: chatId }, from: { id: telegramUserId } } };
}

function callbackUpdate(telegramUserId: number, data: string, chatId = telegramUserId): TelegramUpdate {
  return {
    update_id: nextUpdateId++,
    callback_query: {
      id: `cb-${data}`,
      data,
      from: { id: telegramUserId },
      message: { chat: { id: chatId } },
    },
  };
}

function textUpdate(telegramUserId: number, text: string, firstName?: string): TelegramUpdate {
  return { update_id: nextUpdateId++, message: { text, chat: { id: telegramUserId }, from: { id: telegramUserId, first_name: firstName } } };
}

const SURVEY_TAPS = ["loc:live", "lvl:beginner", "why:daily", "src:telegram"];

test("new learner: /start sends one short welcome asking for a name, with a 'Call me' button", async () => {
  const deps = makeDeps();
  await handleUpdate(textUpdate(111, "/start", "Joule"), deps);

  assert.equal(deps.telegram.sent.length, 1);
  assert.equal(deps.telegram.sent[0].text, LEAN_WELCOME_MESSAGE);
  assert.equal(deps.telegram.sent[0].parseMode, undefined);
  assert.deepEqual(deps.telegram.sent[0].keyboard, [[{ text: "Call me Joule", callback_data: "name:tg" }]]);

  const learner = await deps.store.findByTelegramId(111);
  assert.equal(learner?.onboarding_step, "name_pending");
});

test("a typed name is saved (trimmed) and the krap/ka question follows", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(112), deps);
  await handleUpdate(textUpdate(112, "   Sam   Smith  "), deps);

  const learner = await deps.store.findByTelegramId(112);
  assert.equal(learner?.display_name, "Sam Smith");
  assert.equal(learner?.onboarding_step, "gender_pending");
  assert.deepEqual(deps.telegram.sent.slice(-2).map((m) => m.text), [niceToMeetYou("Sam Smith"), GENDER_QUESTION_MESSAGE]);
});

test("'Call me <first name>' uses the Telegram first name", async () => {
  const deps = makeDeps();
  await handleUpdate(textUpdate(113, "/start", "Ploy"), deps);
  await handleUpdate(
    { update_id: nextUpdateId++, callback_query: { id: "cb-name", data: "name:tg", from: { id: 113, first_name: "Ploy" }, message: { chat: { id: 113 } } } },
    deps,
  );
  const learner = await deps.store.findByTelegramId(113);
  assert.equal(learner?.display_name, "Ploy");
  assert.equal(learner?.onboarding_step, "gender_pending");
});

test("full onboarding: name -> gender -> 4 survey taps reaches first_lesson with every answer stored", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(222), deps);
  await handleUpdate(textUpdate(222, "Alex"), deps);
  await handleUpdate(callbackUpdate(222, "gender:male"), deps);

  let learner = await deps.store.findByTelegramId(222);
  assert.equal(learner?.gender_branch, "male");
  assert.equal(learner?.onboarding_step, "survey_location_pending");
  assert.equal(deps.telegram.sent.at(-1)?.text, `${SURVEY_INTRO}\n\n${SURVEY_QUESTIONS[0].text}`);

  for (const [i, tap] of SURVEY_TAPS.entries()) {
    await handleUpdate(callbackUpdate(222, tap), deps);
    if (i < 3) assert.equal(deps.telegram.sent.at(-1)?.text, SURVEY_QUESTIONS[i + 1].text);
  }

  learner = await deps.store.findByTelegramId(222);
  assert.equal(learner?.survey_location, "live");
  assert.equal(learner?.survey_level, "beginner");
  assert.equal(learner?.survey_reason, "daily");
  assert.equal(learner?.survey_source, "telegram");
  assert.equal(learner?.onboarding_step, "first_lesson");
  assert.equal(deps.telegram.sent.at(-1)?.text, firstWordMessage("Alex"));
});

test("a survey tap for the wrong step (stale button) is ignored", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(223), deps);
  await handleUpdate(textUpdate(223, "Alex"), deps);
  await handleUpdate(callbackUpdate(223, "gender:female"), deps);
  const before = deps.telegram.sent.length;
  await handleUpdate(callbackUpdate(223, "why:travel"), deps); // question 3 while on question 1
  const learner = await deps.store.findByTelegramId(223);
  assert.equal(learner?.survey_reason, null);
  assert.equal(learner?.onboarding_step, "survey_location_pending");
  assert.equal(deps.telegram.sent.length, before);
});

test("reminder time (asked after Lesson 1): period -> time completes onboarding and offers the next lesson", async () => {
  const deps = makeDeps(new Date("2026-08-21T13:00:00.000Z")); // 20:00 Bangkok, same calendar day
  await handleUpdate(startUpdate(224), deps);
  await handleUpdate(textUpdate(224, "Alex"), deps);
  const created = await deps.store.findByTelegramId(224);
  await deps.store.update(created!.id, { gender_branch: "male", onboarding_step: "schedule_period_pending" });

  await handleUpdate(callbackUpdate(224, "period:evening"), deps);
  assert.equal(deps.telegram.sent.at(-1)?.text, SCHEDULE_TIME_MESSAGE);
  const timeButtons = deps.telegram.sent.at(-1)?.keyboard?.[0].map((b) => b.text);
  assert.deepEqual(timeButtons, ["18:00", "19:00", "20:00", "21:00"]);

  await handleUpdate(callbackUpdate(224, "time:19:00"), deps);
  const learner = await deps.store.findByTelegramId(224);
  assert.equal(learner?.schedule_time, "19:00");
  assert.equal(learner?.onboarding_step, "complete");
  assert.equal(learner?.pilot_start_date, "2026-08-21");
  assert.ok(learner?.onboarding_completed_at);

  const lastTwo = deps.telegram.sent.slice(-2);
  assert.equal(lastTwo[0].text, REMINDER_NOTIFICATION_TEST_MESSAGE);
  assert.equal(lastTwo[1].text, readyMessage("Alex"));
  assert.deepEqual(lastTwo[1].keyboard, [[{ text: "▶️ Next lesson", callback_data: "next:1" }]]);
});

test("time selection rejects a time that doesn't belong to the stored period", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(333), deps);
  const created = await deps.store.findByTelegramId(333);
  await deps.store.update(created!.id, { gender_branch: "female", onboarding_step: "schedule_period_pending" });
  await handleUpdate(callbackUpdate(333, "period:morning"), deps);
  const messagesBefore = deps.telegram.sent.length;

  // "20:00" is an evening slot, not a morning one — must be ignored.
  await handleUpdate(callbackUpdate(333, "time:20:00"), deps);

  const learner = await deps.store.findByTelegramId(333);
  assert.equal(learner?.onboarding_step, "schedule_time_pending");
  assert.equal(learner?.schedule_time, null);
  assert.equal(deps.telegram.sent.length, messagesBefore, "no new message should be sent");
  assert.equal(deps.telegram.answeredCallbackIds.at(-1), "cb-time:20:00");
});

test("already-onboarded learner sending /start gets the already-set message with a Next lesson button", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(444), deps);
  const created = await deps.store.findByTelegramId(444);
  await deps.store.update(created!.id, { gender_branch: "male", onboarding_step: "complete" });

  const countBefore = deps.telegram.sent.length;
  await handleUpdate(startUpdate(444), deps);

  assert.equal(deps.telegram.sent.length, countBefore + 1);
  assert.equal(deps.telegram.sent.at(-1)?.text, ALREADY_ONBOARDED_NEXT_MESSAGE);
  assert.ok(deps.telegram.sent.at(-1)?.keyboard);
});

test("mid-onboarding learner sending /start again resumes at the current step, not from welcome", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(555), deps);
  await handleUpdate(textUpdate(555, "Kim"), deps);
  await handleUpdate(callbackUpdate(555, "gender:male"), deps);
  await handleUpdate(startUpdate(555), deps);

  assert.equal(deps.telegram.sent.at(-1)?.text, SURVEY_QUESTIONS[0].text);
  assert.equal(deps.telegram.sent.filter((m) => m.text === LEAN_WELCOME_MESSAGE).length, 1, "welcome must not be re-sent");
});

test("out-of-order callback (e.g. replaying an old gender button) is ignored", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(666), deps);
  await handleUpdate(textUpdate(666, "Kim"), deps);
  await handleUpdate(callbackUpdate(666, "gender:male"), deps);
  const countBefore = deps.telegram.sent.length;

  await handleUpdate(callbackUpdate(666, "gender:female"), deps); // stale replay

  const learner = await deps.store.findByTelegramId(666);
  assert.equal(learner?.gender_branch, "male", "original selection must be preserved");
  assert.equal(deps.telegram.sent.length, countBefore, "no new message for a stale callback");
});

test("todayInBangkok converts UTC correctly across the day boundary", () => {
  // 16:59 UTC = 23:59 Bangkok, same calendar day.
  assert.equal(todayInBangkok(new Date("2026-08-21T16:59:00.000Z")), "2026-08-21");
  // 17:00 UTC = 00:00 Bangkok, next calendar day.
  assert.equal(todayInBangkok(new Date("2026-08-21T17:00:00.000Z")), "2026-08-22");
});
