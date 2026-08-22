// Recognition-tap distractor selection (LDTKB-026's activity, step 6 of
// LDTKB-006). Distractor CONTENT was never locked as a product decision —
// BUILD_TRACKER.md Stage 3 says so explicitly ("One design detail remains
// open... confirming distractor-clip content"). This is a deliberately
// simple, documented default — see SCHEDULER.md "Design choice" section —
// not a locked requirement. Injectable RNG so it's deterministic in tests.

export type Rng = () => number; // returns [0, 1), like Math.random

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * For a gender-branched phrase lesson (1, 3-7): distractors are drawn from
 * OTHER phrase lessons already delivered to this learner (lesson_number <
 * today's lesson AND != 2 AND != today), so a distractor is always taught
 * material — never something the learner hasn't seen yet ("teach before
 * testing", CLAUDE_AI_HANDOFF.md Section 4). Lesson 2 (numbers) is included
 * in the eligible pool too, via its fixed representative clip
 * (mediaFiles.ts) — it's taught material like any other delivered lesson.
 *
 * Returns up to 2 distinct lesson numbers, picked at random from whatever's
 * eligible. Lesson 1 has no eligible pool at all (nothing has been taught
 * yet) — see SCHEDULER.md for how that specific gap is handled; this
 * function simply returns [] in that case, it doesn't invent content.
 */
export function pickCrossLessonDistractors(
  todayLessonNumber: number,
  deliveredLessonNumbers: number[],
  rng: Rng = Math.random,
): number[] {
  const pool = deliveredLessonNumbers.filter((n) => n < todayLessonNumber && n !== todayLessonNumber);
  return shuffle(pool, rng).slice(0, 2);
}

/**
 * For lesson 2 (numbers) specifically: distractors are two OTHER numbers
 * from the same lesson's own set of 10 — all ten are taught together in one
 * delivery, so any of them is fair game as a distractor for any other,
 * matching lesson-02-numbers.md's own step 6 description exactly (not a
 * cross-lesson concern, so this doesn't use pickCrossLessonDistractors).
 */
export function pickNumberDistractors(correctNumber: number, rng: Rng = Math.random): number[] {
  const others = Array.from({ length: 10 }, (_, i) => i + 1).filter((n) => n !== correctNumber);
  return shuffle(others, rng).slice(0, 2);
}

/**
 * Word-set days (8, 10, 16, 26 — LDTKB-048): distractors are OTHER words
 * from the same day's own set — exactly analogous to pickNumberDistractors
 * (an intra-lesson concern, not cross-lesson), but parameterized by set
 * size since word sets range from 3 to 4 words (Lesson 2's numbers are
 * always fixed at 10, so pickNumberDistractors doesn't need this param).
 */
export function pickWordSetDistractors(correctIndex: number, wordSetSize: number, rng: Rng = Math.random): number[] {
  const others = Array.from({ length: wordSetSize }, (_, i) => i + 1).filter((n) => n !== correctIndex);
  return shuffle(others, rng).slice(0, 2);
}
