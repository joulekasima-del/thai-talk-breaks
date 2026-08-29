import { test } from "node:test";
import assert from "node:assert/strict";

import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import { OOPS_CONFIRMATION_MESSAGE, OOPS_PROMPT_MESSAGE } from "@/lib/oops/content";
import { GENDER_QUESTION_MESSAGE } from "@/lib/onboarding/content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeOopsReportsStore } from "./oopsFakes";
import type { TelegramUpdate } from "@/lib/telegram";

let nextUpdateId = 1;

function textUpdate(telegramUserId: number, text: string, chatId = telegramUserId): TelegramUpdate {
  return { update_id: nextUpdateId++, message: { text, chat: { id: chatId }, from: { id: telegramUserId } } };
}

function makeDeps(adminTelegramUserId: number | null = null, now = new Date("2026-08-23T03:00:00.000Z")) {
  return {
    store: new FakeLearnerStore(),
    telegram: new FakeTelegramClient(),
    oopsReportsStore: new FakeOopsReportsStore(),
    adminTelegramUserId,
    now: () => now,
  };
}

// --- Locked copy, reproduced verbatim from the /oops feature spec ---------

test("locked /oops copy matches the spec verbatim", () => {
  assert.equal(OOPS_PROMPT_MESSAGE, "What's going on? Just type it out and send it — I'll take a look. 🐛");
  assert.equal(
    OOPS_CONFIRMATION_MESSAGE,
    "Got it! 🙏 I've noted this down — no need to wait for a reply, just carry on with your lessons. Thank you for helping make Thai Talk Breaks better! 💛",
  );
});

// --- /oops alone: prompts and sets pending state ---------------------------

test("/oops from an onboarded learner sends the prompt and sets awaiting_oops_report_since", async () => {
  const deps = makeDeps();
  await deps.store.create(111);
  await deps.store.update((await deps.store.findByTelegramId(111))!.id, { onboarding_step: "complete" });

  await handleUpdate(textUpdate(111, "/oops"), deps);

  assert.equal(deps.telegram.sent.length, 1);
  assert.equal(deps.telegram.sent[0].text, OOPS_PROMPT_MESSAGE);

  const learner = await deps.store.findByTelegramId(111);
  assert.ok(learner!.awaiting_oops_report_since, "pending flag must be set after /oops");
});

test("/oops from a mid-onboarding learner works too — independent of onboarding_step", async () => {
  const deps = makeDeps();
  await deps.store.create(222); // starts gender_pending

  await handleUpdate(textUpdate(222, "/oops"), deps);

  const learner = await deps.store.findByTelegramId(222);
  assert.equal(learner!.onboarding_step, "gender_pending", "onboarding_step must be untouched by /oops");
  assert.ok(learner!.awaiting_oops_report_since);
  assert.equal(deps.telegram.sent[0].text, OOPS_PROMPT_MESSAGE);
});

test("/oops from a learner with no row at all (never /start-ed) is silently ignored", async () => {
  const deps = makeDeps();
  await handleUpdate(textUpdate(999, "/oops"), deps);
  assert.equal(deps.telegram.sent.length, 0);
});

// --- /oops while already pending: re-prompt, no stacking -------------------

test("/oops while already pending re-sends the same prompt without stacking or changing the pending timestamp", async () => {
  // Advancing clock across the two calls — if a repeated /oops re-wrote the
  // timestamp, this would catch it (a fixed clock wouldn't distinguish
  // "re-written with the same value" from "never touched again").
  let callCount = 0;
  const deps = { ...makeDeps(), now: () => new Date(callCount++ === 0 ? "2026-08-23T03:00:00.000Z" : "2026-08-23T04:00:00.000Z") };
  await deps.store.create(333);

  await handleUpdate(textUpdate(333, "/oops"), deps);
  const firstPending = (await deps.store.findByTelegramId(333))!.awaiting_oops_report_since;

  await handleUpdate(textUpdate(333, "/oops"), deps);
  const secondPending = (await deps.store.findByTelegramId(333))!.awaiting_oops_report_since;

  assert.equal(deps.telegram.sent.length, 2);
  assert.equal(deps.telegram.sent[0].text, OOPS_PROMPT_MESSAGE);
  assert.equal(deps.telegram.sent[1].text, OOPS_PROMPT_MESSAGE);
  assert.equal(firstPending, secondPending, "a repeated /oops must not change/stack the pending state");
  assert.equal(firstPending, "2026-08-23T03:00:00.000Z", "must keep the ORIGINAL timestamp, not the second call's clock value");
});

// --- Plain text while pending: captured verbatim, confirmed, admin DMed ---

test("plain text while a report is pending is captured verbatim, clears the pending flag, and sends the confirmation", async () => {
  const deps = makeDeps();
  await deps.store.create(444);
  await handleUpdate(textUpdate(444, "/oops"), deps);

  await handleUpdate(textUpdate(444, "the audio for lesson 3 is silent"), deps);

  const learner = await deps.store.findByTelegramId(444);
  assert.equal(learner!.awaiting_oops_report_since, null, "pending flag must be cleared after capture");

  assert.equal(deps.oopsReportsStore.reports.length, 1);
  assert.equal(deps.oopsReportsStore.reports[0].learner_id, learner!.id);
  assert.equal(deps.oopsReportsStore.reports[0].report_text, "the audio for lesson 3 is silent");

  const confirmation = deps.telegram.sent.find((m) => m.text === OOPS_CONFIRMATION_MESSAGE);
  assert.ok(confirmation, "confirmation message must be sent to the learner");
  assert.equal(confirmation!.chatId, 444);
});

test("the admin DM is sent when ADMIN_TELEGRAM_USER_ID is configured, and includes the report text and the learner's Telegram id", async () => {
  const deps = makeDeps(987654321);
  await deps.store.create(555);
  await handleUpdate(textUpdate(555, "/oops"), deps);
  await handleUpdate(textUpdate(555, "day 5 image is broken"), deps);

  const adminMessages = deps.telegram.sent.filter((m) => m.chatId === 987654321);
  assert.equal(adminMessages.length, 1);
  assert.match(adminMessages[0].text, /day 5 image is broken/);
  assert.match(adminMessages[0].text, /555/);
});

test("the admin DM is skipped (not crashed) when ADMIN_TELEGRAM_USER_ID is unset — the report is still saved and confirmed", async () => {
  const deps = makeDeps(null);
  await deps.store.create(556);
  await handleUpdate(textUpdate(556, "/oops"), deps);
  await handleUpdate(textUpdate(556, "notification never arrived"), deps);

  assert.equal(deps.oopsReportsStore.reports.length, 1, "the report must still be saved");
  assert.ok(
    deps.telegram.sent.some((m) => m.text === OOPS_CONFIRMATION_MESSAGE),
    "the learner must still get their confirmation",
  );
  // Only the prompt + confirmation were sent to the learner — no admin DM attempt at all.
  assert.equal(deps.telegram.sent.length, 2);
});

test("a failing admin DM does not undo the already-saved report or the learner's confirmation", async () => {
  const deps = makeDeps(42);
  await deps.store.create(557);
  await handleUpdate(textUpdate(557, "/oops"), deps);

  // Force the admin DM to fail, simulating e.g. a stale/invalid admin id.
  const originalSendMessage = deps.telegram.sendMessage.bind(deps.telegram);
  deps.telegram.sendMessage = async (chatId, text, keyboard) => {
    if (chatId === 42) throw new Error("Telegram sendMessage failed: 400 chat not found");
    return originalSendMessage(chatId, text, keyboard);
  };

  await handleUpdate(textUpdate(557, "something broke"), deps);

  assert.equal(deps.oopsReportsStore.reports.length, 1, "report must still be saved despite the DM failure");
  assert.ok(deps.telegram.sent.some((m) => m.text === OOPS_CONFIRMATION_MESSAGE), "learner confirmation must still send");
});

// --- /start while pending: clears the flag, then behaves exactly as today -

test("/start while a report is pending clears the pending flag and proceeds with /start's existing behavior", async () => {
  const deps = makeDeps();
  await deps.store.create(666); // gender_pending
  await handleUpdate(textUpdate(666, "/oops"), deps);
  assert.ok((await deps.store.findByTelegramId(666))!.awaiting_oops_report_since);

  await handleUpdate(textUpdate(666, "/start"), deps);

  const learner = await deps.store.findByTelegramId(666);
  assert.equal(learner!.awaiting_oops_report_since, null, "pending flag must be cleared by /start");
  assert.equal(learner!.onboarding_step, "gender_pending", "onboarding_step untouched — still mid-onboarding");

  const lastMessage = deps.telegram.sent.at(-1)!;
  assert.equal(lastMessage.text, GENDER_QUESTION_MESSAGE, "/start must resume the current onboarding step as normal");
});

// --- Unrelated plain text, nothing pending: still silently ignored --------

test("plain text with no report pending is still silently ignored, exactly as before /oops existed", async () => {
  const deps = makeDeps();
  await deps.store.create(777);

  await handleUpdate(textUpdate(777, "hey is this thing on?"), deps);

  assert.equal(deps.telegram.sent.length, 0);
  assert.equal(deps.oopsReportsStore.reports.length, 0);
});
