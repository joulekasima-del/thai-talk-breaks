// A learning session: a short warm-up of due review questions, then (if the
// learner has one available) a new lesson followed by a quick multiple-
// choice check, then a "▶️ Next lesson" button so the next one can start
// right away.
//
// Sessions advance one answer at a time: each quiz question waits for the
// learner's tap (a webhook callback), which records the answer, updates the
// card's spaced-repetition schedule (src/lib/srs/scheduler.ts), and sends
// whatever comes next. All I/O is behind injected interfaces, like
// handleUpdate.ts, so the whole flow runs in tests with fakes.

import type { InlineKeyboard, TelegramClient } from "@/lib/telegram";
import type { Learner, LearnerStore } from "@/lib/onboarding/learnerStore";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";
import type { PurchasesStore } from "@/lib/payments/purchasesStore";
import type { Day30QuizStore } from "@/lib/quiz/day30QuizStore";
import type { SrsStore, LearningSession, NewQuizPrompt } from "@/lib/srs/srsStore";
import { deliverLesson, type MediaLoader } from "@/lib/delivery/deliverLesson";
import { deliverDay29Entry, DAY29_LESSON_NUMBER } from "@/lib/day29/deliverDay29Entry";
import { startDay30Quiz } from "@/lib/quiz/day30Quiz";
import { PILOT_LESSON_COUNT, WEEKS234_LAST_DAY } from "@/lib/curriculum/content";
import { moreMessageFor } from "@/lib/curriculum/personalize";
import { applyAnswer, newCard, reviewCapForLesson, selectDueCards, type SrsCard } from "@/lib/srs/scheduler";
import { answeredText, buildQuestion, findItem, itemsForLesson, type QuizDirection, type Rng, type StudyItem } from "@/lib/srs/items";
import { REMINDER_PERIOD_MESSAGE, SCHEDULE_PERIOD_KEYBOARD } from "@/lib/onboarding/content";
import {
  ACTIVE_SESSION_NUDGE,
  ALL_CAUGHT_UP_MESSAGE,
  COURSE_FINISHED_MESSAGE,
  LESSON_PAYWALL_MESSAGE,
  NEW_LESSON_QUIZ_INTRO,
  NEXT_LESSON_KEYBOARD,
  REVIEW_KEYBOARD,
  lessonDoneMessage,
  reminderGreeting,
  reviewDoneMessage,
  reviewIntro,
} from "@/lib/session/content";

export const COURSE_LAST_LESSON = 30;
const DAY30_LESSON_NUMBER = 30;

export interface SessionDeps {
  telegram: TelegramClient;
  learnerStore: LearnerStore;
  srsStore: SrsStore;
  deliveryStore: DeliveryStore;
  purchasesStore: PurchasesStore;
  media: MediaLoader;
  /** Needed only when a session reaches Day 30's quiz. */
  quizStore?: Day30QuizStore;
  appUrl?: string;
  now?: () => Date;
  rng?: Rng;
}

export type StartSessionResult =
  | { status: "started"; sessionId: number; lessonNumber: number | null; reviews: number }
  | { status: "resumed" }
  | { status: "paywall" }
  | { status: "nothing_due" }
  | { status: "not_ready" };

export interface StartSessionOptions {
  /** Sent by the daily reminder: greet the learner before the first question. */
  reminder?: boolean;
  /** The daily reminder only sends the paywall message once, ever. */
  paywallOnlyOnce?: boolean;
  /** The daily reminder leaves a session the learner is already in alone (no re-sent question). */
  skipIfActive?: boolean;
}

function bangkokDate(date: Date): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function clock(deps: SessionDeps): Date {
  return deps.now ? deps.now() : new Date();
}

/** Lessons 8+ need a paid purchase (LDTKB-016 / LDTKB-065), counted in lessons now, not days. */
export async function isBehindPaywall(learner: Learner, deps: Pick<SessionDeps, "purchasesStore">): Promise<boolean> {
  if (learner.next_lesson_number <= PILOT_LESSON_COUNT || learner.next_lesson_number > COURSE_LAST_LESSON) return false;
  return (await deps.purchasesStore.findPaidByLearner(learner.id)) === null;
}

export async function startSession(
  learner: Learner,
  chatId: number,
  deps: SessionDeps,
  options: StartSessionOptions = {},
): Promise<StartSessionResult> {
  const gender = learner.gender_branch;
  if (!gender) return { status: "not_ready" };

  const active = await deps.srsStore.findActiveSession(learner.id);
  if (active) {
    if (options.skipIfActive) return { status: "resumed" };
    await resumeSession(active, learner, chatId, deps);
    return { status: "resumed" };
  }

  const now = clock(deps);
  const today = bangkokDate(now);
  const gated = await isBehindPaywall(learner, deps);
  const lessonNumber = gated || learner.next_lesson_number > COURSE_LAST_LESSON ? null : learner.next_lesson_number;

  const cards = await deps.srsStore.listCards(learner.id);
  const due = selectDueCards(cards, today, reviewCapForLesson(learner.next_lesson_number));

  if (lessonNumber === null && due.length === 0) {
    if (gated) {
      if (options.paywallOnlyOnce && learner.paywall_prompt_sent_at) return { status: "paywall" };
      await deps.telegram.sendMessage(chatId, LESSON_PAYWALL_MESSAGE);
      if (!learner.paywall_prompt_sent_at) await deps.learnerStore.update(learner.id, { paywall_prompt_sent_at: now.toISOString() });
      return { status: "paywall" };
    }
    if (!options.reminder) await deps.telegram.sendMessage(chatId, ALL_CAUGHT_UP_MESSAGE);
    return { status: "nothing_due" };
  }

  const session = await deps.srsStore.createSession(learner.id, lessonNumber);
  if (!session) return { status: "resumed" }; // another tap started one a moment ago
  await deps.learnerStore.update(learner.id, { last_session_date: today });

  if (options.reminder) await deps.telegram.sendMessage(chatId, reminderGreeting(learner.display_name));

  if (due.length > 0) {
    const rng = deps.rng ?? Math.random;
    const prompts: NewQuizPrompt[] = [];
    for (const card of due) {
      const item = findItem(card.item_key, gender);
      if (!item) continue;
      // Fresh cards are asked Thai -> English; once a word is sticking, either way round.
      const direction: QuizDirection = card.phase === "learning" && card.streak < 2 ? "th_en" : rng() < 0.5 ? "th_en" : "en_th";
      prompts.push(toPrompt(buildQuestion(item, direction, gender, rng), "review"));
    }
    await deps.srsStore.addPrompts(session.id, learner.id, prompts);
    if (prompts.length > 0) await deps.telegram.sendMessage(chatId, reviewIntro(prompts.length));
  }

  await advanceSession(session, learner, chatId, deps);
  return { status: "started", sessionId: session.id, lessonNumber, reviews: due.length };
}

function toPrompt(q: ReturnType<typeof buildQuestion>, kind: "review" | "new"): NewQuizPrompt {
  return { item_key: q.itemKey, kind, direction: q.direction, question: q.question, options: q.options, correct_index: q.correctIndex };
}

function questionKeyboard(promptId: number, options: string[]): InlineKeyboard {
  return options.map((option, index) => [{ text: option, callback_data: `q:${promptId}:${index}` }]);
}

/** Learner tapped "Next lesson" mid-session: re-show the question they owe, or carry on. */
async function resumeSession(session: LearningSession, learner: Learner, chatId: number, deps: SessionDeps): Promise<void> {
  const prompts = await deps.srsStore.listPrompts(session.id);
  const waiting = prompts.find((p) => p.sent_at !== null && p.answered_at === null);
  if (waiting) {
    await deps.telegram.sendMessage(chatId, ACTIVE_SESSION_NUDGE);
    await deps.telegram.sendMessage(chatId, waiting.question, questionKeyboard(waiting.id, waiting.options));
    return;
  }
  await advanceSession(session, learner, chatId, deps);
}

/**
 * Sends the session's next step: the next unsent question, else the new
 * lesson (and its quick check), else the wrap-up. Stops whenever a question
 * is waiting for an answer.
 */
async function advanceSession(session: LearningSession, learner: Learner, chatId: number, deps: SessionDeps): Promise<void> {
  let lessonDelivered = session.lesson_delivered;

  for (;;) {
    const prompts = await deps.srsStore.listPrompts(session.id);
    if (prompts.some((p) => p.sent_at !== null && p.answered_at === null)) return;

    const next = prompts.find((p) => p.sent_at === null);
    if (next) {
      const text = next.kind === "new" && !prompts.some((p) => p.kind === "new" && p.sent_at !== null)
        ? `${NEW_LESSON_QUIZ_INTRO}\n\n${next.question}`
        : next.question;
      await deps.telegram.sendMessage(chatId, text, questionKeyboard(next.id, next.options));
      await deps.srsStore.markPromptSent(next.id, clock(deps).toISOString());
      return;
    }

    if (session.lesson_number !== null && !lessonDelivered) {
      await deliverSessionLesson(session, learner, chatId, deps);
      lessonDelivered = true;
      continue;
    }

    await finishSession(session, learner, chatId, prompts, deps);
    return;
  }
}

/** How many quick-check questions follow a new lesson: more as the course goes on. */
function newLessonQuestionCount(lessonNumber: number, itemCount: number): number {
  // A single phrase: one question in weeks 1-2, both directions from week 3.
  if (itemCount === 1) return lessonNumber >= 15 ? 2 : 1;
  // A word set or the numbers: two of its words.
  return Math.min(2, itemCount);
}

async function deliverSessionLesson(session: LearningSession, learner: Learner, chatId: number, deps: SessionDeps): Promise<void> {
  const lessonNumber = session.lesson_number!;
  const gender = learner.gender_branch!;
  const now = clock(deps);
  const today = bangkokDate(now);
  const rng = deps.rng ?? Math.random;

  if (lessonNumber <= WEEKS234_LAST_DAY) {
    await deliverLesson(
      { learnerId: learner.id, chatId, gender, lessonNumber, deliveryDate: today, previouslyDeliveredLessonNumbers: [] },
      { telegram: deps.telegram, deliveryStore: deps.deliveryStore, media: deps.media, appUrl: deps.appUrl, now: () => now },
      { finale: "tip" },
    );
  } else if (lessonNumber === DAY29_LESSON_NUMBER) {
    const appUrl = deps.appUrl ?? process.env.APP_URL;
    if (!appUrl) throw new Error("APP_URL must be set to deliver Day 29's living comic button");
    await deliverDay29Entry({ learnerId: learner.id, chatId, deliveryDate: today }, { telegram: deps.telegram, deliveryStore: deps.deliveryStore, appUrl, now: () => now });
  } else if (lessonNumber === DAY30_LESSON_NUMBER) {
    if (!deps.quizStore) throw new Error("quizStore is needed to start the Day 30 quiz");
    await startDay30Quiz(learner.id, chatId, { telegram: deps.telegram, quizStore: deps.quizStore, appUrl: deps.appUrl });
  }

  const items = itemsForLesson(lessonNumber, gender);
  await deps.srsStore.addCards(items.map((item) => newCard(learner.id, item.key, lessonNumber)));

  if (items.length > 0) {
    const picked = pickQuizItems(items, newLessonQuestionCount(lessonNumber, items.length), rng);
    const prompts = picked.map(({ item, direction }) => toPrompt(buildQuestion(item, direction, gender, rng), "new"));
    await deps.srsStore.addPrompts(session.id, learner.id, prompts);
  }
  await deps.srsStore.markLessonDelivered(session.id);
}

function pickQuizItems(items: StudyItem[], count: number, rng: Rng): { item: StudyItem; direction: QuizDirection }[] {
  if (items.length === 1) {
    // A single phrase: meaning first, then (later lessons) the other way round.
    return Array.from({ length: count }, (_, i) => ({ item: items[0], direction: i === 0 ? "th_en" : "en_th" }));
  }
  const pool = [...items];
  const picked: { item: StudyItem; direction: QuizDirection }[] = [];
  while (picked.length < count && pool.length > 0) {
    const [item] = pool.splice(Math.floor(rng() * pool.length), 1);
    picked.push({ item, direction: "th_en" });
  }
  return picked;
}

async function finishSession(
  session: LearningSession,
  learner: Learner,
  chatId: number,
  prompts: { correct: boolean | null }[],
  deps: SessionDeps,
): Promise<void> {
  const now = clock(deps);
  await deps.srsStore.finishSession(session.id, now.toISOString());

  const right = prompts.filter((p) => p.correct === true).length;
  const total = prompts.length;
  let nextLesson = learner.next_lesson_number;

  if (session.lesson_number !== null) {
    nextLesson = session.lesson_number + 1;
    await deps.learnerStore.update(learner.id, { next_lesson_number: nextLesson });
    const deck = await deps.srsStore.countCards(learner.id);
    await deps.telegram.sendMessage(chatId, lessonDoneMessage(session.lesson_number, learner.display_name, right, total, deck));
  } else {
    await deps.telegram.sendMessage(chatId, reviewDoneMessage(right, total));
  }

  // First lesson of onboarding: ask for the reminder time instead of offering the next lesson.
  if (learner.onboarding_step === "first_lesson") {
    await deps.learnerStore.update(learner.id, { onboarding_step: "schedule_period_pending" });
    await deps.telegram.sendMessage(chatId, REMINDER_PERIOD_MESSAGE, SCHEDULE_PERIOD_KEYBOARD);
    return;
  }

  if (nextLesson > COURSE_LAST_LESSON) {
    if (session.lesson_number === COURSE_LAST_LESSON) await deps.telegram.sendMessage(chatId, COURSE_FINISHED_MESSAGE);
    await deps.telegram.sendMessage(chatId, "Want another round?", REVIEW_KEYBOARD);
    return;
  }
  await deps.telegram.sendMessage(chatId, "Ready for more?", NEXT_LESSON_KEYBOARD);
}

/** A tap on one of a quiz question's answer buttons. */
export async function handleQuizAnswer(
  learner: Learner,
  promptId: number,
  chosenIndex: number,
  chatId: number,
  messageId: number | undefined,
  deps: SessionDeps,
): Promise<void> {
  const gender = learner.gender_branch;
  if (!gender) return;
  const prompt = await deps.srsStore.getPrompt(promptId);
  if (!prompt || prompt.learner_id !== learner.id) return;
  if (chosenIndex < 0 || chosenIndex >= prompt.options.length) return;

  const now = clock(deps);
  const correct = chosenIndex === prompt.correct_index;
  const answered = await deps.srsStore.answerPrompt(promptId, chosenIndex, correct, now.toISOString());
  if (!answered) return; // already answered — a double tap

  const item = findItem(prompt.item_key, gender);
  if (item) {
    const result = answeredText({ question: prompt.question, options: prompt.options, correctIndex: prompt.correct_index }, item, chosenIndex);
    if (messageId !== undefined) await deps.telegram.editMessageText(chatId, messageId, result);
    else await deps.telegram.sendMessage(chatId, result);
  }

  // Only reviews move a card's schedule. The quick check straight after a
  // lesson doesn't count: the 4 learning sessions start with the next one.
  if (prompt.kind === "review") {
    const card: SrsCard | null = await deps.srsStore.getCard(learner.id, prompt.item_key);
    if (card) await deps.srsStore.saveCard(applyAnswer(card, correct, bangkokDate(now)));
  }

  const session = await deps.srsStore.findActiveSession(learner.id);
  if (session && session.id === prompt.session_id) await advanceSession(session, learner, chatId, deps);
}

/** "📖 More" under a lesson: the full explanation, in the learner's own particle form. */
export async function handleMore(learner: Learner, lessonNumber: number, chatId: number, deps: Pick<SessionDeps, "telegram">): Promise<void> {
  if (!learner.gender_branch || !Number.isInteger(lessonNumber) || lessonNumber > learner.next_lesson_number) return;
  const text = moreMessageFor(lessonNumber, learner.gender_branch);
  if (text) await deps.telegram.sendMessage(chatId, text);
}
