import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { handleLessonActivityCallback } from "@/lib/activities/lessonActivity";
import { startDay30Quiz, handleDay30QuizCallback } from "@/lib/quiz/day30Quiz";
import { DAY30_QUESTIONS, day30ScoreMessage, DAY30_BADGE_MESSAGE } from "@/lib/curriculum/day30Content";
import { dayNumberForLearner, findDueLearners, type OnboardedLearner } from "@/lib/delivery/dueLearners";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore } from "./deliveryFakes";
import { FakeDay30QuizStore } from "./quizFakes";
import type { TelegramCallbackQuery, MediaFile } from "@/lib/telegram";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Regression check: day30Content.ts matches day30-button-wording.md ----

test("Day 30 quiz content matches day30-button-wording.md verbatim", () => {
  const raw = readFileSync(path.join(REPO_ROOT, "curriculum/day30-button-wording.md"), "utf8");
  const rows = [...raw.matchAll(/\| (Q\d+_\S+\.mp3) \| \S+.*? \| (.+?) \|$/gm)];
  const byFile = new Map(rows.map((m) => [m[1], m[2].trim()]));

  for (const q of DAY30_QUESTIONS) {
    assert.equal(byFile.get(q.correctAudioFile), q.correctButtonText, `Q${q.index} correct button text`);
    assert.equal(byFile.get(`Q${q.index}_distractor-1.mp3`), q.distractorButtonTexts[0], `Q${q.index} distractor 1`);
    assert.equal(byFile.get(`Q${q.index}_distractor-2.mp3`), q.distractorButtonTexts[1], `Q${q.index} distractor 2`);
  }
});

test("day30ScoreMessage and badge match day30-quiz-content.md's locked format", () => {
  assert.equal(day30ScoreMessage(7), "You got **7/10**! 🎉");
  assert.equal(DAY30_BADGE_MESSAGE, "🏅 **Thai Talk Breaks Graduate**");
});

// --- Part A: recognition-tap response handling (Lessons 2-7) --------------

function makeActivityDeps() {
  return {
    telegram: new FakeTelegramClient(),
    learnerStore: new FakeLearnerStore(),
    deliveryStore: new FakeDeliveryStore(),
    now: () => new Date("2026-08-23T01:00:00.000Z"),
  };
}

function activityCallback(telegramUserId: number, id = "cb1"): TelegramCallbackQuery {
  return { id, from: { id: telegramUserId }, message: { chat: { id: telegramUserId } } };
}

test("correct lesson activity tap: records completion and sends positive feedback", async () => {
  const deps = makeActivityDeps();
  const learner = await deps.learnerStore.create(100);
  await deps.deliveryStore.insertTextSent(learner.id, 3, "2026-08-23", new Date().toISOString());

  await handleLessonActivityCallback(activityCallback(100), "activity:phrase:3:1", deps);

  assert.equal(deps.telegram.answeredCallbackIds.length, 1);
  assert.equal(deps.telegram.sent.length, 1);
  assert.match(deps.telegram.sent[0].text, /right/i);

  const delivery = await deps.deliveryStore.findExisting(learner.id, 3, "2026-08-23");
  assert.equal(delivery?.activity_correct, true);
  assert.ok(delivery?.activity_answered_at);
});

test("incorrect lesson activity tap: names the correct answer in feedback", async () => {
  const deps = makeActivityDeps();
  const learner = await deps.learnerStore.create(101);
  await deps.deliveryStore.insertTextSent(learner.id, 3, "2026-08-23", new Date().toISOString());

  await handleLessonActivityCallback(activityCallback(101), "activity:phrase:3:0", deps);

  assert.match(deps.telegram.sent[0].text, /Not quite/i);
  assert.match(deps.telegram.sent[0].text, /take this one|take one/i); // lesson 3's English meaning

  const delivery = await deps.deliveryStore.findExisting(learner.id, 3, "2026-08-23");
  assert.equal(delivery?.activity_correct, false);
});

test("lesson 2 (numbers) activity tap: feedback names the correct number", async () => {
  const deps = makeActivityDeps();
  const learner = await deps.learnerStore.create(102);
  await deps.deliveryStore.insertTextSent(learner.id, 2, "2026-08-23", new Date().toISOString());

  await handleLessonActivityCallback(activityCallback(102), "activity:num:7:0", deps);

  assert.match(deps.telegram.sent[0].text, /"7\./);
});

test("a second tap on an already-answered activity is ignored (no double recording)", async () => {
  const deps = makeActivityDeps();
  const learner = await deps.learnerStore.create(103);
  await deps.deliveryStore.insertTextSent(learner.id, 4, "2026-08-23", new Date().toISOString());

  await handleLessonActivityCallback(activityCallback(103), "activity:phrase:4:1", deps);
  const countAfterFirst = deps.telegram.sent.length;
  await handleLessonActivityCallback(activityCallback(103), "activity:phrase:4:0", deps);

  assert.equal(deps.telegram.sent.length, countAfterFirst, "no new feedback message for the stale second tap");
  const delivery = await deps.deliveryStore.findExisting(learner.id, 4, "2026-08-23");
  assert.equal(delivery?.activity_correct, true, "first (correct) answer must not be overwritten");
});

// --- Part B: Day 30 quiz-ladder --------------------------------------------

function fakeAudio(filename: string): MediaFile {
  return { buffer: Buffer.from(filename), filename, contentType: "audio/mpeg" };
}

function makeQuizDeps(rngSequence: number[] = []) {
  let i = 0;
  const rng = () => (i < rngSequence.length ? rngSequence[i++] : 0.99);
  return {
    telegram: new FakeTelegramClient(),
    learnerStore: new FakeLearnerStore(),
    quizStore: new FakeDay30QuizStore(),
    now: () => new Date("2026-08-23T01:00:00.000Z"),
    rng,
    loadAudio: async (filename: string) => fakeAudio(filename),
  };
}

test("starting the quiz sends question 1's audio and 3 buttons, one per option", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(200);

  await startDay30Quiz(learner.id, 200, deps);

  assert.equal(deps.telegram.sentAudio.length, 1);
  assert.equal(deps.telegram.sentAudio[0].filename, "Q1_correct_answer.mp3");
  assert.equal(deps.telegram.sent.length, 1);
  assert.equal(deps.telegram.sent[0].keyboard?.[0].length, 3);

  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.current_question_index, 1);
});

test("starting the quiz twice is a no-op the second time (guard against re-start on a later cron tick)", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(201);

  await startDay30Quiz(learner.id, 201, deps);
  const audioCountAfterFirst = deps.telegram.sentAudio.length;
  await startDay30Quiz(learner.id, 201, deps);

  assert.equal(deps.telegram.sentAudio.length, audioCountAfterFirst, "no second question-1 send");
});

test("full 10-question quiz: correct/incorrect tracked, advances each time, ends with score+badge", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(202);
  await startDay30Quiz(learner.id, 202, deps);

  // Answer: correct, correct, incorrect, correct x7 -> 9/10.
  const answers = [1, 1, 0, 1, 1, 1, 1, 1, 1, 1];
  for (let q = 1; q <= 10; q++) {
    await handleDay30QuizCallback(
      { id: `cb-${q}`, from: { id: 202 }, message: { chat: { id: 202 } } },
      `quiz:${q}:${answers[q - 1]}`,
      deps,
    );
  }

  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.correct_count, 9);
  assert.ok(progress?.completed_at);

  const lastTwo = deps.telegram.sent.slice(-2).map((m) => m.text);
  assert.equal(lastTwo[0], "You got **9/10**! 🎉");
  assert.equal(lastTwo[1], "🏅 **Thai Talk Breaks Graduate**");

  // 10 questions' worth of correct-answer audio actually played.
  assert.equal(deps.telegram.sentAudio.length, 10);
  assert.deepEqual(
    deps.telegram.sentAudio.map((a) => a.filename),
    DAY30_QUESTIONS.map((q) => q.correctAudioFile),
  );
});

test("an out-of-order quiz answer (wrong question index) is ignored", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(203);
  await startDay30Quiz(learner.id, 203, deps); // now on question 1

  const countBefore = deps.telegram.sent.length;
  await handleDay30QuizCallback(
    { id: "cb-x", from: { id: 203 }, message: { chat: { id: 203 } } },
    "quiz:5:1", // learner is actually on question 1, not 5
    deps,
  );

  assert.equal(deps.telegram.sent.length, countBefore, "stale/out-of-order answer produces no feedback");
  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.current_question_index, 1, "progress unchanged");
});

test("Day 30 quiz never calls Checkpoint 3's dynamic distractor-selection logic (LDTKB-045)", async () => {
  // distractors.ts's pickCrossLessonDistractors/pickNumberDistractors both
  // require a non-trivial input (a lesson pool, a correct number 1-10) that
  // day30Content.ts's fixed data doesn't shape-match — the real evidence
  // this constraint holds is structural: day30Quiz.ts has no import of
  // "@/lib/delivery/distractors" at all. Confirmed by reading the file
  // directly (see CHECKPOINT4.md item 5) rather than only by this test.
  const source = readFileSync(path.join(REPO_ROOT, "src/lib/quiz/day30Quiz.ts"), "utf8");
  const hasImportStatement = /^\s*import\b[^\n]*delivery\/distractors/m.test(source);
  assert.equal(hasImportStatement, false, "day30Quiz.ts must not import Checkpoint 3's distractor-selection module");
});

// --- Part C: testing-only day-window extension -----------------------------

test("dayNumberForLearner respects an arbitrary maxDay (the testing extension is just a bigger cap)", () => {
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-30", 30), 30);
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-31", 30), null, "day 31 is past even the extended window");
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-08", 7), null, "day 8 is past the real 7-day pilot");
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-08", 30), 8, "but day 8 is fine under the extended window");
});

test("findDueLearners with an extended maxDay surfaces day 8-29 (route.ts is responsible for skipping them gracefully)", () => {
  const learner: OnboardedLearner = {
    id: "l1",
    telegram_user_id: 1,
    gender_branch: "male",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: "2026-08-01",
  };
  const now = new Date("2026-08-15T01:00:00.000Z"); // day 15 of the pilot, 08:00 Bangkok
  const withoutExtension = findDueLearners([learner], { now, lookbackMinutes: 30 });
  const withExtension = findDueLearners([learner], { now, lookbackMinutes: 30, maxDay: 30 });

  assert.equal(withoutExtension.length, 0, "day 15 is past the real 7-day window by default");
  assert.equal(withExtension.length, 1);
  assert.equal(withExtension[0].lessonNumber, 15);
});
