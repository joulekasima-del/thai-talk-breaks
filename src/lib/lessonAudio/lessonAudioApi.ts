// Testable core of the Web App audio delivery prototype's API
// (src/app/api/lesson/[day]/route.ts). Same separation-of-concerns pattern
// as day29/questApi.ts — all I/O behind injected interfaces, initData
// validation handled by the route before calling in here with an
// already-verified telegramUserId.
//
// Scoped to exactly WEB_APP_AUDIO_DAYS (Lesson 2 + Lesson 3 + Day 8,
// imported from deliverLesson.ts as the single source of truth for which
// days this prototype covers). Access is gated on the learner actually having had
// this lesson delivered already (per lesson_deliveries) — same
// "can't reach content early via a guessed URL" spirit as Day 29's
// findExisting-based dedup guard, just checked as "has it ever been
// delivered" rather than "was it delivered today."

import { getLesson, type GenderBranch } from "@/lib/curriculum/content";
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
 * Builds this content's public asset URL(s) — hardcoded per lesson number
 * rather than a generalized "any day" filename builder, matching
 * WEB_APP_AUDIO_DAYS's own deliberately-provisional scoping (exactly
 * Lesson 3's curriculum/pilot/ naming and Day 8's week2/ naming, the only
 * two shapes this prototype needs).
 */
function phraseAudioUrl(lessonNumber: number, gender: GenderBranch): string {
  return lessonAssetUrl(`lesson${lessonCode(lessonNumber)}_${gender}.mp3`);
}

function wordSetAudioUrl(dayNumber: number, wordIndex: number): string {
  return lessonAssetUrl(`week2_day${lessonCode(dayNumber)}_${wordIndex}.mp3`);
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
