// Spaced-repetition scheduling — pure functions, no I/O.
//
// Two phases, modelled on Anki:
//
// LEARNING — a new card is asked again in each of the learner's next 4
//   sessions (whenever those happen: a learner who taps "Next lesson" three
//   times in a row gets three sessions that day). A correct answer adds 1 to
//   the streak; a wrong answer resets it to 0, so the card keeps coming back
//   until it has been answered right in 4 sessions in a row. Then it
//   graduates.
//
// REVIEW — SM-2 style day intervals. Graduation schedules the first review
//   GRADUATION_INTERVAL_DAYS out. Each correct answer multiplies the
//   interval by the card's ease (2.5 to start). A wrong answer is a lapse:
//   ease drops by 0.2 (never below 1.3), the interval halves, and the card
//   goes back to learning, needing only RELEARN_STREAK_TARGET more correct
//   sessions to return to review.
//
// Answers are multiple choice, so there is only right/wrong — no Anki
// "hard/good/easy" grades. Right maps to "good" (ease unchanged), wrong to
// "again".

export type CardPhase = "learning" | "review";

export interface SrsCard {
  learner_id: string;
  item_key: string;
  lesson_number: number;
  phase: CardPhase;
  streak: number;
  ease: number;
  interval_days: number;
  due_date: string | null; // "YYYY-MM-DD", Thailand calendar date; review phase only
  reps: number;
  lapses: number;
}

export const GRADUATE_STREAK = 4;
/** After a lapse the card restarts at this streak, so 2 correct sessions return it to review. */
export const RELEARN_START_STREAK = GRADUATE_STREAK - 2;
export const GRADUATION_INTERVAL_DAYS = 3;
export const STARTING_EASE = 2.5;
export const MIN_EASE = 1.3;
const LAPSE_EASE_PENALTY = 0.2;

export function newCard(learnerId: string, itemKey: string, lessonNumber: number): SrsCard {
  return {
    learner_id: learnerId,
    item_key: itemKey,
    lesson_number: lessonNumber,
    phase: "learning",
    streak: 0,
    ease: STARTING_EASE,
    interval_days: 0,
    due_date: null,
    reps: 0,
    lapses: 0,
  };
}

export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The card after one answer given on `today` (Thailand calendar date). */
export function applyAnswer(card: SrsCard, correct: boolean, today: string): SrsCard {
  const next: SrsCard = { ...card, reps: card.reps + 1 };

  if (card.phase === "learning") {
    if (!correct) {
      next.streak = 0;
      return next;
    }
    next.streak = card.streak + 1;
    if (next.streak >= GRADUATE_STREAK) {
      next.phase = "review";
      next.streak = 0;
      // A relearned card keeps its (halved) interval; a brand-new one starts fresh.
      next.interval_days = Math.max(GRADUATION_INTERVAL_DAYS, card.interval_days);
      next.due_date = addDays(today, next.interval_days);
    }
    return next;
  }

  // review phase
  if (correct) {
    next.interval_days = Math.max(card.interval_days + 1, Math.round(card.interval_days * card.ease));
    next.due_date = addDays(today, next.interval_days);
    return next;
  }
  next.lapses = card.lapses + 1;
  next.ease = Math.max(MIN_EASE, Math.round((card.ease - LAPSE_EASE_PENALTY) * 100) / 100);
  next.interval_days = Math.max(1, Math.round(card.interval_days / 2));
  next.phase = "learning";
  next.streak = RELEARN_START_STREAK;
  next.due_date = null;
  return next;
}

/** Learning cards are due every session; review cards once their date arrives. */
export function isDue(card: SrsCard, today: string): boolean {
  if (card.phase === "learning") return true;
  return card.due_date !== null && card.due_date <= today;
}

/**
 * How many review questions a session may ask before the new lesson. Short
 * in week 1 (instant gratification), longer as the learner progresses.
 */
export function reviewCapForLesson(nextLessonNumber: number): number {
  if (nextLessonNumber <= 7) return 3;
  if (nextLessonNumber <= 14) return 5;
  if (nextLessonNumber <= 21) return 6;
  return 8;
}

/**
 * Picks which due cards to ask this session: learning cards first (lowest
 * streak first — the shakiest words), then review cards most overdue first.
 * Cards left out stay due and are picked next session.
 */
export function selectDueCards(cards: SrsCard[], today: string, cap: number): SrsCard[] {
  const due = cards.filter((card) => isDue(card, today));
  const learning = due
    .filter((card) => card.phase === "learning")
    .sort((a, b) => a.streak - b.streak || a.lesson_number - b.lesson_number || a.item_key.localeCompare(b.item_key));
  const review = due
    .filter((card) => card.phase === "review")
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.item_key.localeCompare(b.item_key));
  return [...learning, ...review].slice(0, cap);
}
