import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { startDay30Quiz, handleDay30QuizCallback } from "@/lib/quiz/day30Quiz";
import { DAY30_QUESTIONS, day30ScoreMessage, DAY30_BADGE_MESSAGE } from "@/lib/curriculum/day30Content";
import { dayNumberForLearner, findDueLearners, type OnboardedLearner } from "@/lib/delivery/dueLearners";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeDay30QuizStore } from "./quizFakes";
import type { MediaFile } from "@/lib/telegram";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Regression check: day30Content.ts matches day30-button-wording.md ----

test("Day 30 quiz content matches day30-button-wording.md verbatim", () => {
  const raw = readFileSync(path.join(REPO_ROOT, "curriculum/day30-button-wording.md"), "utf8");
  const rows = [...raw.matchAll(/\| (Q\d+_\S+\.mp3) \| \S+.*? \| (.+?) \|$/gm)];
  const byFile = new Map(rows.map((m) => [m[1], m[2].trim()]));

  for (const q of DAY30_QUESTIONS) {
    assert.equal(byFile.get(q.correctAudioFile), q.correctButtonText, `Q${q.index} correct button text`);
    assert.equal(q.distractorAudioFiles[0], `Q${q.index}_distractor-1.mp3`, `Q${q.index} distractor 1 audio filename`);
    assert.equal(q.distractorAudioFiles[1], `Q${q.index}_distractor-2.mp3`, `Q${q.index} distractor 2 audio filename`);
    assert.equal(byFile.get(q.distractorAudioFiles[0]), q.distractorButtonTexts[0], `Q${q.index} distractor 1 button text`);
    assert.equal(byFile.get(q.distractorAudioFiles[1]), q.distractorButtonTexts[1], `Q${q.index} distractor 2 button text`);
  }
});

test("day30ScoreMessage and badge match day30-quiz-content.md's locked format", () => {
  assert.equal(day30ScoreMessage(7), "You got **7/10**! 🎉");
  assert.equal(DAY30_BADGE_MESSAGE, "🏅 **Thai Talk Breaks Graduate**");
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

  // Answer: correct, correct, incorrect (d1), correct x7 -> 9/10.
  const answers = ["c", "c", "d1", "c", "c", "c", "c", "c", "c", "c"];
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

  // 10 upfront prompts + 10 tap-audio plays (one per answered question) = 20.
  assert.equal(deps.telegram.sentAudio.length, 20);
});

test("an out-of-order quiz answer (wrong question index) is ignored", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(203);
  await startDay30Quiz(learner.id, 203, deps); // now on question 1

  const countBefore = deps.telegram.sent.length;
  await handleDay30QuizCallback(
    { id: "cb-x", from: { id: 203 }, message: { chat: { id: 203 } } },
    "quiz:5:c", // learner is actually on question 1, not 5
    deps,
  );

  assert.equal(deps.telegram.sent.length, countBefore, "stale/out-of-order answer produces no feedback");
  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.current_question_index, 1, "progress unchanged");
});

// --- Checkpoint 4 follow-up: tapped button plays its own real audio -------
// (LDTKB-046, amended 22 August 2026)

test("upfront prompt audio is unchanged: still just the correct-answer clip, once, before any tap", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(210);

  await startDay30Quiz(learner.id, 210, deps);

  assert.equal(deps.telegram.sentAudio.length, 1);
  assert.equal(deps.telegram.sentAudio[0].filename, "Q1_correct_answer.mp3");
});

// Note: tapping question 1 auto-advances and sends question 2's own upfront
// prompt audio too (unless it's the last question) — so the tapped clip is
// checked at a specific index (the one immediately after the Q1 prompt),
// not via "last audio sent" or an exact total count.

test("tapping the correct button plays the correct-answer audio again, in addition to the prompt", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(211);
  await startDay30Quiz(learner.id, 211, deps); // sentAudio[0] = Q1 prompt

  await handleDay30QuizCallback(
    { id: "cb-211", from: { id: 211 }, message: { chat: { id: 211 } } },
    "quiz:1:c",
    deps,
  );

  assert.equal(deps.telegram.sentAudio[0].filename, "Q1_correct_answer.mp3", "unchanged upfront prompt");
  assert.equal(deps.telegram.sentAudio[1].filename, "Q1_correct_answer.mp3", "tapped-button audio, played again");
});

test("tapping distractor button 1 plays that specific distractor's own audio file", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(212);
  await startDay30Quiz(learner.id, 212, deps);

  await handleDay30QuizCallback(
    { id: "cb-212", from: { id: 212 }, message: { chat: { id: 212 } } },
    "quiz:1:d1",
    deps,
  );

  assert.equal(deps.telegram.sentAudio[1].filename, "Q1_distractor-1.mp3");
});

test("tapping distractor button 2 plays that specific distractor's own audio file", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(213);
  await startDay30Quiz(learner.id, 213, deps);

  await handleDay30QuizCallback(
    { id: "cb-213", from: { id: 213 }, message: { chat: { id: 213 } } },
    "quiz:1:d2",
    deps,
  );

  assert.equal(deps.telegram.sentAudio[1].filename, "Q1_distractor-2.mp3");
});

test("on the final question, tapping plays its own audio and does NOT trigger a next-question prompt", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(215);
  await startDay30Quiz(learner.id, 215, deps);
  // Fast-forward through questions 1-9 with correct answers.
  for (let q = 1; q <= 9; q++) {
    await handleDay30QuizCallback(
      { id: `cb-215-${q}`, from: { id: 215 }, message: { chat: { id: 215 } } },
      `quiz:${q}:c`,
      deps,
    );
  }
  const audioCountBeforeQ10Tap = deps.telegram.sentAudio.length;

  await handleDay30QuizCallback(
    { id: "cb-215-10", from: { id: 215 }, message: { chat: { id: 215 } } },
    "quiz:10:d2",
    deps,
  );

  // Exactly one new audio (the tapped distractor) — no question 11 exists to prompt.
  assert.equal(deps.telegram.sentAudio.length, audioCountBeforeQ10Tap + 1);
  assert.equal(deps.telegram.sentAudio.at(-1)?.filename, "Q10_distractor-2.mp3");
});

test("across all 10 questions, every button's callback_data kind maps to that button's own true audio file", () => {
  for (const q of DAY30_QUESTIONS) {
    // Mirrors audioFileForKind's mapping without importing an internal —
    // asserts the content data itself is self-consistent.
    assert.equal(q.correctAudioFile, `Q${q.index}_correct_answer.mp3`);
    assert.deepEqual(q.distractorAudioFiles, [`Q${q.index}_distractor-1.mp3`, `Q${q.index}_distractor-2.mp3`]);
  }
});

test("tapping a button still records correctness and sends feedback exactly as before this fix", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(214);
  await startDay30Quiz(learner.id, 214, deps); // sent[0] = "What did you hear?" (question 1)

  await handleDay30QuizCallback(
    { id: "cb-214a", from: { id: 214 }, message: { chat: { id: 214 } } },
    "quiz:1:d2",
    deps,
  );

  // sent[1] is the feedback; sent[2] (if present) is question 2's prompt message.
  assert.match(deps.telegram.sent[1]?.text ?? "", /Not quite/);
  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.correct_count, 0);
  assert.equal(progress?.current_question_index, 2, "still advances to the next question");
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
