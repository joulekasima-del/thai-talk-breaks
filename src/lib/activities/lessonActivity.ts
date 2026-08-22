// Recognition-tap response handling for Lessons 2-7 and, as of Checkpoint 5,
// Days 8-28 (Weeks 2-4) — same handler, same pattern, extended additively.
// Lesson 1 has no activity (LDTKB-006/Checkpoint 3 discussion) and never
// reaches this module — deliverLesson.ts never sends an "activity:" callback
// for lesson 1.
//
// Callback data shapes, produced by deliverLesson.ts's deliverActivity:
//   activity:phrase:<lessonNumber>:<0|1>              — standard phrase days (Lessons 1,3-7, Days 9,11-25,27,28; only non-Lesson-1 ones fire)
//   activity:num:<correctNumber>:<0|1>                — Lesson 2 (numbers)
//   activity:wordset:<lessonNumber>:<correctIndex>:<0|1> — Days 8, 10, 16, 26 (Checkpoint 5)
// Correctness is read directly off the tapped button, not re-derived here.

import { getLesson } from "@/lib/curriculum/content";
import type { TelegramClient, TelegramCallbackQuery } from "@/lib/telegram";
import type { LearnerStore } from "@/lib/onboarding/learnerStore";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";

export interface LessonActivityDeps {
  telegram: TelegramClient;
  learnerStore: LearnerStore;
  deliveryStore: DeliveryStore;
  now?: () => Date;
}

const POSITIVE_FEEDBACK = "That's right, ka! 🎉";

function negativeFeedback(correctAnswerLabel: string): string {
  return `Not quite, ka — that was "${correctAnswerLabel}."`;
}

export async function handleLessonActivityCallback(
  callbackQuery: TelegramCallbackQuery,
  data: string,
  deps: LessonActivityDeps,
): Promise<void> {
  await deps.telegram.answerCallbackQuery(callbackQuery.id);

  const chatId = callbackQuery.message?.chat.id;
  if (chatId === undefined) return;

  const parts = data.split(":"); // "activity", kind, ...identifiers, correctness (last part)
  const kind = parts[1];
  const isCorrect = parts.at(-1) === "1";

  const learner = await deps.learnerStore.findByTelegramId(callbackQuery.from.id);
  if (!learner) return;

  let lessonNumber: number;
  let correctAnswerLabel: string;

  if (kind === "phrase" && parts.length === 4) {
    lessonNumber = Number(parts[2]);
    const lesson = getLesson(lessonNumber);
    if (lesson.kind !== "phrase") return; // malformed/stale callback
    correctAnswerLabel = lesson.englishMeaning;
  } else if (kind === "num" && parts.length === 4) {
    lessonNumber = 2;
    correctAnswerLabel = parts[2]; // the correct number itself, e.g. "5"
  } else if (kind === "wordset" && parts.length === 5) {
    // Checkpoint 5 — Days 8, 10, 16, 26.
    lessonNumber = Number(parts[2]);
    const correctIndex = Number(parts[3]);
    const lesson = getLesson(lessonNumber);
    if (lesson.kind !== "wordset") return; // malformed/stale callback
    const correctWord = lesson.words.find((w) => w.index === correctIndex);
    if (!correctWord) return;
    correctAnswerLabel = correctWord.meaning;
  } else {
    return; // unrecognized/malformed activity callback
  }

  const delivery = await deps.deliveryStore.findUnansweredActivity(learner.id, lessonNumber);
  if (!delivery) return; // already answered, or no matching delivery — stale/replayed tap

  const now = deps.now ? deps.now() : new Date();
  await deps.deliveryStore.markActivityAnswered(delivery.id, isCorrect, now.toISOString());

  await deps.telegram.sendMessage(chatId, isCorrect ? POSITIVE_FEEDBACK : negativeFeedback(correctAnswerLabel));
}
