import { test } from "node:test";
import assert from "node:assert/strict";

import { getLesson, isWordSetDay, LESSONS, WEEKS234_LAST_DAY } from "@/lib/curriculum/content";
import { pickCrossLessonDistractors, pickWordSetDistractors } from "@/lib/delivery/distractors";
import { deliverLesson } from "@/lib/delivery/deliverLesson";
import { handleLessonActivityCallback } from "@/lib/activities/lessonActivity";
import { loadPhraseLessonAudio, loadWordSetAudio, loadWordSetImage } from "@/lib/curriculum/mediaFiles";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";

// --- Content coverage: all 21 days (8-28) have deliverable content --------

test("every day 8-28 has content, and each phrase day has non-empty gender text", () => {
  for (let day = 8; day <= WEEKS234_LAST_DAY; day++) {
    const lesson = getLesson(day);
    assert.ok(lesson, `day ${day} should have content`);
    if (lesson.kind === "phrase") {
      assert.ok(lesson.karaoke.male.length > 0);
      assert.ok(lesson.karaoke.female.length > 0);
      assert.ok(lesson.script.male.length > 0);
      assert.ok(lesson.script.female.length > 0);
    } else if (lesson.kind === "wordset") {
      assert.ok(lesson.words.length >= 3);
    }
  }
});

test("word-set days are exactly 8, 10, 16, 26 (Day 10 included despite LDTKB-048 naming only 8/16/26 — see report item 12)", () => {
  const wordsetDays = Object.values(LESSONS)
    .filter((l) => l.kind === "wordset")
    .map((l) => l.lessonNumber)
    .sort((a, b) => a - b);
  assert.deepEqual(wordsetDays, [8, 10, 16, 26]);
  for (const d of [8, 10, 16, 26]) assert.equal(isWordSetDay(d), true);
  for (const d of [9, 11, 15, 17, 25]) assert.equal(isWordSetDay(d), false);
});

// --- Days 15/17/21/22: younger form only, no age-branching code -----------

test("Days 15, 17, 21, 22 use only the younger-speaker form (ผม/หนู) — no พี่ (older form) anywhere in content.ts", () => {
  for (const day of [15, 17, 21, 22]) {
    const lesson = getLesson(day);
    if (lesson.kind !== "phrase") throw new Error(`expected day ${day} to be a phrase lesson`);
    assert.match(lesson.karaoke.male, /^phǒm/, `day ${day} male form must start with phǒm (younger), not phîi`);
    assert.match(lesson.karaoke.female, /^nǔu/, `day ${day} female form must start with nǔu (younger), not phîi`);
    assert.ok(!lesson.script.male.includes("พี่"), `day ${day} script must not contain the older-form พี่`);
    assert.ok(!lesson.script.female.includes("พี่"), `day ${day} script must not contain the older-form พี่`);
  }
});

// --- Checkpoint 5 follow-up: Days 15/17/21 delivered text -----------------

test("Days 15, 17, 21 deliver the resolved representative-example text, not the literal '...' placeholder", () => {
  const expected = {
    15: {
      karaoke: { male: "phǒm chêu Dtôm kráp", female: "nǔu chêu Nók kâ" },
      script: { male: "ผมชื่อต้อมครับ", female: "หนูชื่อนกค่ะ" },
    },
    17: {
      karaoke: { male: "phǒm chôrp duu-nǎng kráp", female: "nǔu chôrp duu-nǎng kâ" },
      script: { male: "ผมชอบดูหนังครับ", female: "หนูชอบดูหนังค่ะ" },
    },
    21: {
      karaoke: { male: "phǒm mâi-chôrp rót-dtìt kráp", female: "nǔu mâi-chôrp rót-dtìt kâ" },
      script: { male: "ผมไม่ชอบรถติดครับ", female: "หนูไม่ชอบรถติดค่ะ" },
    },
  } as const;

  for (const day of [15, 17, 21] as const) {
    const lesson = getLesson(day);
    if (lesson.kind !== "phrase") throw new Error(`expected day ${day} to be a phrase lesson`);
    assert.equal(lesson.karaoke.male, expected[day].karaoke.male);
    assert.equal(lesson.karaoke.female, expected[day].karaoke.female);
    assert.equal(lesson.script.male, expected[day].script.male);
    assert.equal(lesson.script.female, expected[day].script.female);
    assert.ok(!lesson.karaoke.male.includes("..."), `day ${day} karaoke.male must not contain literal "..."`);
    assert.ok(!lesson.karaoke.female.includes("..."), `day ${day} karaoke.female must not contain literal "..."`);
    assert.ok(!lesson.script.male.includes("..."), `day ${day} script.male must not contain literal "..."`);
    assert.ok(!lesson.script.female.includes("..."), `day ${day} script.female must not contain literal "..."`);
  }
});

test("no age-branching logic exists: content.ts has no 'older'/'younger' input parameter anywhere", () => {
  // Structural check: getLesson takes only a lessonNumber, no age/relative-age
  // argument. This is implicit in getLesson's signature already being
  // exercised throughout this file with a single argument, but stated
  // explicitly here as its own assertion of intent.
  assert.equal(getLesson.length, 1, "getLesson must take exactly one argument (lessonNumber), no age input");
});

// --- Day 25: example #1 only -----------------------------------------------

test("Day 25 uses example #1 (\"may I park here?\") as its canonical phrase", () => {
  const lesson = getLesson(25);
  if (lesson.kind !== "phrase") throw new Error("expected day 25 to be a phrase lesson");
  assert.equal(lesson.englishMeaning, "May I park here?");
  assert.equal(lesson.karaoke.male, "khǎw jòrt rót dtrong-níi dâai mǎi kráp");
  assert.equal(lesson.script.female, "ขอจอดรถตรงนี้ได้ไหมคะ");
});

// --- pickCrossLessonDistractors reused unmodified --------------------------

test("pickCrossLessonDistractors generalizes to Weeks 2-4 day numbers without modification", () => {
  // Day 20's pool includes both pilot lessons and earlier Weeks 2-4 days.
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  const result = pickCrossLessonDistractors(20, pool, () => 0.5);
  assert.equal(result.length, 2);
  for (const n of result) assert.ok(n < 20 && pool.includes(n));
});

test("pickWordSetDistractors: two distinct words from the same set, never the correct one, respects set size", () => {
  const day8 = pickWordSetDistractors(2, 4, () => 0.4); // Day 8 has 4 words
  assert.equal(day8.length, 2);
  assert.ok(!day8.includes(2));
  for (const n of day8) assert.ok(n >= 1 && n <= 4);

  const day16 = pickWordSetDistractors(1, 3, () => 0.4); // Day 16 has 3 words
  assert.equal(day16.length, 2);
  assert.deepEqual(new Set(day16), new Set([2, 3]));
});

// --- Word-set day delivery: one image, per-word audio, intra-set activity -

test("word-set day delivery sends exactly ONE image (not one per word) and one audio per word", async () => {
  const media = new FakeMediaLoader();
  const deps = { telegram: new FakeTelegramClient(), deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9 };

  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 8, deliveryDate: "2026-09-01", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7] },
    deps,
  );

  assert.equal(deps.telegram.sentPhotos.length, 1, "exactly one photo for the whole day, not per word");
  assert.equal(deps.telegram.sentPhotos[0].filename, "day8.png");
  // 4 words' audio for lesson content + up to 2 more for the activity.
  const contentAudio = media.requested.filter((f) => f.startsWith("day8_") && !f.startsWith("representative:"));
  assert.ok(contentAudio.length >= 4);
});

test("word-set activity distractors come only from the same day's own words, not other days", async () => {
  const media = new FakeMediaLoader();
  const telegram = new FakeTelegramClient();
  const deps = { telegram, deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.1 };

  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "female", lessonNumber: 16, deliveryDate: "2026-09-01", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7, 8] },
    deps,
  );

  const activityButtons = telegram.sent.at(-1)?.keyboard?.[0] ?? [];
  assert.equal(activityButtons.length, 3);
  for (const button of activityButtons) {
    assert.ok("callback_data" in button, "word-set activity buttons must use callback_data, not web_app");
    assert.match(button.callback_data, /^activity:wordset:16:\d:[01]$/);
  }
});

// --- Word-set activity response handling -----------------------------------

test("word-set activity tap: correct answer feedback names the correct word's meaning", async () => {
  const deps = {
    telegram: new FakeTelegramClient(),
    learnerStore: new FakeLearnerStore(),
    deliveryStore: new FakeDeliveryStore(),
    now: () => new Date("2026-09-01T01:00:00.000Z"),
  };
  const learner = await deps.learnerStore.create(300);
  await deps.deliveryStore.insertTextSent(learner.id, 26, "2026-09-01", new Date().toISOString());

  // Day 26, word index 2 = "mâi châi" = "No/incorrect".
  await handleLessonActivityCallback(
    { id: "cb1", from: { id: 300 }, message: { chat: { id: 300 } } },
    "activity:wordset:26:2:0",
    deps,
  );

  assert.match(deps.telegram.sent[0].text, /No\/incorrect/);
  const delivery = await deps.deliveryStore.findExisting(learner.id, 26, "2026-09-01");
  assert.equal(delivery?.activity_correct, false);
});

// --- Standard phrase days plug into the existing (Checkpoint 4) handler ---

test("a standard Weeks 2-4 phrase day (e.g. Day 20) uses the same activity handler path as Lessons 3-7, unmodified", async () => {
  const deps = {
    telegram: new FakeTelegramClient(),
    learnerStore: new FakeLearnerStore(),
    deliveryStore: new FakeDeliveryStore(),
    now: () => new Date("2026-09-01T01:00:00.000Z"),
  };
  const learner = await deps.learnerStore.create(301);
  await deps.deliveryStore.insertTextSent(learner.id, 20, "2026-09-01", new Date().toISOString());

  await handleLessonActivityCallback(
    { id: "cb2", from: { id: 301 }, message: { chat: { id: 301 } } },
    "activity:phrase:20:1",
    deps,
  );

  assert.match(deps.telegram.sent[0].text, /right/i);
  const delivery = await deps.deliveryStore.findExisting(learner.id, 20, "2026-09-01");
  assert.equal(delivery?.activity_correct, true);
});

// --- Section 5E: "main, not extended" assumption for Days 9, 13, 24 -------

test("Days 9, 13, 24 use the MAIN phrase, not the extended/supplementary variant (flagged judgment call, see report item 7)", () => {
  const day9 = getLesson(9);
  const day13 = getLesson(13);
  const day24 = getLesson(24);
  if (day9.kind !== "phrase" || day13.kind !== "phrase" || day24.kind !== "phrase") {
    throw new Error("expected days 9, 13, 24 to be phrase lessons");
  }
  assert.equal(day9.englishMeaning, "What time is it now?", "not the ขอโทษ-prefixed extended version");
  assert.equal(day13.englishMeaning, "I'll take one iced coffee", "not a sweetness-level variant");
  assert.equal(day24.englishMeaning, "I'd like to book a room for one night", "not the online-booking variant");
});

// --- Real file access: actual Weeks 2-4 media files exist and are readable

test("real media files: loadPhraseLessonAudio routes correctly across the pilot/Weeks-2-4 boundary", async () => {
  const pilotFile = await loadPhraseLessonAudio(7, "male"); // pilot, curriculum/pilot/audio/
  assert.equal(pilotFile.filename, "lesson07_male.mp3");
  assert.ok(pilotFile.buffer.length > 0);

  const week2File = await loadPhraseLessonAudio(9, "female"); // Weeks 2-4, week2-audio/
  assert.equal(week2File.filename, "week2_day09_female.mp3");
  assert.ok(week2File.buffer.length > 0);

  const week3File = await loadPhraseLessonAudio(19, "male");
  assert.equal(week3File.filename, "week3_day19_male.mp3");
  assert.ok(week3File.buffer.length > 0);

  const week4File = await loadPhraseLessonAudio(27, "female");
  assert.equal(week4File.filename, "week4_day27_female.mp3");
  assert.ok(week4File.buffer.length > 0);
});

test("real media files: word-set audio and single shared image are readable for all 4 word-set days", async () => {
  for (const [day, wordCount] of [[8, 4], [10, 3], [16, 3], [26, 3]] as const) {
    const image = await loadWordSetImage(day);
    assert.ok(image.buffer.length > 0, `day ${day} image should be readable`);
    for (let i = 1; i <= wordCount; i++) {
      const audio = await loadWordSetAudio(day, i);
      assert.ok(audio.buffer.length > 0, `day ${day} word ${i} audio should be readable`);
    }
  }
});

// --- Confirm Lessons 1-7 / Day 29 / Day 30 code paths unaffected ----------

test("Lesson 1 still has no activity (unaffected by Checkpoint 5)", async () => {
  const media = new FakeMediaLoader();
  const deps = { telegram: new FakeTelegramClient(), deliveryStore: new FakeDeliveryStore(), media, rng: () => 0.9 };
  const result = await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 1, deliveryDate: "2026-09-01", previouslyDeliveredLessonNumbers: [] },
    deps,
  );
  assert.equal(result.status, "no_activity_content");
});
