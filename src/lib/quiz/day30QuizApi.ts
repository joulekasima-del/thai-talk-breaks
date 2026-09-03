// Testable core of the Day 30 quiz Web App API
// (src/app/api/day30-quiz/route.ts). Same separation-of-concerns pattern as
// day29/questApi.ts and lessonAudio/lessonAudioApi.ts — all I/O behind
// injected interfaces, initData validation handled by the route before
// calling in here with an already-verified telegramUserId.
//
// This is where the actual quiz-progression logic now lives — moved out of
// day30Quiz.ts's old handleDay30QuizCallback (native Telegram callbacks,
// removed entirely). The same guarantees that logic provided are preserved
// here:
//   - Resumability: current_question_index/correct_count/completed_at are
//     the single source of truth in day30_quiz_progress (unchanged schema,
//     unchanged Day30QuizStore) — GET always reflects whatever the DB says,
//     so closing and reopening the Web App resumes exactly where the
//     learner left off, no client-side state needed.
//   - Anti-replay: submitDay30QuizAnswer takes the questionIndex the client
//     believes it's answering and rejects (without writing anything) unless
//     it matches progress.current_question_index exactly, and unless the
//     quiz isn't already completed — identical to the old callback's guard
//     (`!progress || progress.completed_at || progress.current_question_index
//     !== questionIndex`).
//   - Each answer is written immediately (recordAnswer, then advance/complete
//     in the same call) — not batched at the end.

import type { LearnerStore } from "@/lib/onboarding/learnerStore";
import type { Day30QuizProgress, Day30QuizStore } from "@/lib/quiz/day30QuizStore";
import { DAY30_QUESTION_COUNT, day30ScoreMessage, DAY30_BADGE_MESSAGE, getDay30Question } from "@/lib/curriculum/day30Content";
import { audioFileForKind, day30NegativeFeedback, DAY30_POSITIVE_FEEDBACK, shuffledOptionsForQuestion, type OptionKind } from "@/lib/quiz/day30Quiz";

type Rng = () => number;

export interface Day30QuizApiDeps {
  learnerStore: LearnerStore;
  quizStore: Day30QuizStore;
  now?: () => Date;
  /** Injectable RNG for the per-call option shuffle — defaults to Math.random. */
  rng?: Rng;
}

/** `/day30-audio/{filename}` — served from public/day30-audio/ (scripts/syncDay30QuizAssets.mjs). */
function day30AudioUrl(filename: string): string {
  return `/day30-audio/${filename}`;
}

export interface Day30QuizOptionView {
  kind: OptionKind;
  text: string;
  audioUrl: string;
}

export interface Day30QuizInProgressState {
  status: "in_progress";
  questionIndex: number;
  questionCount: number;
  options: Day30QuizOptionView[];
  correctCount: number;
}

export interface Day30QuizCompletedState {
  status: "completed";
  correctCount: number;
  questionCount: number;
  scoreMessage: string;
  badgeMessage: string;
}

export type Day30QuizState = Day30QuizInProgressState | Day30QuizCompletedState;

function buildInProgressState(progress: Day30QuizProgress, rng: Rng): Day30QuizInProgressState {
  const question = getDay30Question(progress.current_question_index);
  const options = shuffledOptionsForQuestion(question, rng).map((option) => ({
    kind: option.kind,
    text: option.text,
    audioUrl: day30AudioUrl(audioFileForKind(question, option.kind)),
  }));
  return {
    status: "in_progress",
    questionIndex: progress.current_question_index,
    questionCount: DAY30_QUESTION_COUNT,
    options,
    correctCount: progress.correct_count,
  };
}

function buildCompletedState(progress: Day30QuizProgress): Day30QuizCompletedState {
  return {
    status: "completed",
    correctCount: progress.correct_count,
    questionCount: DAY30_QUESTION_COUNT,
    scoreMessage: day30ScoreMessage(progress.correct_count),
    badgeMessage: DAY30_BADGE_MESSAGE,
  };
}

function buildState(progress: Day30QuizProgress, rng: Rng): Day30QuizState {
  return progress.completed_at ? buildCompletedState(progress) : buildInProgressState(progress, rng);
}

export type Day30QuizStatusResult =
  | { ok: true; state: Day30QuizState }
  | { ok: false; error: "learner_not_found" | "quiz_not_started" };

/** GET — current progress, freshly shuffled each call (resuming an in-progress quiz, or reporting completion if already done). */
export async function getDay30QuizStatus(telegramUserId: number, deps: Day30QuizApiDeps): Promise<Day30QuizStatusResult> {
  const learner = await deps.learnerStore.findByTelegramId(telegramUserId);
  if (!learner) return { ok: false, error: "learner_not_found" };

  const progress = await deps.quizStore.findByLearner(learner.id);
  // Not yet started: the bot always creates the progress row before ever
  // sending the /day30-quiz button (startDay30Quiz), so this is only
  // reachable via a guessed/early URL — same "can't reach content early"
  // spirit as lessonAudioApi.ts's not_yet_delivered guard.
  if (!progress) return { ok: false, error: "quiz_not_started" };

  const rng = deps.rng ?? Math.random;
  return { ok: true, state: buildState(progress, rng) };
}

export type Day30QuizAnswerResult =
  | { ok: true; correct: boolean; feedbackMessage: string; state: Day30QuizState }
  | { ok: false; error: "learner_not_found" | "quiz_not_started" | "stale_answer" };

/**
 * POST — records the tapped option for the current question, then advances
 * or completes. `questionIndex` is the question the client believes it's
 * answering; `kind` is the tapped option's kind ("c"/"d1"/"d2").
 *
 * Anti-replay: rejects (no write at all) if the quiz is already completed,
 * or if questionIndex doesn't match progress.current_question_index —
 * exactly the old handleDay30QuizCallback's guard, just returning a typed
 * error instead of silently no-op-ing (the route maps this to a 409, and
 * the page treats it as "re-fetch state and resume from wherever the DB
 * actually has you").
 */
export async function submitDay30QuizAnswer(
  telegramUserId: number,
  questionIndex: number,
  kind: OptionKind,
  deps: Day30QuizApiDeps,
): Promise<Day30QuizAnswerResult> {
  const learner = await deps.learnerStore.findByTelegramId(telegramUserId);
  if (!learner) return { ok: false, error: "learner_not_found" };

  const progress = await deps.quizStore.findByLearner(learner.id);
  if (!progress) return { ok: false, error: "quiz_not_started" };

  if (progress.completed_at || progress.current_question_index !== questionIndex) {
    return { ok: false, error: "stale_answer" };
  }

  const question = getDay30Question(questionIndex);
  const isCorrect = kind === "c";
  const feedbackMessage = isCorrect ? DAY30_POSITIVE_FEEDBACK : day30NegativeFeedback(question.correctButtonText);

  // Written immediately, not batched — same "save on every tap" guarantee
  // the old native flow provided via one DB write per callback.
  const afterAnswer = await deps.quizStore.recordAnswer(progress.id, isCorrect);

  const rng = deps.rng ?? Math.random;

  if (questionIndex >= DAY30_QUESTION_COUNT) {
    const now = deps.now ? deps.now() : new Date();
    const completed = await deps.quizStore.complete(afterAnswer.id, now.toISOString());
    return { ok: true, correct: isCorrect, feedbackMessage, state: buildState(completed, rng) };
  }

  const advanced = await deps.quizStore.advance(afterAnswer.id, questionIndex + 1);
  return { ok: true, correct: isCorrect, feedbackMessage, state: buildState(advanced, rng) };
}
