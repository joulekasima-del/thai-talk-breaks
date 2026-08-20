import { test } from "node:test";
import assert from "node:assert/strict";

import { lessonNumberForDay, findDueLearners, isWithinDeliveryWindow, type OnboardedLearner } from "@/lib/delivery/dueLearners";
import { pickCrossLessonDistractors, pickNumberDistractors } from "@/lib/delivery/distractors";
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

// --- Distractor selection (explicitly a design choice, not a locked rule) -

test("pickCrossLessonDistractors: lesson 1 has no eligible pool", () => {
  assert.deepEqual(pickCrossLessonDistractors(1, []), []);
});

test("pickCrossLessonDistractors: only draws from lessons before today, at most 2, no duplicates", () => {
  const rng = () => 0.999; // deterministic
  const result = pickCrossLessonDistractors(5, [1, 2, 3, 4], rng);
  assert.equal(result.length, 2);
  assert.equal(new Set(result).size, 2);
  for (const n of result) assert.ok(n < 5);
});

test("pickCrossLessonDistractors: with only one prior lesson, returns exactly one distractor", () => {
  const result = pickCrossLessonDistractors(2, [1], () => 0.5);
  assert.deepEqual(result, [1]);
});

test("pickNumberDistractors: two distinct numbers, never the correct one", () => {
  const result = pickNumberDistractors(5, () => 0.3);
  assert.equal(result.length, 2);
  assert.ok(!result.includes(5));
  assert.equal(new Set(result).size, 2);
});

// --- deliverLesson: gender-branch file selection --------------------------

test("deliverLesson selects the male audio/image files for a male learner (phrase lesson)", async () => {
  const media = new FakeMediaLoader();
  const deps = { telegram: new FakeTelegramClient(), deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9 };
  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );
  assert.ok(media.requested.includes("lesson3_male.mp3"));
  assert.ok(media.requested.includes("lesson3_male.png"));
  assert.ok(!media.requested.some((f) => f.includes("female")));
});

test("deliverLesson selects the female audio/image files for a female learner (phrase lesson)", async () => {
  const media = new FakeMediaLoader();
  const deps = { telegram: new FakeTelegramClient(), deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9 };
  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "female", lessonNumber: 3, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );
  assert.ok(media.requested.includes("lesson3_female.mp3"));
  assert.ok(media.requested.includes("lesson3_female.png"));
  assert.ok(!media.requested.some((f) => f.includes("male") && !f.includes("female")));
});

test("deliverLesson uses number files with no gender branch for lesson 2", async () => {
  const media = new FakeMediaLoader();
  const deps = { telegram: new FakeTelegramClient(), deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9 };
  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 2, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [] },
    deps,
  );
  // All 10 numbers' audio+image requested, none of them gender-suffixed.
  for (let n = 1; n <= 10; n++) {
    assert.ok(media.requested.includes(`lesson2_${n}.mp3`));
    assert.ok(media.requested.includes(`lesson2_${n}.png`));
  }
});

// --- Duplicate-send guard --------------------------------------------------

test("duplicate-send guard: a second delivery attempt for the same learner/lesson/date is blocked", async () => {
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient();
  const deliveryStore = new FakeDeliveryStore();
  const deps = { telegram, deliveryStore, media, rng: () => 0.9 };
  const input = { learnerId: "l1", chatId: 1, gender: "male" as const, lessonNumber: 1, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [] };

  const first = await deliverLesson(input, deps);
  assert.equal(first.status, "no_activity_content"); // lesson 1 has no distractor pool
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
  const deps = { telegram: new FakeTelegramClient(), deliveryStore, media, rng: () => 0.9 };

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

test("text-before-audio: delivered_at is recorded before the lesson's native audio is sent, audio_delivered_at after", async () => {
  const log = new EventLog();
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient(log);
  const deliveryStore = new FakeDeliveryStore(log);
  const deps = { telegram, deliveryStore, media, rng: () => 0.9 };

  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );

  const deliveredIdx = log.events.indexOf("delivered_at:l1:3");
  const mainAudioIdx = log.events.indexOf("sendAudio:lesson3_male.mp3");
  const audioDeliveredIdx = log.events.indexOf("audio_delivered_at:l1:3");

  assert.notEqual(deliveredIdx, -1);
  assert.notEqual(mainAudioIdx, -1);
  assert.notEqual(audioDeliveredIdx, -1);
  assert.ok(deliveredIdx < mainAudioIdx, "delivered_at must be recorded before the native audio send");
  assert.ok(mainAudioIdx < audioDeliveredIdx, "audio_delivered_at must be recorded after the native audio send");

  // Two DISTINCT recorded states, not one combined timestamp.
  const record = await deliveryStore.findExisting("l1", 3, "2026-08-21");
  assert.ok(record?.delivered_at);
  assert.ok(record?.audio_delivered_at);
  assert.notEqual(record?.delivered_at, undefined);
});

// --- Lesson 1's structural distractor gap ----------------------------------

test("lesson 1 has no eligible distractor pool and skips the recognition-tap activity, without inventing content", async () => {
  const media = new FakeMediaLoader();
  const deps = { telegram: new FakeTelegramClient(), deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9 };
  const result = await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 1, deliveryDate: "2026-08-21", previouslyDeliveredLessonNumbers: [] },
    deps,
  );
  assert.equal(result.status, "no_activity_content");
});
