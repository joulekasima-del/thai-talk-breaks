import { test } from "node:test";
import assert from "node:assert/strict";

import { deliverLesson } from "@/lib/delivery/deliverLesson";
import { getLesson } from "@/lib/curriculum/content";
import { startDay30Quiz, handleDay30QuizCallback } from "@/lib/quiz/day30Quiz";
import { DAY30_QUESTION_COUNT } from "@/lib/curriculum/day30Content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";
import { FakeDay30QuizStore } from "./quizFakes";
import type { MediaFile } from "@/lib/telegram";

// Every audio message should display a real title/performer, never the raw
// internal disk filename — the bug this fix addresses. Teaching audio (rule
// A) should REVEAL the pronunciation as its title; activity/quiz audio
// (rule B) must stay anonymized. See deliverLesson.ts / day30Quiz.ts.

function makeDeliverDeps(rngSequence: number[] = []) {
  let i = 0;
  const rng = () => (i < rngSequence.length ? rngSequence[i++] : 0.99);
  return {
    telegram: new FakeTelegramClient(),
    deliveryStore: new FakeDeliveryStore(),
    media: new FakeMediaLoader(),
    now: () => new Date("2026-08-23T01:00:00.000Z"),
    rng,
  };
}

// --- Rule A: teaching audio reveals the pronunciation ----------------------

test("pilot phrase lesson (Lesson 3) main audio: title = karaoke pronunciation, performer = 'Lesson 3'", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(3);
  if (lesson.kind !== "phrase") throw new Error("expected lesson 3 to be a phrase lesson");

  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );

  const mainAudio = deps.telegram.sentAudio[0];
  assert.equal(mainAudio.title, lesson.karaoke.male);
  assert.equal(mainAudio.performer, "Lesson 3");
});

test("Weeks 2-4 phrase day (Day 9) main audio: performer = 'Day 9', not 'Lesson 9'", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(9);
  if (lesson.kind !== "phrase") throw new Error("expected day 9 to be a phrase lesson");

  await deliverLesson(
    { learnerId: "l2", chatId: 2, gender: "female", lessonNumber: 9, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7, 8] },
    deps,
  );

  const mainAudio = deps.telegram.sentAudio[0];
  assert.equal(mainAudio.title, lesson.karaoke.female);
  assert.equal(mainAudio.performer, "Day 9");
});

test("Lesson 2 (numbers) audio: each number's title = its own karaoke, performer = 'Lesson 2'", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(2);
  if (lesson.kind !== "numbers") throw new Error("expected lesson 2 to be the numbers lesson");

  await deliverLesson(
    { learnerId: "l3", chatId: 3, gender: "male", lessonNumber: 2, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1] },
    deps,
  );

  // First 10 sentAudio entries are the teaching audio (before the activity's own sendAudio calls).
  const teachingAudio = deps.telegram.sentAudio.slice(0, 10);
  assert.equal(teachingAudio.length, 10);
  for (let i = 0; i < 10; i++) {
    assert.equal(teachingAudio[i].title, lesson.numbers[i].karaoke);
    assert.equal(teachingAudio[i].performer, "Lesson 2");
  }
});

test("word-set day (Day 8) audio: each word's title = its own karaoke, performer = 'Day 8'", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(8);
  if (lesson.kind !== "wordset") throw new Error("expected day 8 to be a word-set day");

  await deliverLesson(
    { learnerId: "l4", chatId: 4, gender: "male", lessonNumber: 8, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7] },
    deps,
  );

  const teachingAudio = deps.telegram.sentAudio.slice(0, lesson.words.length);
  for (let i = 0; i < lesson.words.length; i++) {
    assert.equal(teachingAudio[i].title, lesson.words[i].karaoke);
    assert.equal(teachingAudio[i].performer, "Day 8");
  }
});

// --- Rule B: activity/quiz audio stays anonymized ---------------------------

function assertNeverRevealsPronunciation(entries: { title?: string }[], forbiddenTexts: string[]) {
  for (const entry of entries) {
    for (const forbidden of forbiddenTexts) {
      assert.notEqual(entry.title, forbidden, `activity/quiz audio title must never equal the actual pronunciation ("${forbidden}")`);
    }
  }
}

test("Lesson 2 numbers activity distractor audio: title = 'Option A/B/C', performer = 'Lesson 2 Activity' — never the number's karaoke", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(2);
  if (lesson.kind !== "numbers") throw new Error("expected lesson 2 to be the numbers lesson");

  await deliverLesson(
    { learnerId: "l5", chatId: 5, gender: "male", lessonNumber: 2, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1] },
    deps,
  );

  const activityAudio = deps.telegram.sentAudio.slice(10); // after the 10 teaching clips
  assert.ok(activityAudio.length >= 2);
  for (const entry of activityAudio) {
    assert.match(entry.title!, /^Option [A-C]$/);
    assert.equal(entry.performer, "Lesson 2 Activity");
  }
  assertNeverRevealsPronunciation(activityAudio, lesson.numbers.map((n) => n.karaoke));
});

test("word-set (Day 8) activity distractor audio: title = 'Option A/B/C', performer = 'Day 8 Activity' — never a word's karaoke", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(8);
  if (lesson.kind !== "wordset") throw new Error("expected day 8 to be a word-set day");

  await deliverLesson(
    { learnerId: "l6", chatId: 6, gender: "female", lessonNumber: 8, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7] },
    deps,
  );

  const activityAudio = deps.telegram.sentAudio.slice(lesson.words.length);
  assert.ok(activityAudio.length >= 2);
  for (const entry of activityAudio) {
    assert.match(entry.title!, /^Option [A-C]$/);
    assert.equal(entry.performer, "Day 8 Activity");
  }
  assertNeverRevealsPronunciation(activityAudio, lesson.words.map((w) => w.karaoke));
});

test("pilot phrase (Lesson 3) activity distractor audio: performer = 'Lesson 3 Activity', title never the karaoke", async () => {
  const deps = makeDeliverDeps();
  const lesson = getLesson(3);
  if (lesson.kind !== "phrase") throw new Error("expected lesson 3 to be a phrase lesson");

  await deliverLesson(
    { learnerId: "l7", chatId: 7, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );

  // sentAudio[0] is the teaching clip; the activity's distractor clips follow.
  const activityAudio = deps.telegram.sentAudio.slice(1);
  assert.ok(activityAudio.length >= 2);
  for (const entry of activityAudio) {
    assert.match(entry.title!, /^Option [A-C]$/);
    assert.equal(entry.performer, "Lesson 3 Activity");
    assert.notEqual(entry.title, lesson.karaoke.male);
  }
});

test("Weeks 2-4 phrase (Day 9) activity distractor audio: performer = 'Day 9 Activity', not 'Lesson 9 Activity'", async () => {
  const deps = makeDeliverDeps();

  await deliverLesson(
    { learnerId: "l8", chatId: 8, gender: "female", lessonNumber: 9, deliveryDate: "2026-08-23", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7, 8] },
    deps,
  );

  const activityAudio = deps.telegram.sentAudio.slice(1);
  assert.ok(activityAudio.length >= 2);
  for (const entry of activityAudio) {
    assert.match(entry.title!, /^Option [A-C]$/);
    assert.equal(entry.performer, "Day 9 Activity");
  }
});

// --- Day 30 quiz: anonymized throughout --------------------------------

function fakeAudio(filename: string): MediaFile {
  return { buffer: Buffer.from(filename), filename, contentType: "audio/mpeg" };
}

function makeQuizDeps() {
  return {
    telegram: new FakeTelegramClient(),
    learnerStore: new FakeLearnerStore(),
    quizStore: new FakeDay30QuizStore(),
    now: () => new Date("2026-08-23T01:00:00.000Z"),
    rng: () => 0.99,
    loadAudio: async (filename: string) => fakeAudio(filename),
  };
}

test("Day 30 quiz prompt audio: title = 'Question N/10', performer = 'Day 30 Quiz'", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(900);

  await startDay30Quiz(learner.id, 900, deps);

  assert.equal(deps.telegram.sentAudio[0].title, `Question 1/${DAY30_QUESTION_COUNT}`);
  assert.equal(deps.telegram.sentAudio[0].performer, "Day 30 Quiz");
});

test("Day 30 quiz tapped-button audio: generic title/performer, never the answer text", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(901);
  await startDay30Quiz(learner.id, 901, deps);

  await handleDay30QuizCallback({ id: "cb-901", from: { id: 901 }, message: { chat: { id: 901 } } }, "quiz:1:c", deps);

  const tappedAudio = deps.telegram.sentAudio[1];
  assert.equal(tappedAudio.title, "Day 30");
  assert.equal(tappedAudio.performer, "Day 30 Quiz");
});
