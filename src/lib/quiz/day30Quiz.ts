// Day 30 quiz-ladder orchestration (Checkpoint 4, part B). Fundamentally
// different mechanism from Lessons 2-7's activities: those are one-per-day,
// cron-triggered; the quiz is 10 sequential questions progressed entirely
// by callback taps (like onboarding_step's progression), all within
// whatever single cron tick first reaches Day 30 for a learner.
//
// Per LDTKB-046's 22 August 2026 amendment (Checkpoint 4 follow-up): the
// upfront prompt always plays the correct answer's audio (unchanged), and
// on tap, the TAPPED button also plays its own real audio — correct button
// -> correct-answer clip, each distractor button -> its own distractor
// clip. Every button's audio is always the true audio for its own English
// label; no "lying label" scheme (considered and explicitly rejected, see
// LDTKB-046). Per LDTKB-045, none of this reuses Checkpoint 3's dynamic
// distractor-selection logic (distractors.ts) — Day 30's three options per
// question are the fixed, pre-authored set from day30-button-wording.md,
// not randomly drawn from other lessons.

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

// Option "kind" identifies which of a question's 3 audio files a button is
// truthfully paired with — encoded in callback_data so a tap can play back
// that exact file (LDTKB-046's 22 August amendment), not just report
// correct/incorrect.
type OptionKind = "c" | "d1" | "d2";

function audioFileForKind(question: ReturnType<typeof getDay30Question>, kind: OptionKind): string {
  if (kind === "c") return question.correctAudioFile;
  if (kind === "d1") return question.distractorAudioFiles[0];
  return question.distractorAudioFiles[1];
}

async function sendQuestion(chatId: number, questionIndex: number, deps: Day30QuizDeps): Promise<void> {
  const rng = deps.rng ?? Math.random;
  const question = getDay30Question(questionIndex);
  const loadAudio = deps.loadAudio ?? loadDay30Audio;

  // Upfront prompt audio — unchanged from before this fix. Rule B
  // (anonymized): "Question N/10" reveals nothing, kept as the title.
  const promptAudio = await loadAudio(question.correctAudioFile);
  await deps.telegram.sendAudio(chatId, promptAudio, {
    title: `Question ${questionIndex}/${DAY30_QUESTION_COUNT}`,
    performer: "Day 30 Quiz",
  });

  const options = shuffle(
    [
      { text: question.correctButtonText, kind: "c" as OptionKind },
      { text: question.distractorButtonTexts[0], kind: "d1" as OptionKind },
      { text: question.distractorButtonTexts[1], kind: "d2" as OptionKind },
    ],
    rng,
  );

  await deps.telegram.sendMessage(
    chatId,
    "What did you hear?",
    [options.map((o) => ({ text: o.text, callback_data: `quiz:${questionIndex}:${o.kind}` }))],
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

const POSITIVE_FEEDBACK = "Correct! 🎉";

function negativeFeedback(correctAnswerLabel: string): string {
  return `Not quite — that was "${correctAnswerLabel}."`;
}

export async function handleDay30QuizCallback(
  callbackQuery: TelegramCallbackQuery,
  data: string,
  deps: Day30QuizDeps,
): Promise<void> {
  await deps.telegram.answerCallbackQuery(callbackQuery.id);

  const chatId = callbackQuery.message?.chat.id;
  if (chatId === undefined) return;

  const parts = data.split(":"); // "quiz", questionIndex, optionKind ("c"|"d1"|"d2")
  if (parts.length !== 3) return;
  const questionIndex = Number(parts[1]);
  const kind = parts[2];
  if (kind !== "c" && kind !== "d1" && kind !== "d2") return;
  const isCorrect = kind === "c";

  const learner = await deps.learnerStore.findByTelegramId(callbackQuery.from.id);
  if (!learner) return;

  const progress = await deps.quizStore.findByLearner(learner.id);
  if (!progress || progress.completed_at || progress.current_question_index !== questionIndex) {
    return; // stale/out-of-order/replayed tap, or already finished
  }

  const question = getDay30Question(questionIndex);

  // The tapped button's own real audio — LDTKB-046's 22 August amendment.
  // Plays before the feedback message, in addition to (not instead of) the
  // upfront prompt audio already sent when the question was shown.
  const loadAudio = deps.loadAudio ?? loadDay30Audio;
  const tappedAudio = await loadAudio(audioFileForKind(question, kind));
  // Rule B (anonymized) — generic title, nothing about which option this was.
  await deps.telegram.sendAudio(chatId, tappedAudio, { title: "Day 30", performer: "Day 30 Quiz" });

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
