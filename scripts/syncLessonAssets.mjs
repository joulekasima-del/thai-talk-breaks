// Build-time sync for the Web App audio delivery pattern — LDTKB-058 full
// rollout. Copies every lesson day's (1-28) audio files into public/lessons/
// as a flat directory, same "curriculum stays the single source of truth"
// reasoning as syncDay29Assets.mjs.
//
// Audio only — no images. The Web App page (src/app/lesson/[day]/page.tsx)
// and its content API (lessonAudioApi.ts) never reference an image URL;
// every lesson kind still sends its photo natively via sendPhoto. The
// original 2-day prototype synced Lesson 3's and Day 8's images too, but
// nothing ever used them — dropped here rather than scaled up to ~50+
// pointless files across 28 days. (Confirmed by reading page.tsx: no
// "image"/".png" reference anywhere in it.)
//
// Patterns are generalized from the actual directory/filename conventions
// (see mediaFiles.ts's loadPhraseLessonAudio/loadWordSetAudio, which this
// mirrors) rather than one entry per day:
//   - Lesson 2 (numbers): lesson02_<digits>.mp3 (excludes lesson02_combined.mp3,
//     which has no digit-only suffix — that file is unused now, see
//     mediaFiles.ts's loadCombinedNumbersAudio comment, and stays unsynced).
//   - Pilot phrase days (1, 3-7): lessonNN_(male|female).mp3, exact match —
//     excludes lesson02_1.mp3 etc. (not "male"/"female") automatically.
//   - Weeks 2-4 phrase days: weekN_dayNN_(male|female).mp3, exact match —
//     one source entry per week folder (2, 3, 4), since each dir only ever
//     contains its own week's prefix.
//   - Weeks 2-4 word-set days (8, 10, 16, 26): weekN_dayNN_<digits>.mp3,
//     exact match, same per-week-folder source entries.
//
// "Exact match" matters: several phrase days have EXTRA files beyond the
// plain gender file that loadPhraseLessonAudio/phraseAudioUrl actually
// request — e.g. week2_day09_female_ext.mp3, week2_day13_sweet1.mp3,
// week4_day22_bonus1_male.mp3, week4_day25_male_2.mp3..._5.mp3. These are
// reference/bonus material, not what gets delivered, and the patterns above
// deliberately do not match them (anchored ^...$, no wildcard swallowing the
// suffix).
//
// Days 15, 17, 21, 22, and 25 fix: these 5 days have NO plain
// "_male.mp3"/"_female.mp3" file at all — only _older/_younger (15/17/21/22)
// or _1.._5 (25) suffixed variants — so the two generic phrase-day patterns
// above never match them. loadPhraseLessonAudio/phraseAudioUrl now request
// the specific canonical-variant file for each (LDTKB-047: _younger for
// 15/17/21/22; LDTKB-048: _1 for 25 — see mediaFiles.ts's CANONICAL_VARIANT),
// so this script needs its own exact-match entries for exactly those files,
// added below rather than widening the generic pattern (which would also
// pull in the _older files and Day 25's _2.._5 reference-only files).

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DEST_DIR = path.join(ROOT, "public", "lessons");

const WEEK_AUDIO_DIRS = ["week2-audio", "week3-audio", "week4-audio"];

const CANONICAL_VARIANT_FILES = [
  { dir: path.join(ROOT, "curriculum", "week3-audio"), pattern: /^week3_day(15|17|21)_(male|female)_younger\.mp3$/ },
  { dir: path.join(ROOT, "curriculum", "week4-audio"), pattern: /^week4_day22_(male|female)_younger\.mp3$/ },
  { dir: path.join(ROOT, "curriculum", "week4-audio"), pattern: /^week4_day25_(male|female)_1\.mp3$/ },
];

const SOURCES = [
  { dir: path.join(ROOT, "curriculum", "pilot", "audio"), pattern: /^lesson02_\d+\.mp3$/ }, // Lesson 2 (numbers)
  { dir: path.join(ROOT, "curriculum", "pilot", "audio"), pattern: /^lesson\d{2}_(male|female)\.mp3$/ }, // Lessons 1, 3-7 (phrase)
  ...WEEK_AUDIO_DIRS.flatMap((weekDir) => [
    { dir: path.join(ROOT, "curriculum", weekDir), pattern: /^week\d_day\d{2}_(male|female)\.mp3$/ }, // phrase days
    { dir: path.join(ROOT, "curriculum", weekDir), pattern: /^week\d_day\d{2}_\d+\.mp3$/ }, // word-set days
  ]),
  ...CANONICAL_VARIANT_FILES, // Days 15, 17, 21, 22, 25 — see comment above
];

async function main() {
  await rm(DEST_DIR, { recursive: true, force: true });
  await mkdir(DEST_DIR, { recursive: true });

  let copied = 0;
  for (const { dir, pattern } of SOURCES) {
    const files = (await readdir(dir)).filter((f) => pattern.test(f));
    for (const file of files) {
      await cp(path.join(dir, file), path.join(DEST_DIR, file));
      copied += 1;
    }
  }
  console.log(`Synced ${copied} lesson audio file(s) (Days 1-28) -> ${DEST_DIR}`);
}

main().catch((error) => {
  console.error("Lesson asset sync failed:", error);
  process.exit(1);
});
