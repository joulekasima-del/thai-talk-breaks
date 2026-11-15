// Builds ./out, the folder the Cloudflare Worker serves as static assets:
//   1. the existing sync scripts copy lesson/Day 29/Day 30 audio into public/
//   2. `next build` with STATIC_EXPORT=1 exports the three Web App pages + public/
//   3. the curriculum images/audio the bot uploads to Telegram are copied to
//      out/media/<same relative path as in curriculum/> (read back by the Worker
//      through setMediaReader in worker/index.ts)
// Run with: npm run build:worker

import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "out");

function run(command, args, env = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: ROOT, env: { ...process.env, ...env } });
  if (result.status !== 0) {
    console.error(`Command failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

for (const script of ["syncDay29Assets.mjs", "syncLessonAssets.mjs", "syncDay30QuizAssets.mjs"]) {
  run("node", [path.join("scripts", script)]);
}

await rm(OUT, { recursive: true, force: true });
run("npx", ["next", "build"], { STATIC_EXPORT: "1" });

// Only these folders hold files that mediaFiles.ts reads.
const MEDIA_FOLDERS = [
  "pilot/audio",
  "pilot/images",
  "week2-audio",
  "week2-images",
  "week3-audio",
  "week3-images",
  "week4-audio",
  "week4-images",
  "day30-audio",
];

let copied = 0;
let bytes = 0;
for (const folder of MEDIA_FOLDERS) {
  const source = path.join(ROOT, "curriculum", folder);
  const destination = path.join(OUT, "media", folder);
  await mkdir(destination, { recursive: true });
  for (const name of await readdir(source)) {
    if (!/\.(mp3|png)$/i.test(name)) continue;
    await cp(path.join(source, name), path.join(destination, name));
    copied += 1;
    bytes += (await stat(path.join(source, name))).size;
  }
}
console.log(`Copied ${copied} media files (${(bytes / 1024 / 1024).toFixed(1)} MB) into out/media`);
