// Testable core of the Web App audio delivery API
// (src/app/api/lesson/[day]/route.ts). Same separation-of-concerns pattern
// as day29/questApi.ts — all I/O behind injected interfaces, initData
// validation handled by the route before calling in here with an
// already-verified telegramUserId.
//
// Scoped to exactly WEB_APP_AUDIO_DAYS (every lesson day, 1-28, imported
// from deliverLesson.ts as the single source of truth — LDTKB-058's full
// rollout). Access is gated on the learner actually having had this lesson
// delivered already (per lesson_deliveries) — same "can't reach content
// early via a guessed URL" spirit as Day 29's findExisting-based dedup
// guard, just checked as "has it ever been delivered" rather than "was it
// delivered today."

import { getLesson, PILOT_LESSON_COUNT, type GenderBranch } from "@/lib/curriculum/content";
import type { LearnerStore } from "@/lib/onboarding/learnerStore";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";
import { WEB_APP_AUDIO_DAYS } from "@/lib/delivery/deliverLesson";

export interface LessonAudioApiDeps {
  learnerStore: LearnerStore;
  deliveryStore: DeliveryStore;
}

export interface LessonPhraseContent {
  kind: "phrase";
  lessonNumber: number;
  englishMeaning: string;
  karaoke: string;
  script: string;
  audioUrl: string;
}

export interface LessonWordSetWord {
  karaoke: string;
  meaning: string;
  audioUrl: string;
}

export interface LessonWordSetContent {
  kind: "wordset";
  lessonNumber: number;
  words: LessonWordSetWord[];
}

export type LessonAudioContent = LessonPhraseContent | LessonWordSetContent;

export type LessonAudioResult =
  | { ok: true; content: LessonAudioContent }
  | { ok: false; error: "not_a_prototype_day" | "learner_not_found" | "not_yet_delivered" };

/** `/lessons/{filename}` — served from public/lessons/ (scripts/syncLessonAssets.mjs). */
function lessonAssetUrl(filename: string): string {
  return `/lessons/${filename}`;
}

function lessonCode(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Which week folder/file-prefix a Weeks 2-4 day (8-28) belongs to — mirrors
 * mediaFiles.ts's weeks234Location exactly (that one isn't exported, and
 * this module only needs the filename prefix, not a filesystem path).
 * Bug note: earlier versions of phraseAudioUrl/wordSetAudioUrl hardcoded a
 * bare "lessonNN" / a fixed "week2_" prefix — invisible while only Lesson 3
 * (pilot) and Day 8 (already week2) were ever exercised by the prototype,
 * but wrong for e.g. Day 9 (needs "week2_day09", not "lesson09") or Day 16
 * (needs "week3_day16", not "week2_day16"). Fixed as part of the LDTKB-058
 * full rollout, which is what actually exercises every day for the first time.
 */
function weeks234FilePrefix(dayNumber: number): string {
  const weekNumber = dayNumber <= 14 ? 2 : dayNumber <= 21 ? 3 : 4;
  return `week${weekNumber}_day${lessonCode(dayNumber)}`;
}

/**
 * Days 15, 17, 21, 22, and Day 25 have no plain `_<gender>.mp3` file — only
 * variant-suffixed files. Mirrors mediaFiles.ts's CANONICAL_VARIANT exactly
 * (that one isn't exported): LDTKB-047 locks the younger-form audio as
 * canonical for 15/17/21/22 (LDTKB-040's four-way age-relative-pronoun
 * branching); LDTKB-048 locks example #1 ("may I park here?") as Day 25's
 * canonical tested phrase, stored as its `_1` variant file.
 */
const CANONICAL_VARIANT: Record<number, string> = { 15: "younger", 17: "younger", 21: "younger", 22: "younger", 25: "1" };

/** A phrase day's public audio URL — pilot (1-7) uses bare "lessonNN", Weeks 2-4 (8-28) uses "weekN_dayNN"; Days 15/17/21/22/25 append their canonical variant suffix (see CANONICAL_VARIANT). */
function phraseAudioUrl(lessonNumber: number, gender: GenderBranch): string {
  const prefix = lessonNumber <= PILOT_LESSON_COUNT ? `lesson${lessonCode(lessonNumber)}` : weeks234FilePrefix(lessonNumber);
  const variant = CANONICAL_VARIANT[lessonNumber];
  const suffix = variant ? `_${variant}` : "";
  return lessonAssetUrl(`${prefix}_${gender}${suffix}.mp3`);
}

function wordSetAudioUrl(dayNumber: number, wordIndex: number): string {
  return lessonAssetUrl(`${weeks234FilePrefix(dayNumber)}_${wordIndex}.mp3`);
}

/** Lesson 2's per-number audio — curriculum/pilot/audio/lesson02_{value}.mp3, no gender branch, no zero-padding on the number itself. */
function numberAudioUrl(value: number): string {
  return lessonAssetUrl(`lesson02_${value}.mp3`);
}

export async function getLessonAudioContent(
  telegramUserId: number,
  day: number,
  deps: LessonAudioApiDeps,
): Promise<LessonAudioResult> {
  if (!WEB_APP_AUDIO_DAYS.includes(day)) return { ok: false, error: "not_a_prototype_day" };

  const learner = await deps.learnerStore.findByTelegramId(telegramUserId);
  if (!learner || !learner.gender_branch) return { ok: false, error: "learner_not_found" };

  const delivered = await deps.deliveryStore.listDeliveredLessonNumbers(learner.id);
  if (!delivered.includes(day)) return { ok: false, error: "not_yet_delivered" };

  const lesson = getLesson(day);
  const gender = learner.gender_branch;

  if (lesson.kind === "phrase") {
    return {
      ok: true,
      content: {
        kind: "phrase",
        lessonNumber: day,
        englishMeaning: lesson.englishMeaning,
        karaoke: lesson.karaoke[gender],
        script: lesson.script[gender],
        audioUrl: phraseAudioUrl(day, gender),
      },
    };
  }

  if (lesson.kind === "wordset") {
    return {
      ok: true,
      content: {
        kind: "wordset",
        lessonNumber: day,
        words: lesson.words.map((w) => ({
          karaoke: w.karaoke,
          meaning: w.meaning,
          audioUrl: wordSetAudioUrl(day, w.index),
        })),
      },
    };
  }

  // Lesson 2 (numbers) — reuses the same "wordset" content shape rather than
  // a new "numbers" kind, since the page already renders that shape as a
  // list of audio players and ten numbers is structurally the same thing.
  // `meaning` is the number's own value as a string (e.g. "1".."10") — there's
  // no English word to show otherwise, unlike a real word-set day.
  return {
    ok: true,
    content: {
      kind: "wordset",
      lessonNumber: day,
      words: lesson.numbers.map((n) => ({
        karaoke: n.karaoke,
        meaning: String(n.value),
        audioUrl: numberAudioUrl(n.value),
      })),
    },
  };
}
