// Study items (one per word or phrase taught) and multiple-choice question
// building. Pure — no I/O.
//
// Every item is shown in the learner's own particle form (LDTKB-024): a
// male learner only ever sees "sà-wàt-dii kráp", a female learner only
// "sà-wàt-dii kâ" — never the bare "sà-wàt-dii".

import { getLesson, WEEKS234_LAST_DAY, type GenderBranch } from "@/lib/curriculum/content";

export interface StudyItem {
  key: string;
  lessonNumber: number;
  /** Learner-facing Thai Karaoke, already in the learner's particle form. */
  karaoke: string;
  meaning: string;
  /** Items in the same group make plausible distractors for each other. */
  group: "number" | "phrase";
}

export type QuizDirection = "th_en" | "en_th";

export interface QuizQuestion {
  itemKey: string;
  direction: QuizDirection;
  question: string;
  options: string[];
  correctIndex: number;
}

export type Rng = () => number;

/** Every word/phrase a lesson teaches, in the learner's particle form. Days 29-30 teach none. */
export function itemsForLesson(lessonNumber: number, gender: GenderBranch): StudyItem[] {
  if (lessonNumber < 1 || lessonNumber > WEEKS234_LAST_DAY) return [];
  const lesson = getLesson(lessonNumber);
  if (lesson.kind === "phrase") {
    return [
      { key: `L${lessonNumber}`, lessonNumber, karaoke: lesson.karaoke[gender], meaning: lesson.englishMeaning, group: "phrase" },
    ];
  }
  if (lesson.kind === "numbers") {
    return lesson.numbers.map((n) => ({
      key: `L2.${n.value}`,
      lessonNumber,
      karaoke: n.karaoke,
      meaning: String(n.value),
      group: "number" as const,
    }));
  }
  return lesson.words.map((w) => ({
    key: `L${lessonNumber}.${w.index}`,
    lessonNumber,
    karaoke: w.karaoke,
    meaning: w.meaning,
    group: "phrase" as const,
  }));
}

export function allItems(gender: GenderBranch): StudyItem[] {
  const items: StudyItem[] = [];
  for (let n = 1; n <= WEEKS234_LAST_DAY; n++) items.push(...itemsForLesson(n, gender));
  return items;
}

export function findItem(key: string, gender: GenderBranch): StudyItem | null {
  const match = /^L(\d+)/.exec(key);
  if (!match) return null;
  return itemsForLesson(Number(match[1]), gender).find((item) => item.key === key) ?? null;
}

function shuffle<T>(values: T[], rng: Rng): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const OPTIONS_PER_QUESTION = 3;

/**
 * One question with OPTIONS_PER_QUESTION answers: the right one plus
 * distractors from the same group (numbers with numbers, phrases with
 * phrases), never repeating the right answer's text.
 */
export function buildQuestion(item: StudyItem, direction: QuizDirection, gender: GenderBranch, rng: Rng): QuizQuestion {
  const answerOf = (candidate: StudyItem) => (direction === "th_en" ? candidate.meaning : candidate.karaoke);
  const correct = answerOf(item);
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];
  for (const candidate of shuffle(allItems(gender).filter((c) => c.group === item.group && c.key !== item.key), rng)) {
    const text = answerOf(candidate);
    if (seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    distractors.push(text);
    if (distractors.length === OPTIONS_PER_QUESTION - 1) break;
  }
  const options = shuffle([correct, ...distractors], rng);
  const question =
    direction === "th_en" ? `🤔 What does this mean?\n\n${item.karaoke}` : `🤔 How do you say this in Thai?\n\n"${item.meaning}"`;
  return { itemKey: item.key, direction, question, options, correctIndex: options.indexOf(correct) };
}

/** Text that replaces the question once answered (the buttons disappear with it). */
export function answeredText(
  q: { question: string; options: string[]; correctIndex: number },
  item: StudyItem,
  chosenIndex: number,
): string {
  const right = chosenIndex === q.correctIndex;
  const summary = `${item.karaoke} = ${item.meaning}`;
  if (right) return `${q.question}\n\n✅ Right! ${summary}`;
  return `${q.question}\n\n❌ Not quite — you picked "${q.options[chosenIndex]}".\n${summary}\nNo worries, it'll come back soon.`;
}
