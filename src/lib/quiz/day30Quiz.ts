// Day 30 quiz-ladder orchestration (Checkpoint 4, part B). Fundamentally
// different mechanism from Lessons 2-7's activities: those are one-per-day,
// cron-triggered; the quiz is 10 sequential questions progressed entirely
// by callback taps (like onboarding_step's progression), all within
// whatever single cron tick first reaches Day 30 for a learner.
//
// Per day30-quiz-content.md's own worked example, only the CORRECT answer's
// audio plays — see day30Content.ts's header comment for why the 20
// distractor files aren't loaded here. Per LDTKB-045, none of this reuses
// Checkpoint 3's dynamic distractor-selection logic (distractors.ts) —
// Day 30's three options per question are the fixed, pre-authored set from
// day30-button-wording.md, not randomly drawn from other lessons.

import type { MediaFile, TelegramCallbackQuery, TelegramClient } from "@/lib/telegram";
import type { LearnerStore } from "@/lib/onboarding/learnerStore";
import type { Day30QuizStore } from "@/lib/quiz/day30QuizStore";
import { DAY30_QUESTION_COUNT, day30ScoreMessage, DAY30_BADGE_MESSAGE, getDay30Question } from "@/lib/curriculum/day30Content";
import { loadDay30Audio } from "@/lib/curriculum/mediaFiles";

// Deliberately NOT imported from "@/lib/delivery/distractors" (Checkpoint
// 3's dynamic distractor-selection module) — per LDTKB-045, Day 30 has no
// runtime distractor-selection logic at all, only a local type alias for
// the injectable-RNG shape. This file has zero coupling to distractors.ts.
type Rng = () => number;

export interface Day30QuizDeps {
  telegram: TelegramClient;
  learnerStore: LearnerStore;
  quizStore: Day30QuizStore;
  now?: () => Date;
  rng?: Rng;
  /** Defaults to the real curriculum/day30-audio/ loader — injectable for tests. */
  loadAudio?: (filename: string) => Promise<MediaFile>;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function sendQuestion(chatId: number, questionIndex: number, deps: Day30QuizDeps): Promise<void> {
  const rng = deps.rng ?? Math.random;
  const question = getDay30Question(questionIndex);

  const loadAudio = deps.loadAudio ?? loadDay30Audio;
  const audio = await loadAudio(question.correctAudioFile);
  await deps.telegram.sendAudio(chatId, audio, `Question ${questionIndex}/${DAY30_QUESTION_COUNT}`);

  const options = shuffle(
    [
      { text: question.correctButtonText, correct: true },
      { text: question.distractorButtonTexts[0], correct: false },
      { text: question.distractorButtonTexts[1], correct: false },
    ],
    rng,
  );

  await deps.telegram.sendMessage(
    chatId,
    "What did you hear?",
    [options.map((o) => ({ text: o.text, callback_data: `quiz:${questionIndex}:${o.correct ? 1 : 0}` }))],
  );
}

/**
 * Starts the quiz for a learner reaching Day 30, if not already started.
 * Called from the cron delivery route — a no-op if a progress row already
 * exists (that's the guard, same spirit as lesson_deliveries' unique
 * constraint), so a later cron tick never re-sends question 1.
 */
export async function startDay30Quiz(learnerId: string, chatId: number, deps: Day30QuizDeps): Promise<void> {
  const existing = await deps.quizStore.findByLearner(learnerId);
  if (existing) return;

  await deps.quizStore.start(learnerId);
  await sendQuestion(chatId, 1, deps);
}

const POSITIVE_FEEDBACK = "Correct, ka! 🎉";

function negativeFeedback(correctAnswerLabel: string): string {
  return `Not quite, ka — that was "${correctAnswerLabel}."`;
}

export async function handleDay30QuizCallback(
  callbackQuery: TelegramCallbackQuery,
  data: string,
  deps: Day30QuizDeps,
): Promise<void> {
  await deps.telegram.answerCallbackQuery(callbackQuery.id);

  const chatId = callbackQuery.message?.chat.id;
  if (chatId === undefined) return;

  const parts = data.split(":"); // "quiz", questionIndex, correctness
  if (parts.length !== 3) return;
  const questionIndex = Number(parts[1]);
  const isCorrect = parts[2] === "1";

  const learner = await deps.learnerStore.findByTelegramId(callbackQuery.from.id);
  if (!learner) return;

  const progress = await deps.quizStore.findByLearner(learner.id);
  if (!progress || progress.completed_at || progress.current_question_index !== questionIndex) {
    return; // stale/out-of-order/replayed tap, or already finished
  }

  const question = getDay30Question(questionIndex);
  const updated = await deps.quizStore.recordAnswer(progress.id, isCorrect);
  await deps.telegram.sendMessage(chatId, isCorrect ? POSITIVE_FEEDBACK : negativeFeedback(question.correctButtonText));

  if (questionIndex >= DAY30_QUESTION_COUNT) {
    const now = deps.now ? deps.now() : new Date();
    await deps.quizStore.complete(progress.id, now.toISOString());
    await deps.telegram.sendMessage(chatId, day30ScoreMessage(updated.correct_count));
    await deps.telegram.sendMessage(chatId, DAY30_BADGE_MESSAGE);
    return;
  }

  const nextIndex = questionIndex + 1;
  await deps.quizStore.advance(progress.id, nextIndex);
  await sendQuestion(chatId, nextIndex, deps);
}
