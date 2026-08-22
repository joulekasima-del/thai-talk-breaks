// Testable core of the Surprise Quest API (src/app/api/day29/quest-status/route.ts).
// Kept separate from the route handler, same pattern as deliverLesson.ts /
// day30Quiz.ts — all I/O behind injected interfaces, initData validation
// handled by the route before calling in here with an already-verified
// telegramUserId.

import type { LearnerStore } from "@/lib/onboarding/learnerStore";
import type { Day29QuestStore } from "@/lib/day29/questStore";
import { DAY29_QUEST_CORRECT_ANSWER_ID } from "@/lib/day29/comicContent";

export interface QuestApiDeps {
  learnerStore: LearnerStore;
  questStore: Day29QuestStore;
  now?: () => Date;
}

export type QuestStatusResult =
  | { ok: true; answeredCorrectly: boolean; answeredCorrectlyAt: string | null }
  | { ok: false; error: "learner_not_found" };

export async function getQuestStatus(telegramUserId: number, deps: QuestApiDeps): Promise<QuestStatusResult> {
  const learner = await deps.learnerStore.findByTelegramId(telegramUserId);
  if (!learner) return { ok: false, error: "learner_not_found" };

  const progress = await deps.questStore.findByLearner(learner.id);
  return {
    ok: true,
    answeredCorrectly: progress !== null,
    answeredCorrectlyAt: progress?.answered_correctly_at ?? null,
  };
}

export type QuestAnswerResult =
  | { ok: true; correct: true; alreadyAnswered: boolean }
  | { ok: true; correct: false }
  | { ok: false; error: "learner_not_found" };

/**
 * Unlimited wrong attempts (day29-living-comic-spec.md): a wrong answerId
 * simply returns { correct: false } with no write at all. Once a row exists
 * (first correct answer), every later call — right or wrong — short-circuits
 * to { correct: true, alreadyAnswered: true } without re-checking answerId,
 * since the question is permanently locked at that point.
 */
export async function submitQuestAnswer(
  telegramUserId: number,
  answerId: string,
  deps: QuestApiDeps,
): Promise<QuestAnswerResult> {
  const learner = await deps.learnerStore.findByTelegramId(telegramUserId);
  if (!learner) return { ok: false, error: "learner_not_found" };

  const existing = await deps.questStore.findByLearner(learner.id);
  if (existing) return { ok: true, correct: true, alreadyAnswered: true };

  if (answerId !== DAY29_QUEST_CORRECT_ANSWER_ID) return { ok: true, correct: false };

  const now = deps.now ? deps.now() : new Date();
  await deps.questStore.markAnsweredCorrectly(learner.id, now.toISOString());
  return { ok: true, correct: true, alreadyAnswered: false };
}
