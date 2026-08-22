// Recognition-tap response handling for Lessons 2-7 (Checkpoint 4, part A).
// Lesson 1 has no activity (LDTKB-006/Checkpoint 3 discussion) and never
// reaches this module — deliverLesson.ts never sends an "activity:" callback
// for lesson 1.
//
// Callback data shapes, produced by deliverLesson.ts's deliverActivity:
//   activity:phrase:<lessonNumber>:<0|1>   — Lessons 1,3-7 (only 3-7 actually fire)
//   activity:num:<correctNumber>:<0|1>     — Lesson 2 (numbers)
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

  const parts = data.split(":"); // "activity", kind, identifier, correctness
  if (parts.length !== 4) return;
  const [, kind, identifier, correctnessFlag] = parts;
  const isCorrect = correctnessFlag === "1";

  const learner = await deps.learnerStore.findByTelegramId(callbackQuery.from.id);
  if (!learner) return;

  let lessonNumber: number;
  let correctAnswerLabel: string;

  if (kind === "phrase") {
    lessonNumber = Number(identifier);
    const lesson = getLesson(lessonNumber);
    if (lesson.kind !== "phrase") return; // malformed/stale callback
    correctAnswerLabel = lesson.englishMeaning;
  } else if (kind === "num") {
    lessonNumber = 2;
    correctAnswerLabel = identifier; // the correct number itself, e.g. "5"
  } else {
    return; // unrecognized activity kind
  }

  const delivery = await deps.deliveryStore.findUnansweredActivity(learner.id, lessonNumber);
  if (!delivery) return; // already answered, or no matching delivery — stale/replayed tap

  const now = deps.now ? deps.now() : new Date();
  await deps.deliveryStore.markActivityAnswered(delivery.id, isCorrect, now.toISOString());

  await deps.telegram.sendMessage(chatId, isCorrect ? POSITIVE_FEEDBACK : negativeFeedback(correctAnswerLabel));
}
