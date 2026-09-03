// Access to the actual pre-produced audio/image files committed under
// curriculum/pilot/ and curriculum/week{2,3,4}-{audio,images}/. Confirmed
// naming pattern (Checkpoint 3 report item 2, Lesson 2 updated per
// LDTKB-057, revised again):
//   lessonNN_male.{mp3,png} / lessonNN_female.{mp3,png}  — lessons 1,3-7
//   lesson02_combined.png                                — lesson 2's photo (still sent natively)
//   lesson02_1.mp3 .. lesson02_10.mp3                    — lesson 2's audio (via the Web App)
//
// As of the LDTKB-058 full rollout, this module's *audio* loaders
// (loadPhraseLessonAudio, loadWordSetAudio, loadCombinedNumbersAudio) are no
// longer used by deliverLesson.ts's active delivery path at all — every
// lesson day's audio now goes through the Web App (src/app/lesson/[day]/,
// scripts/syncLessonAssets.mjs) instead of native sendAudio. They're kept
// here only because loadRepresentativeClip still calls them directly for
// its (currently unwired) cross-lesson-distractor logic. Image loaders are
// unaffected — every lesson kind still sends its photo natively.
//
// Files are read directly off the deployment's filesystem (they ship inside
// the repo checkout, which Vercel's Node.js functions can read) and uploaded
// to Telegram as multipart bytes — no separate public URL/CDN needed. See
// SCHEDULER.md for why.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { isWordSetDay } from "@/lib/curriculum/content";
import type { GenderBranch } from "@/lib/curriculum/content";
import type { MediaFile } from "@/lib/telegram";

const CURRICULUM_ROOT = path.join(process.cwd(), "curriculum", "pilot");
const DAY30_AUDIO_ROOT = path.join(process.cwd(), "curriculum", "day30-audio");
const WEEKS234_ROOT = path.join(process.cwd(), "curriculum");

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

const WEEKS234_PILOT_BOUNDARY = 7; // Days 1-7 = pilot (curriculum/pilot/); 8+ = Weeks 2-4

/** Which week folder (2, 3, or 4) and file prefix a Weeks 2-4 day belongs to. */
function weeks234Location(dayNumber: number): { weekFolder: string; filePrefix: string } {
  const weekNumber = dayNumber <= 14 ? 2 : dayNumber <= 21 ? 3 : 4;
  const dayCode = String(dayNumber).padStart(2, "0");
  return { weekFolder: `week${weekNumber}`, filePrefix: `week${weekNumber}_day${dayCode}` };
}

async function readWeeks234File(subdir: "audio" | "images", dayNumber: number, filename: string, contentType: string): Promise<MediaFile> {
  const { weekFolder } = weeks234Location(dayNumber);
  const buffer = await readFile(path.join(WEEKS234_ROOT, `${weekFolder}-${subdir}`, filename));
  return { buffer, filename, contentType };
}

/**
 * Days 15, 17, 21, 22, and Day 25 have no plain `_<gender>.mp3` file on
 * disk — only variant-suffixed files (confirmed by directory listing):
 *   - 15, 17, 21, 22: `_<gender>_older.mp3` / `_<gender>_younger.mp3`
 *     (LDTKB-040's four-way age-relative-pronoun branching)
 *   - 25: `_<gender>_1.mp3` .. `_<gender>_5.mp3` (5 valid example sentences)
 * LDTKB-047 locks "every learner is taught/tested on the younger form" for
 * the first group; LDTKB-048 locks example #1 ("may I park here?") as Day
 * 25's canonical tested phrase. This maps each of those 5 days to the
 * variant suffix its canonical/locked audio file actually uses — every
 * other day has no suffix (`""`) and keeps its plain filename.
 */
const CANONICAL_VARIANT: Record<number, string> = { 15: "younger", 17: "younger", 21: "younger", 22: "younger", 25: "1" };

/**
 * NOT part of MediaLoader any more — the LDTKB-058 full Web App audio
 * rollout moved every lesson day's audio off native sendAudio, so
 * deliverLesson.ts no longer calls this via `deps.media`. Kept only because
 * loadRepresentativeClip below still calls it directly (confirmed via
 * search) — same dependency this project has hit before with
 * loadCombinedNumbersAudio (LDTKB-057's two revisions).
 *
 * Transparently routes between the pilot (Days 1-7, curriculum/pilot/,
 * lessonNN_<gender> naming) and Weeks 2-4 (Days 8-28,
 * curriculum/week{2,3,4}-audio|images/, week{N}_day{DD}_<gender> naming).
 * Days 15, 17, 21, 22, 25 append CANONICAL_VARIANT's suffix after the
 * gender, since those days have no plain gender-only file (see
 * CANONICAL_VARIANT's comment).
 */
export async function loadPhraseLessonAudio(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
  const variant = CANONICAL_VARIANT[lessonNumber];
  const suffix = variant ? `_${variant}` : "";
  if (lessonNumber <= WEEKS234_PILOT_BOUNDARY) {
    return readMediaFile("audio", `lesson${lessonCode(lessonNumber)}_${gender}${suffix}.mp3`, "audio/mpeg");
  }
  const { filePrefix } = weeks234Location(lessonNumber);
  return readWeeks234File("audio", lessonNumber, `${filePrefix}_${gender}${suffix}.mp3`, "audio/mpeg");
}

export async function loadPhraseLessonImage(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
  if (lessonNumber <= WEEKS234_PILOT_BOUNDARY) {
    return readMediaFile("images", `lesson${lessonCode(lessonNumber)}_${gender}.png`, "image/png");
  }
  const { filePrefix } = weeks234Location(lessonNumber);
  return readWeeks234File("images", lessonNumber, `${filePrefix}_${gender}.png`, "image/png");
}

/**
 * NOT part of MediaLoader any more — same LDTKB-058 rollout reasoning as
 * loadPhraseLessonAudio above. Kept because loadRepresentativeClip still
 * calls it directly.
 *
 * Audio for one word of a Weeks 2-4 word-set day (8, 10, 16, 26 — no gender branch).
 */
export async function loadWordSetAudio(dayNumber: number, wordIndex: number): Promise<MediaFile> {
  const { filePrefix } = weeks234Location(dayNumber);
  return readWeeks234File("audio", dayNumber, `${filePrefix}_${wordIndex}.mp3`, "audio/mpeg");
}

/**
 * The single shared image for a word-set day — confirmed against the
 * actual files that each word-set day has exactly ONE image, not one per
 * word (unlike the pilot's Lesson 2) — see content.ts's WordSetLesson doc.
 */
export async function loadWordSetImage(dayNumber: number): Promise<MediaFile> {
  const { filePrefix } = weeks234Location(dayNumber);
  return readWeeks234File("images", dayNumber, `${filePrefix}.png`, "image/png");
}

/**
 * Lesson 2's combined image — still sent natively (deliverLesson.ts), per
 * this revision of LDTKB-057.
 */
export async function loadCombinedNumbersImage(): Promise<MediaFile> {
  return readMediaFile("images", "lesson02_combined.png", "image/png");
}

/**
 * NOT part of MediaLoader / deliverLesson.ts's active Lesson 2 path any
 * more — this revision of LDTKB-057 moved Lesson 2's audio to the Web App,
 * delivering the original 10 per-number files instead (see
 * lessonAudioApi.ts's numberAudioUrl). Kept only because loadRepresentativeClip
 * below still calls it directly; curriculum/pilot/audio/lesson02_combined.mp3
 * itself is also left in place (unused elsewhere, not deleted per instruction).
 * Confirmed via search this is the only remaining caller before leaving it in.
 */
export async function loadCombinedNumbersAudio(): Promise<MediaFile> {
  return readMediaFile("audio", "lesson02_combined.mp3", "audio/mpeg");
}

/**
 * The single audio clip used to represent a whole lesson when it's picked as
 * a cross-lesson recognition-tap distractor (see distractors.ts). For a
 * phrase lesson (pilot or Weeks 2-4 alike — loadPhraseLessonAudio already
 * routes internally), that's the learner's own gender-branch clip — using
 * the learner's own branch (not a fixed one) avoids an accidental,
 * confusing "the wrong answer is in a different voice" cue. Lesson 2 and
 * the Weeks 2-4 word-set days (8, 10, 16, 26) have no single phrase, so a
 * fixed representative word is used instead — see SCHEDULER.md for why "5"
 * was picked for Lesson 2 (an arbitrary, clearly-flagged choice); word set
 * days use word index 1 for the same reason (Checkpoint 5).
 */
export async function loadRepresentativeClip(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
  if (lessonNumber === 2) return loadCombinedNumbersAudio();
  if (isWordSetDay(lessonNumber)) return loadWordSetAudio(lessonNumber, 1);
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
