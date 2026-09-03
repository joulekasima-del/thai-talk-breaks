// Build-time sync for the Day 30 quiz Web App page — copies
// curriculum/day30-audio/* into public/day30-audio/, so Next.js/Vercel can
// serve it as normal static HTTP(S) URLs (day30QuizApi.ts's day30AudioUrl).
// Same "prebuild lifecycle hook, curriculum stays the single source of
// truth" reasoning as syncDay29Assets.mjs/syncLessonAssets.mjs.
//
// A plain whole-directory copy (like syncDay29Assets.mjs), NOT a
// pattern-matching sync (like syncLessonAssets.mjs) — deliberately, because
// the two scripts' source directories are shaped differently:
// curriculum/{pilot,week2,week3,week4}-audio/ each mix files that ARE
// delivered (e.g. lesson04_male.mp3) with reference-only/bonus files that
// AREN'T (week2_day13_sweet1.mp3, week4_day22_bonus1_male.mp3, etc.) —
// syncing everything there would leak unused files into public/lessons/.
// curriculum/day30-audio/ has no such mix: every file in it is exactly one
// of DAY30_QUESTIONS' correctAudioFile/distractorAudioFiles (confirmed by
// listing the directory — 10 questions x 3 files = 30 files, all 30
// referenced, nothing else present), so a plain copy is already an exact
// match with nothing extra to exclude — simpler than reintroducing
// pattern-matching for a directory that doesn't need it.
//
// public/day30-audio/ is gitignored — it's a derived build artifact, same
// as public/day29/ and public/lessons/.

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const SOURCE_DIR = path.join(process.cwd(), "curriculum", "day30-audio");
const DEST_DIR = path.join(process.cwd(), "public", "day30-audio");

async function main() {
  await rm(DEST_DIR, { recursive: true, force: true });
  await mkdir(DEST_DIR, { recursive: true });
  await cp(SOURCE_DIR, DEST_DIR, { recursive: true });
  console.log(`Synced Day 30 quiz audio: ${SOURCE_DIR} -> ${DEST_DIR}`);
}

main().catch((error) => {
  console.error("Day 30 quiz asset sync failed:", error);
  process.exit(1);
});
