// Access to the actual pre-produced audio/image files committed under
// curriculum/pilot/. Confirmed naming pattern (Checkpoint 3 report item 2):
//   lessonNN_male.{mp3,png} / lessonNN_female.{mp3,png}  — lessons 1,3-7
//   lessonNN_<1-10>.{mp3,png}                            — lesson 2 (numbers)
//
// Files are read directly off the deployment's filesystem (they ship inside
// the repo checkout, which Vercel's Node.js functions can read) and uploaded
// to Telegram as multipart bytes — no separate public URL/CDN needed. See
// SCHEDULER.md for why.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GenderBranch } from "@/lib/curriculum/content";
import type { MediaFile } from "@/lib/telegram";

const CURRICULUM_ROOT = path.join(process.cwd(), "curriculum", "pilot");
const DAY30_AUDIO_ROOT = path.join(process.cwd(), "curriculum", "day30-audio");

function lessonCode(lessonNumber: number): string {
  return String(lessonNumber).padStart(2, "0");
}

async function readMediaFile(
  subdir: "audio" | "images",
  filename: string,
  contentType: string,
): Promise<MediaFile> {
  const buffer = await readFile(path.join(CURRICULUM_ROOT, subdir, filename));
  return { buffer, filename, contentType };
}

/** Audio/image for a gender-branched lesson (1, 3-7), in the learner's own branch. */
export async function loadPhraseLessonAudio(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
  return readMediaFile("audio", `lesson${lessonCode(lessonNumber)}_${gender}.mp3`, "audio/mpeg");
}

export async function loadPhraseLessonImage(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
  return readMediaFile("images", `lesson${lessonCode(lessonNumber)}_${gender}.png`, "image/png");
}

/** Audio/image for one of lesson 2's ten numbers (1-10, no gender branch). */
export async function loadNumberAudio(numberValue: number): Promise<MediaFile> {
  return readMediaFile("audio", `lesson02_${numberValue}.mp3`, "audio/mpeg");
}

export async function loadNumberImage(numberValue: number): Promise<MediaFile> {
  return readMediaFile("images", `lesson02_${numberValue}.png`, "image/png");
}

/**
 * The single audio clip used to represent a whole lesson when it's picked as
 * a cross-lesson recognition-tap distractor (see distractors.ts). For a
 * phrase lesson, that's the learner's own gender-branch clip — using the
 * learner's own branch (not a fixed one) avoids an accidental, confusing
 * "the wrong answer is in a different voice" cue. Lesson 2 has no single
 * phrase, so a fixed representative number is used — see SCHEDULER.md for
 * why "5" was picked (an arbitrary, clearly-flagged choice).
 */
export async function loadRepresentativeClip(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
  if (lessonNumber === 2) return loadNumberAudio(5);
  return loadPhraseLessonAudio(lessonNumber, gender);
}

/**
 * Day 30 quiz audio (curriculum/day30-audio/) — a separate root from the
 * pilot's curriculum/pilot/audio/, per LDTKB-045's Day 30-only dedicated
 * recordings. Only correct-answer files are actually loaded by the quiz
 * delivery code (see day30Content.ts) — distractor files exist on disk but
 * aren't read by this module.
 */
export async function loadDay30Audio(filename: string): Promise<MediaFile> {
  const buffer = await readFile(path.join(DAY30_AUDIO_ROOT, filename));
  return { buffer, filename, contentType: "audio/mpeg" };
}
