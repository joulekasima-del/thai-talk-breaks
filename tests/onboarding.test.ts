import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { handleUpdate, todayInBangkok } from "@/lib/onboarding/handleUpdate";
import {
  ALREADY_ONBOARDED_MESSAGE,
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

test("new learner: /start sends welcome + gender question, creates row in gender_pending", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(111), deps);

  assert.equal(deps.telegram.sent.length, 2);
  assert.equal(deps.telegram.sent[0].text, WELCOME_MESSAGE);
  assert.equal(deps.telegram.sent[0].keyboard, undefined);
  // LDTKB-053/054: the welcome message is the only one sent with HTML
  // formatting — its <b>/<i> tags never rendered until this fix.
  assert.equal(deps.telegram.sent[0].parseMode, "HTML");
  assert.equal(deps.telegram.sent[1].text, GENDER_QUESTION_MESSAGE);
  assert.ok(deps.telegram.sent[1].keyboard);
  // Guard against an accidental global change: every other message (the
  // gender question here) must still send with no formatting parameter.
  assert.equal(deps.telegram.sent[1].parseMode, undefined);

  const learner = await deps.store.findByTelegramId(111);
  assert.equal(learner?.onboarding_step, "gender_pending");
});

test("full onboarding flow: gender -> period -> time reaches complete with correct data", async () => {
  const deps = makeDeps(new Date("2026-08-21T13:00:00.000Z")); // 20:00 Bangkok, same calendar day
  await handleUpdate(startUpdate(222), deps);

  await handleUpdate(callbackUpdate(222, "gender:male"), deps);
  let learner = await deps.store.findByTelegramId(222);
  assert.equal(learner?.gender_branch, "male");
  assert.equal(learner?.onboarding_step, "schedule_period_pending");
  assert.equal(deps.telegram.sent.at(-1)?.text, SCHEDULE_PERIOD_MESSAGE);

  await handleUpdate(callbackUpdate(222, "period:evening"), deps);
  learner = await deps.store.findByTelegramId(222);
  assert.equal(learner?.schedule_period, "evening");
  assert.equal(learner?.onboarding_step, "schedule_time_pending");
  assert.equal(deps.telegram.sent.at(-1)?.text, SCHEDULE_TIME_MESSAGE);
  const timeButtons = deps.telegram.sent.at(-1)?.keyboard?.[0].map((b) => b.text);
  assert.deepEqual(timeButtons, ["18:00", "19:00", "20:00", "21:00"]);

  await handleUpdate(callbackUpdate(222, "time:19:00"), deps);
  learner = await deps.store.findByTelegramId(222);
  assert.equal(learner?.schedule_time, "19:00");
  assert.equal(learner?.onboarding_step, "complete");
  assert.equal(learner?.pilot_start_date, "2026-08-21");
  assert.ok(learner?.onboarding_completed_at);

  const lastTwo = deps.telegram.sent.slice(-2).map((m) => m.text);
  assert.deepEqual(lastTwo, [NOTIFICATION_TEST_MESSAGE, ONBOARDING_COMPLETE_MESSAGE]);

  // Every callback in this flow must have been acknowledged.
  assert.equal(deps.telegram.answeredCallbackIds.length, 3);
});

test("time selection rejects a time that doesn't belong to the stored period", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(333), deps);
  await handleUpdate(callbackUpdate(333, "gender:female"), deps);
  await handleUpdate(callbackUpdate(333, "period:morning"), deps);
  const messagesBefore = deps.telegram.sent.length;

  // "20:00" is an evening slot, not a morning one — must be ignored.
  await handleUpdate(callbackUpdate(333, "time:20:00"), deps);

  const learner = await deps.store.findByTelegramId(333);
  assert.equal(learner?.onboarding_step, "schedule_time_pending");
  assert.equal(learner?.schedule_time, null);
  assert.equal(deps.telegram.sent.length, messagesBefore, "no new message should be sent");
  // Still acknowledged, so Telegram clears the button spinner.
  assert.equal(deps.telegram.answeredCallbackIds.at(-1), "cb-time:20:00");
});

test("already-onboarded learner sending /start gets the not-locked already-set message, not welcome again", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(444), deps);
  await handleUpdate(callbackUpdate(444, "gender:male"), deps);
  await handleUpdate(callbackUpdate(444, "period:morning"), deps);
  await handleUpdate(callbackUpdate(444, "time:08:00"), deps);

  const countBefore = deps.telegram.sent.length;
  await handleUpdate(startUpdate(444), deps);

  assert.equal(deps.telegram.sent.length, countBefore + 1);
  assert.equal(deps.telegram.sent.at(-1)?.text, ALREADY_ONBOARDED_MESSAGE);
});

test("mid-onboarding learner sending /start again resumes at the current step, not from welcome", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(555), deps);
  await handleUpdate(callbackUpdate(555, "gender:male"), deps);
  // Learner is now schedule_period_pending; imagine they send /start again.
  await handleUpdate(startUpdate(555), deps);

  assert.equal(deps.telegram.sent.at(-1)?.text, SCHEDULE_PERIOD_MESSAGE);
  assert.equal(
    deps.telegram.sent.filter((m) => m.text === WELCOME_MESSAGE).length,
    1,
    "welcome message must not be re-sent",
  );
});

test("out-of-order callback (e.g. replaying an old gender button) is ignored", async () => {
  const deps = makeDeps();
  await handleUpdate(startUpdate(666), deps);
  await handleUpdate(callbackUpdate(666, "gender:male"), deps); // now schedule_period_pending
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
