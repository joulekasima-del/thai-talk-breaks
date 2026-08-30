// Build-time sync for the Web App audio delivery prototype (Lesson 3 + Day
// 8 only — see deliverLesson.ts's WEB_APP_AUDIO_DAYS). Copies exactly the
// files this prototype needs into public/lessons/ as a flat directory,
// same "curriculum stays the single source of truth" reasoning as
// syncDay29Assets.mjs. Unlike that script (one whole source folder copied
// recursively), this one pulls from four different curriculum
// subdirectories into one flat destination, since Lesson 3's and Day 8's
// assets live in different places (pilot vs. week2) — explicit per-source
// file-pattern list, not a generalized "any day" copier, since this is a
// scoped prototype on exactly two days, not a permanent pattern yet.

import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DEST_DIR = path.join(ROOT, "public", "lessons");

const SOURCES = [
  { dir: path.join(ROOT, "curriculum", "pilot", "audio"), pattern: /^lesson03_.*\.mp3$/ },
  { dir: path.join(ROOT, "curriculum", "pilot", "images"), pattern: /^lesson03_.*\.png$/ },
  { dir: path.join(ROOT, "curriculum", "week2-audio"), pattern: /^week2_day08_.*\.mp3$/ },
  { dir: path.join(ROOT, "curriculum", "week2-images"), pattern: /^week2_day08\.png$/ },
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
  console.log(`Synced ${copied} lesson-prototype asset(s) (Lesson 3 + Day 8) -> ${DEST_DIR}`);
}

main().catch((error) => {
  console.error("Lesson asset sync failed:", error);
  process.exit(1);
});
