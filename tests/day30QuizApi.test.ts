import { test } from "node:test";
import assert from "node:assert/strict";

import { getDay30QuizStatus, submitDay30QuizAnswer } from "@/lib/quiz/day30QuizApi";
import { DAY30_QUESTIONS, day30ScoreMessage, DAY30_BADGE_MESSAGE } from "@/lib/curriculum/day30Content";
import { FakeLearnerStore } from "./fakes";
import { FakeDay30QuizStore } from "./quizFakes";

// Day 30 quiz — the Web App API's testable core (src/app/api/day30-quiz/route.ts
// is a thin initData-validation wrapper around this). Highest-stakes test
// file in this rollout: this is where the quiz's actual
// correctness-tracking / resumability / anti-replay logic now lives, moved
// out of the old handleDay30QuizCallback.

function makeDeps(rngSequence: number[] = []) {
  let i = 0;
  const rng = () => (i < rngSequence.length ? rngSequence[i++] : 0.99);
  return {
    learnerStore: new FakeLearnerStore(),
    quizStore: new FakeDay30QuizStore(),
    now: () => new Date("2026-08-23T01:00:00.000Z"),
    rng,
  };
}

async function learnerWithStartedQuiz(deps: ReturnType<typeof makeDeps>, telegramUserId: number) {
  const learner = await deps.learnerStore.create(telegramUserId);
  await deps.quizStore.start(learner.id);
  return learner;
}

// --- GET: learner/started-quiz guards --------------------------------------

test("GET: unknown telegram user id -> learner_not_found", async () => {
  const deps = makeDeps();
  const result = await getDay30QuizStatus(999, deps);
  assert.deepEqual(result, { ok: false, error: "learner_not_found" });
});

test("GET: known learner whose quiz hasn't been started yet (no guessed-URL early access) -> quiz_not_started", async () => {
  const deps = makeDeps();
  await deps.learnerStore.create(1);
  const result = await getDay30QuizStatus(1, deps);
  assert.deepEqual(result, { ok: false, error: "quiz_not_started" });
});

// --- GET: question shape ----------------------------------------------------

test("GET: freshly started quiz returns question 1, all 3 options with true audio URLs, running score 0", async () => {
  const deps = makeDeps();
  const learner = await learnerWithStartedQuiz(deps, 2);

  const result = await getDay30QuizStatus(2, deps);
  assert.equal(result.ok, true);
  if (!result.ok || result.state.status !== "in_progress") throw new Error("expected in_progress state");

  assert.equal(result.state.questionIndex, 1);
  assert.equal(result.state.questionCount, 10);
  assert.equal(result.state.correctCount, 0);
  assert.equal(result.state.options.length, 3);

  const q1 = DAY30_QUESTIONS[0];
  const byKind = Object.fromEntries(result.state.options.map((o) => [o.kind, o]));
  assert.equal(byKind.c.text, q1.correctButtonText);
  assert.equal(byKind.c.audioUrl, `/day30-audio/${q1.correctAudioFile}`);
  assert.equal(byKind.d1.text, q1.distractorButtonTexts[0]);
  assert.equal(byKind.d1.audioUrl, `/day30-audio/${q1.distractorAudioFiles[0]}`);
  assert.equal(byKind.d2.text, q1.distractorButtonTexts[1]);
  assert.equal(byKind.d2.audioUrl, `/day30-audio/${q1.distractorAudioFiles[1]}`);

  void learner;
});

test("GET: options are shuffled server-side using the injected RNG (deterministic under a fixed sequence)", async () => {
  const deps = makeDeps([0.9, 0.1]); // drives the Fisher-Yates shuffle deterministically
  await learnerWithStartedQuiz(deps, 3);

  const result = await getDay30QuizStatus(3, deps);
  if (!result.ok || result.state.status !== "in_progress") throw new Error("expected in_progress state");

  // Same fixed RNG sequence must reproduce the same order every time.
  const deps2 = makeDeps([0.9, 0.1]);
  await learnerWithStartedQuiz(deps2, 3);
  const result2 = await getDay30QuizStatus(3, deps2);
  if (!result2.ok || result2.state.status !== "in_progress") throw new Error("expected in_progress state");

  assert.deepEqual(result.state.options.map((o) => o.kind), result2.state.options.map((o) => o.kind));
  // All 3 kinds present regardless of order.
  assert.deepEqual(new Set(result.state.options.map((o) => o.kind)), new Set(["c", "d1", "d2"]));
});

// --- POST: answering, feedback wording, scoring -----------------------------

test("POST: correct answer -> correct=true, positive feedback, correct_count incremented, advances to question 2", async () => {
  const deps = makeDeps();
  const learner = await learnerWithStartedQuiz(deps, 4);

  const result = await submitDay30QuizAnswer(4, 1, "c", deps);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(result.correct, true);
  assert.equal(result.feedbackMessage, "Correct! 🎉");
  if (result.state.status !== "in_progress") throw new Error("expected in_progress state (question 2)");
  assert.equal(result.state.questionIndex, 2);
  assert.equal(result.state.correctCount, 1);

  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.current_question_index, 2);
  assert.equal(progress?.correct_count, 1);
});

test("POST: incorrect answer (distractor 1) -> correct=false, negative feedback names the correct answer, correct_count unchanged", async () => {
  const deps = makeDeps();
  const learner = await learnerWithStartedQuiz(deps, 5);
  const q1 = DAY30_QUESTIONS[0];

  const result = await submitDay30QuizAnswer(5, 1, "d1", deps);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(result.correct, false);
  assert.equal(result.feedbackMessage, `Not quite — that was "${q1.correctButtonText}."`);

  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.correct_count, 0);
  assert.equal(progress?.current_question_index, 2, "still advances even on a wrong answer");
});

test("POST: incorrect answer (distractor 2) also produces the correct negative feedback", async () => {
  const deps = makeDeps();
  await learnerWithStartedQuiz(deps, 6);
  const q1 = DAY30_QUESTIONS[0];

  const result = await submitDay30QuizAnswer(6, 1, "d2", deps);
  if (!result.ok) throw new Error("expected ok");
  assert.equal(result.correct, false);
  assert.equal(result.feedbackMessage, `Not quite — that was "${q1.correctButtonText}."`);
});

test("each answer is saved immediately, not batched: a fresh GET right after one POST reflects the write", async () => {
  const deps = makeDeps();
  await learnerWithStartedQuiz(deps, 7);

  await submitDay30QuizAnswer(7, 1, "c", deps);

  const status = await getDay30QuizStatus(7, deps);
  if (!status.ok || status.state.status !== "in_progress") throw new Error("expected in_progress state");
  assert.equal(status.state.questionIndex, 2, "GET immediately reflects the single answer just recorded");
  assert.equal(status.state.correctCount, 1);
});

// --- Resumability: closing and reopening resumes exactly where left off ----

test("resumability: after answering 3 of 10 questions, GET (simulating a reopened app) resumes at question 4 with the running score", async () => {
  const deps = makeDeps();
  await learnerWithStartedQuiz(deps, 8);

  await submitDay30QuizAnswer(8, 1, "c", deps); // correct
  await submitDay30QuizAnswer(8, 2, "d1", deps); // wrong
  await submitDay30QuizAnswer(8, 3, "c", deps); // correct

  // A brand-new "session" — a fresh GET is all a reopened Web App does.
  const resumed = await getDay30QuizStatus(8, deps);
  if (!resumed.ok || resumed.state.status !== "in_progress") throw new Error("expected in_progress state");
  assert.equal(resumed.state.questionIndex, 4, "resumes exactly at the next unanswered question");
  assert.equal(resumed.state.correctCount, 2);
});

// --- Anti-replay: stale/out-of-order/replayed taps -------------------------

test("POST: questionIndex that doesn't match current_question_index is rejected as stale_answer, with no write", async () => {
  const deps = makeDeps();
  const learner = await learnerWithStartedQuiz(deps, 9); // on question 1

  const result = await submitDay30QuizAnswer(9, 5, "c", deps); // learner is actually on question 1, not 5
  assert.deepEqual(result, { ok: false, error: "stale_answer" });

  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.current_question_index, 1, "unchanged");
  assert.equal(progress?.correct_count, 0, "unchanged — no write happened");
});

test("POST: a replayed tap for a question already answered (now on the next question) is rejected as stale_answer", async () => {
  const deps = makeDeps();
  const learner = await learnerWithStartedQuiz(deps, 10);

  await submitDay30QuizAnswer(10, 1, "c", deps); // now on question 2, correct_count 1
  const replay = await submitDay30QuizAnswer(10, 1, "d1", deps); // replaying question 1's tap

  assert.deepEqual(replay, { ok: false, error: "stale_answer" });
  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.correct_count, 1, "the replayed tap must not double-count or flip the recorded answer");
  assert.equal(progress?.current_question_index, 2, "unchanged by the rejected replay");
});

test("POST: any answer after completion is rejected as stale_answer, even a fresh/valid-looking one", async () => {
  const deps = makeDeps();
  await learnerWithStartedQuiz(deps, 11);
  for (let q = 1; q <= 10; q++) {
    await submitDay30QuizAnswer(11, q, "c", deps);
  }

  const afterCompletion = await submitDay30QuizAnswer(11, 10, "c", deps);
  assert.deepEqual(afterCompletion, { ok: false, error: "stale_answer" });
});

test("POST: unknown telegram user id -> learner_not_found", async () => {
  const deps = makeDeps();
  const result = await submitDay30QuizAnswer(12345, 1, "c", deps);
  assert.deepEqual(result, { ok: false, error: "learner_not_found" });
});

test("POST: known learner whose quiz hasn't been started -> quiz_not_started", async () => {
  const deps = makeDeps();
  await deps.learnerStore.create(12);
  const result = await submitDay30QuizAnswer(12, 1, "c", deps);
  assert.deepEqual(result, { ok: false, error: "quiz_not_started" });
});

// --- Full run + completion --------------------------------------------------

test("full 10-question run: correct/incorrect tracked accurately, ends completed with the right score+badge", async () => {
  const deps = makeDeps();
  const learner = await learnerWithStartedQuiz(deps, 13);

  // correct, correct, incorrect, correct x7 -> 9/10.
  const answers: ("c" | "d1")[] = ["c", "c", "d1", "c", "c", "c", "c", "c", "c", "c"];
  let last;
  for (let q = 1; q <= 10; q++) {
    last = await submitDay30QuizAnswer(13, q, answers[q - 1], deps);
    assert.equal(last.ok, true);
  }

  if (!last?.ok) throw new Error("expected the final answer to be ok");
  assert.equal(last.state.status, "completed");
  if (last.state.status !== "completed") throw new Error("expected completed");
  assert.equal(last.state.correctCount, 9);
  assert.equal(last.state.scoreMessage, day30ScoreMessage(9));
  assert.equal(last.state.badgeMessage, DAY30_BADGE_MESSAGE);

  const progress = await deps.quizStore.findByLearner(learner.id);
  assert.equal(progress?.correct_count, 9);
  assert.ok(progress?.completed_at);
});

test("GET after completion reports the completed state (score + badge), not a question", async () => {
  const deps = makeDeps();
  await learnerWithStartedQuiz(deps, 14);
  for (let q = 1; q <= 10; q++) {
    await submitDay30QuizAnswer(14, q, "c", deps);
  }

  const status = await getDay30QuizStatus(14, deps);
  assert.equal(status.ok, true);
  if (!status.ok) throw new Error("expected ok");
  assert.deepEqual(status.state, {
    status: "completed",
    correctCount: 10,
    questionCount: 10,
    scoreMessage: day30ScoreMessage(10),
    badgeMessage: DAY30_BADGE_MESSAGE,
  });
});
