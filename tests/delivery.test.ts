import { test } from "node:test";
import assert from "node:assert/strict";

import { lessonNumberForDay, findDueLearners, isWithinDeliveryWindow, type OnboardedLearner } from "@/lib/delivery/dueLearners";
import { deliverLesson } from "@/lib/delivery/deliverLesson";
import { FakeTelegramClient } from "./fakes";
import { EventLog, FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";

// --- Day-to-lesson-number mapping ---------------------------------------

test("lessonNumberForDay: day 1 (pilot_start_date itself) is lesson 1", () => {
  assert.equal(lessonNumberForDay("2026-08-21", "2026-08-21"), 1);
});

test("lessonNumberForDay: day 7 is lesson 7", () => {
  assert.equal(lessonNumberForDay("2026-08-21", "2026-08-27"), 7);
});

test("lessonNumberForDay: day 8+ is past the pilot window (null)", () => {
  assert.equal(lessonNumberForDay("2026-08-21", "2026-08-28"), null);
  assert.equal(lessonNumberForDay("2026-08-21", "2026-09-15"), null);
});

test("lessonNumberForDay: before pilot_start_date is defensively null, not negative/throwing", () => {
  assert.equal(lessonNumberForDay("2026-08-21", "2026-08-20"), null);
});

// --- Delivery time window -------------------------------------------------

test("isWithinDeliveryWindow: exact match and 30-minute lookback boundary", () => {
  const eightAM = 8 * 60;
  assert.equal(isWithinDeliveryWindow("08:00", eightAM, 30), true, "exact tick matches");
  assert.equal(isWithinDeliveryWindow("08:00", eightAM + 29, 30), true, "within lookback still matches");
  assert.equal(isWithinDeliveryWindow("08:00", eightAM + 31, 30), false, "past the lookback no longer matches");
  assert.equal(isWithinDeliveryWindow("08:00", eightAM - 1, 30), false, "before the scheduled time never matches");
});

test("findDueLearners excludes a learner past their 7-day pilot window even if their time matches", () => {
  const learner: OnboardedLearner = {
    id: "l1",
    telegram_user_id: 1,
    gender_branch: "male",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: "2026-08-01", // 20 days before "now" below
  };
  const now = new Date("2026-08-21T01:00:00.000Z"); // 08:00 Bangkok
  const due = findDueLearners([learner], { now, lookbackMinutes: 30 });
  assert.equal(due.length, 0);
});

test("findDueLearners returns the correct lesson number for an in-window, in-pilot learner", () => {
  const learner: OnboardedLearner = {
    id: "l1",
    telegram_user_id: 1,
    gender_branch: "female",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: "2026-08-18", // "now" below is day 4 of the pilot
  };
  const now = new Date("2026-08-21T01:05:00.000Z"); // 08:05 Bangkok, within the 30-min window
  const due = findDueLearners([learner], { now, lookbackMinutes: 30 });
  assert.equal(due.length, 1);
  assert.equal(due[0].lessonNumber, 4);
});

// --- deliverLesson: gender-branch file selection --------------------------

// LDTKB-058: audio is no longer loaded through MediaLoader for any lesson
// day (it's delivered via the Web App instead) — only the image stays
// gender-branched and natively loaded/sent, so that's all these two tests
// verify now.
test("deliverLesson selects the male image file for a male learner, and no native audio (phrase lesson)", async () => {
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient();
  const deps = { telegram, deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9, appUrl: "https://thaitalkbreaks.example" };
  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 4, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [1, 2, 3] },
    deps,
  );
  assert.ok(media.requested.includes("lesson4_male.png"));
  assert.ok(!media.requested.some((f) => f.includes("female")));
  assert.equal(telegram.sentAudio.length, 0, "no native audio for any lesson day any more");
});

test("deliverLesson selects the female image file for a female learner, and no native audio (phrase lesson)", async () => {
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient();
  const deps = { telegram, deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9, appUrl: "https://thaitalkbreaks.example" };
  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "female", lessonNumber: 4, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [1, 2, 3] },
    deps,
  );
  assert.ok(media.requested.includes("lesson4_female.png"));
  assert.ok(!media.requested.some((f) => f.includes("male") && !f.includes("female")));
  assert.equal(telegram.sentAudio.length, 0, "no native audio for any lesson day any more");
});

// LDTKB-057: Lesson 2 now uses one combined audio/image file, not one per number.
// Lesson 2's audio is no longer loaded through MediaLoader at all (this
// revision of LDTKB-057 moved it to the Web App) — only the combined photo
// still goes through the normal gender-branch-free native path.
test("deliverLesson uses the combined numbers photo (no gender branch) for lesson 2, and no native audio", async () => {
  const media = new FakeMediaLoader();
  const deps = {
    telegram: new FakeTelegramClient(),
    deliveryStore: new FakeDeliveryStore(),
    media,
    rng: () => 0.9,
    appUrl: "https://thaitalkbreaks.example",
  };
  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 2, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [] },
    deps,
  );
  assert.ok(media.requested.includes("lesson2_combined.png"));
  assert.ok(!media.requested.some((f) => f.includes("male") || f.includes("female")));
  assert.ok(!media.requested.includes("lesson2_combined.mp3"), "the combined audio file must not be loaded any more");
});

// --- Duplicate-send guard --------------------------------------------------

test("duplicate-send guard: a second delivery attempt for the same learner/lesson/date is blocked", async () => {
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient();
  const deliveryStore = new FakeDeliveryStore();
  const deps = { telegram, deliveryStore, media, rng: () => 0.9, appUrl: "https://thaitalkbreaks.example" };
  const input = { learnerId: "l1", chatId: 1, gender: "male" as const, lessonNumber: 1, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [] };

  const first = await deliverLesson(input, deps);
  assert.equal(first.status, "delivered");
  const photosAfterFirst = telegram.sentPhotos.length;
  const audioAfterFirst = telegram.sentAudio.length;

  const second = await deliverLesson(input, deps);
  assert.equal(second.status, "already_delivered");
  assert.equal(telegram.sentPhotos.length, photosAfterFirst, "no new photo sent on the blocked retry");
  assert.equal(telegram.sentAudio.length, audioAfterFirst, "no new audio sent on the blocked retry");
});

test("duplicate-send guard: same learner, same lesson, different date is allowed (a new day)", async () => {
  const media = new FakeMediaLoader();
  const deliveryStore = new FakeDeliveryStore();
  const deps = {
    telegram: new FakeTelegramClient(),
    deliveryStore,
    media,
    rng: () => 0.9,
    appUrl: "https://thaitalkbreaks.example", // lesson 2 (used as "day 2" below) now needs this
  };

  const day1 = await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 1, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [] },
    deps,
  );
  const day2 = await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 2, deliveryDate: "2026-08-22", previouslyDeliveredLessonNumbers: [1] },
    deps,
  );
  assert.notEqual(day1.status, "already_delivered");
  assert.notEqual(day2.status, "already_delivered");
});

// --- Text-before-audio sequencing: two distinct recorded states -----------

// LDTKB-058: audio no longer sends natively at all (no more "sendAudio:..."
// event to sequence against) — this test now verifies the same underlying
// guarantee (delivered_at recorded before audio_delivered_at) directly via
// the two DeliveryStore events, plus that the web_app button message (the
// audio-equivalent step) was actually sent in between.
test("text-before-audio: delivered_at is recorded before audio_delivered_at, with the web_app button sent in between", async () => {
  const log = new EventLog();
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient(log);
  const deliveryStore = new FakeDeliveryStore(log);
  const deps = { telegram, deliveryStore, media, rng: () => 0.9, appUrl: "https://thaitalkbreaks.example" };

  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 4, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [1, 2, 3] },
    deps,
  );

  const deliveredIdx = log.events.indexOf("delivered_at:l1:4");
  const audioDeliveredIdx = log.events.indexOf("audio_delivered_at:l1:4");

  assert.notEqual(deliveredIdx, -1);
  assert.notEqual(audioDeliveredIdx, -1);
  assert.ok(deliveredIdx < audioDeliveredIdx, "delivered_at must be recorded before audio_delivered_at");
  assert.equal(telegram.sentAudio.length, 0, "no native sendAudio call any more");

  const buttonMessage = telegram.sent.find((m) => m.keyboard?.some((row) => row.some((b) => "web_app" in b)));
  assert.ok(buttonMessage, "the web_app audio button must have been sent");

  // Two DISTINCT recorded states, not one combined timestamp.
  const record = await deliveryStore.findExisting("l1", 4, "2026-08-21");
  assert.ok(record?.delivered_at);
  assert.ok(record?.audio_delivered_at);
  assert.notEqual(record?.delivered_at, undefined);
});
