// Build-time sync: copies curriculum/day29/assets/* into public/day29/, so
// Next.js/Vercel can serve the living comic's images and audio as normal
// static HTTP(S) URLs. Chosen as a sync script (run via the "prebuild" npm
// lifecycle hook) rather than a one-time manual copy, so curriculum/day29/
// assets/ stays the single source of truth (per day29-audio-map.md) and
// public/day29/ never needs a second, hand-maintained copy that can drift.
// public/day29/ is gitignored — it's a derived build artifact.

import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const SOURCE_DIR = path.join(process.cwd(), "curriculum", "day29", "assets");
const DEST_DIR = path.join(process.cwd(), "public", "day29");

async function main() {
  await rm(DEST_DIR, { recursive: true, force: true });
  await mkdir(DEST_DIR, { recursive: true });
  await cp(SOURCE_DIR, DEST_DIR, { recursive: true });
  console.log(`Synced Day 29 assets: ${SOURCE_DIR} -> ${DEST_DIR}`);
}

main().catch((error) => {
  console.error("Day 29 asset sync failed:", error);
  process.exit(1);
});
