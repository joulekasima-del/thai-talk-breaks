// Day 30 quiz-ladder — bot-side trigger + shared quiz logic.
//
// Redesigned (this revision) into a single continuous Web App page: the bot
// side is now minimal — startDay30Quiz below sends exactly one message with
// a web_app button opening /day30-quiz, nothing else. The old back-and-forth
// of native per-question sendAudio + inline-keyboard messages
// (sendQuestion/handleDay30QuizCallback) has been removed entirely; the
// actual question-progression/anti-replay/scoring logic now lives in
// day30QuizApi.ts (the Web App's testable API core), which reuses the
// shuffle/option logic and feedback wording kept here.
//
// Per LDTKB-046's 22 August 2026 amendment (still in force, transport
// change only): every option's audio is the true audio for its own English
// label — correct option -> correct-answer clip, each distractor option ->
// its own distractor clip. No "lying label" scheme. Per LDTKB-045, none of
// this reuses Checkpoint 3's dynamic distractor-selection logic
// (distractors.ts) — Day 30's three options per question are the fixed,
// pre-authored set from day30-button-wording.md, not randomly drawn from
// other lessons.

import type { InlineKeyboard, TelegramClient } from "@/lib/telegram";
import type { Day30QuizStore } from "@/lib/quiz/day30QuizStore";
import type { Day30Question } from "@/lib/curriculum/day30Content";

// Deliberately NOT imported from "@/lib/delivery/distractors" (Checkpoint
// 3's dynamic distractor-selection module) — per LDTKB-045, Day 30 has no
// runtime distractor-selection logic at all, only a local type alias for
// the injectable-RNG shape. This file has zero coupling to distractors.ts.
type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Option "kind" identifies which of a question's 3 audio files an option is
// truthfully paired with — so a tap can play back that exact file
// (LDTKB-046's 22 August amendment), not just report correct/incorrect.
export type OptionKind = "c" | "d1" | "d2";

export function audioFileForKind(question: Day30Question, kind: OptionKind): string {
  if (kind === "c") return question.correctAudioFile;
  if (kind === "d1") return question.distractorAudioFiles[0];
  return question.distractorAudioFiles[1];
}

export interface Day30QuizOption {
  kind: OptionKind;
  text: string;
}

/** The question's 3 options in random order — same shuffle used by the old sendQuestion, now consumed by day30QuizApi.ts's GET handler (freshly shuffled server-side on every call). */
export function shuffledOptionsForQuestion(question: Day30Question, rng: Rng): Day30QuizOption[] {
  return shuffle(
    [
      { text: question.correctButtonText, kind: "c" as OptionKind },
      { text: question.distractorButtonTexts[0], kind: "d1" as OptionKind },
      { text: question.distractorButtonTexts[1], kind: "d2" as OptionKind },
    ],
    rng,
  );
}

// Feedback wording — unchanged from the old handleDay30QuizCallback, kept
// here so day30QuizApi.ts's POST handler returns the exact same text for
// the page to render in-page instead of as a new Telegram message.
export const DAY30_POSITIVE_FEEDBACK = "Correct! 🎉";

export function day30NegativeFeedback(correctAnswerLabel: string): string {
  return `Not quite — that was "${correctAnswerLabel}."`;
}

export interface Day30QuizDeps {
  telegram: TelegramClient;
  quizStore: Day30QuizStore;
  /**
   * Public base URL of the deployed app. Optional, falling back to
   * process.env.APP_URL directly (so the cron route's existing call site
   * doesn't need updating) — same appUrl shape as deliverLesson.ts's and
   * deliverDay29Entry.ts's own deps.
   */
  appUrl?: string;
}

const START_BUTTON_TEXT = "🧠 Start the Day 30 Quiz";

/**
 * Starts the quiz for a learner reaching Day 30, if not already started —
 * now just creates the progress row (unchanged, still reuses
 * quizStore.start) and sends one message with a web_app button opening
 * /day30-quiz. A no-op if a progress row already exists (that's the guard,
 * same spirit as lesson_deliveries' unique constraint), so a later cron
 * tick never re-sends the button.
 */
export async function startDay30Quiz(learnerId: string, chatId: number, deps: Day30QuizDeps): Promise<void> {
  const existing = await deps.quizStore.findByLearner(learnerId);
  if (existing) return;

  await deps.quizStore.start(learnerId);

  const appUrl = deps.appUrl ?? process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL must be set to deliver the Day 30 quiz button");

  const keyboard: InlineKeyboard = [[{ text: START_BUTTON_TEXT, web_app: { url: `${appUrl}/day30-quiz` } }]];
  await deps.telegram.sendMessage(chatId, "Time for your Day 30 quiz! Tap below to get started:", keyboard);
}
