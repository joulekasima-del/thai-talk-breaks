import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { LESSON_EXPLANATIONS } from "@/lib/curriculum/lessonExplanations";
import { deliverLesson } from "@/lib/delivery/deliverLesson";
import { FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Extracts every "## Day N" + fenced-block pair from
 * curriculum/lesson-explanations.md, keyed by day number — the same
 * fenced-block-extraction approach as onboarding.test.ts's fencedBlock(),
 * generalized to a whole-file, multi-entry markdown source instead of one
 * block per file.
 */
function allDayBlocks(relativePath: string): Map<number, string> {
  const raw = readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
  const dayRe = /## Day (\d+)\n\n```\n([\s\S]*?)```/g;
  const blocks = new Map<number, string>();
  let match: RegExpExecArray | null;
  while ((match = dayRe.exec(raw)) !== null) {
    const day = Number(match[1]);
    // Drop exactly the one trailing newline before the closing fence, same
    // rule as fencedBlock() in onboarding.test.ts.
    const text = match[2].replace(/\n$/, "");
    blocks.set(day, text);
  }
  return blocks;
}

// --- Regression check: lessonExplanations.ts must match the source .md byte-for-byte ---

test("curriculum/lesson-explanations.md has exactly 28 fenced blocks, Days 1-28", () => {
  const blocks = allDayBlocks("curriculum/lesson-explanations.md");
  assert.equal(blocks.size, 28);
  for (let day = 1; day <= 28; day++) {
    assert.ok(blocks.has(day), `missing fenced block for Day ${day}`);
  }
});

test("LESSON_EXPLANATIONS has exactly 28 entries, Days 1-28, no extras", () => {
  const keys = Object.keys(LESSON_EXPLANATIONS)
    .map(Number)
    .sort((a, b) => a - b);
  assert.deepEqual(keys, Array.from({ length: 28 }, (_, i) => i + 1));
});

test("every LESSON_EXPLANATIONS entry matches curriculum/lesson-explanations.md verbatim, including blank lines", () => {
  const blocks = allDayBlocks("curriculum/lesson-explanations.md");
  for (let day = 1; day <= 28; day++) {
    assert.equal(LESSON_EXPLANATIONS[day], blocks.get(day), `Day ${day} explanation must match the source .md byte-for-byte`);
  }
});

// --- Delivery-flow: the explanation is actually sent, as the final message -

function makeDeliverDeps() {
  return {
    telegram: new FakeTelegramClient(),
    deliveryStore: new FakeDeliveryStore(),
    media: new FakeMediaLoader(),
    now: () => new Date("2026-08-26T01:00:00.000Z"),
  };
}

test("phrase day (Lesson 3): explanation is sent as the final message, after the audio", async () => {
  const deps = makeDeliverDeps();

  await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-26", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );

  assert.equal(deps.telegram.sentAudio.length, 1, "explanation must come after the one audio clip, not interleaved");
  const lastMessage = deps.telegram.sent.at(-1);
  assert.equal(lastMessage?.text, LESSON_EXPLANATIONS[3]);
  assert.equal(lastMessage?.keyboard, undefined, "plain text only, no keyboard");
});

test("Lesson 2 (numbers): explanation is sent as the final message, after all 10 audio clips", async () => {
  const deps = makeDeliverDeps();

  await deliverLesson(
    { learnerId: "l2", chatId: 2, gender: "female", lessonNumber: 2, deliveryDate: "2026-08-26", previouslyDeliveredLessonNumbers: [1] },
    deps,
  );

  assert.equal(deps.telegram.sentAudio.length, 10);
  const lastMessage = deps.telegram.sent.at(-1);
  assert.equal(lastMessage?.text, LESSON_EXPLANATIONS[2]);
  assert.equal(lastMessage?.keyboard, undefined);
});

test("word-set day (Day 8): explanation is sent as the final message, after its own audio clips", async () => {
  const deps = makeDeliverDeps();

  await deliverLesson(
    { learnerId: "l3", chatId: 3, gender: "male", lessonNumber: 8, deliveryDate: "2026-08-26", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7] },
    deps,
  );

  const lastMessage = deps.telegram.sent.at(-1);
  assert.equal(lastMessage?.text, LESSON_EXPLANATIONS[8]);
  assert.equal(lastMessage?.keyboard, undefined);
});

test("the explanation is not sent on a duplicate-guarded second delivery attempt", async () => {
  const deps = makeDeliverDeps();
  const input = { learnerId: "l4", chatId: 4, gender: "male" as const, lessonNumber: 1, deliveryDate: "2026-08-26", previouslyDeliveredLessonNumbers: [] };

  await deliverLesson(input, deps);
  const sentCountAfterFirst = deps.telegram.sent.length;

  const second = await deliverLesson(input, deps);
  assert.equal(second.status, "already_delivered");
  assert.equal(deps.telegram.sent.length, sentCountAfterFirst, "no repeat explanation (or anything else) on the blocked retry");
});
