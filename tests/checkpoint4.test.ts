import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { startDay30Quiz } from "@/lib/quiz/day30Quiz";
import { DAY30_QUESTIONS, day30ScoreMessage, DAY30_BADGE_MESSAGE } from "@/lib/curriculum/day30Content";
import { dayNumberForLearner, findDueLearners, type OnboardedLearner } from "@/lib/delivery/dueLearners";
import { FakeTelegramClient } from "./fakes";
import { FakeDay30QuizStore } from "./quizFakes";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- Regression check: day30Content.ts matches day30-button-wording.md ----

test("Day 30 quiz content matches day30-button-wording.md verbatim", () => {
  const raw = readFileSync(path.join(REPO_ROOT, "curriculum/day30-button-wording.md"), "utf8");
  const rows = [...raw.matchAll(/\| (Q\d+_\S+\.mp3) \| \S+.*? \| (.+?) \|$/gm)];
  const byFile = new Map(rows.map((m) => [m[1], m[2].trim()]));

  for (const q of DAY30_QUESTIONS) {
    assert.equal(byFile.get(q.correctAudioFile), q.correctButtonText, `Q${q.index} correct button text`);
    assert.equal(q.distractorAudioFiles[0], `Q${q.index}_distractor-1.mp3`, `Q${q.index} distractor 1 audio filename`);
    assert.equal(q.distractorAudioFiles[1], `Q${q.index}_distractor-2.mp3`, `Q${q.index} distractor 2 audio filename`);
    assert.equal(byFile.get(q.distractorAudioFiles[0]), q.distractorButtonTexts[0], `Q${q.index} distractor 1 button text`);
    assert.equal(byFile.get(q.distractorAudioFiles[1]), q.distractorButtonTexts[1], `Q${q.index} distractor 2 button text`);
  }
});

test("day30ScoreMessage and badge match day30-quiz-content.md's locked format", () => {
  assert.equal(day30ScoreMessage(7), "You got **7/10**! 🎉");
  assert.equal(DAY30_BADGE_MESSAGE, "🏅 **Thai Talk Breaks Graduate**");
});

test("across all 10 questions, every button's kind maps to that button's own true audio file", () => {
  for (const q of DAY30_QUESTIONS) {
    // Mirrors audioFileForKind's mapping without importing an internal —
    // asserts the content data itself is self-consistent.
    assert.equal(q.correctAudioFile, `Q${q.index}_correct_answer.mp3`);
    assert.deepEqual(q.distractorAudioFiles, [`Q${q.index}_distractor-1.mp3`, `Q${q.index}_distractor-2.mp3`]);
  }
});

test("Day 30 quiz never calls Checkpoint 3's dynamic distractor-selection logic (LDTKB-045)", () => {
  // distractors.ts's pickCrossLessonDistractors/pickNumberDistractors both
  // require a non-trivial input (a lesson pool, a correct number 1-10) that
  // day30Content.ts's fixed data doesn't shape-match — the real evidence
  // this constraint holds is structural: neither day30Quiz.ts nor
  // day30QuizApi.ts imports "@/lib/delivery/distractors" at all.
  for (const file of ["src/lib/quiz/day30Quiz.ts", "src/lib/quiz/day30QuizApi.ts"]) {
    const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
    const hasImportStatement = /^\s*import\b[^\n]*delivery\/distractors/m.test(source);
    assert.equal(hasImportStatement, false, `${file} must not import Checkpoint 3's distractor-selection module`);
  }
});

// --- Bot-side trigger: single Web App button (replaces the old per-question
// native message flow — see day30QuizApi.test.ts for the actual quiz logic,
// now entirely inside the Web App page/API route) -------------------------

function makeStartQuizDeps(appUrl: string | undefined = "https://thaitalkbreaks.example") {
  return {
    telegram: new FakeTelegramClient(),
    quizStore: new FakeDay30QuizStore(),
    appUrl,
  };
}

test("startDay30Quiz sends exactly one message with a single web_app button opening /day30-quiz", async () => {
  const deps = makeStartQuizDeps();

  await startDay30Quiz("learner-1", 300, deps);

  assert.equal(deps.telegram.sent.length, 1, "exactly one message — no per-question messages any more");
  assert.equal(deps.telegram.sentAudio.length, 0, "no native audio at all any more");
  const message = deps.telegram.sent[0];
  assert.equal(message.keyboard?.length, 1);
  assert.equal(message.keyboard?.[0].length, 1, "a single button, not one per option");
  assert.deepEqual(message.keyboard?.[0][0], {
    text: "🧠 Start the Day 30 Quiz",
    web_app: { url: "https://thaitalkbreaks.example/day30-quiz" },
  });
});

test("startDay30Quiz creates the progress row at question 1", async () => {
  const deps = makeStartQuizDeps();

  await startDay30Quiz("learner-2", 301, deps);

  const progress = await deps.quizStore.findByLearner("learner-2");
  assert.equal(progress?.current_question_index, 1);
  assert.equal(progress?.correct_count, 0);
  assert.equal(progress?.completed_at, null);
});

test("starting the quiz twice is a no-op the second time (guard against re-sending the button on a later cron tick)", async () => {
  const deps = makeStartQuizDeps();

  await startDay30Quiz("learner-3", 302, deps);
  await startDay30Quiz("learner-3", 302, deps);

  assert.equal(deps.telegram.sent.length, 1, "no second button send");
});

test("startDay30Quiz falls back to process.env.APP_URL when deps.appUrl is not provided", async () => {
  const original = process.env.APP_URL;
  process.env.APP_URL = "https://env-fallback.example";
  try {
    const deps = { telegram: new FakeTelegramClient(), quizStore: new FakeDay30QuizStore() };
    await startDay30Quiz("learner-4", 303, deps);
    const button = deps.telegram.sent[0].keyboard?.[0][0];
    assert.deepEqual(button, { text: "🧠 Start the Day 30 Quiz", web_app: { url: "https://env-fallback.example/day30-quiz" } });
  } finally {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  }
});

test("startDay30Quiz throws if neither deps.appUrl nor process.env.APP_URL is set", async () => {
  const original = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    const deps = { telegram: new FakeTelegramClient(), quizStore: new FakeDay30QuizStore() };
    await assert.rejects(() => startDay30Quiz("learner-5", 304, deps));
  } finally {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  }
});

// --- Part C: testing-only day-window extension -----------------------------

test("dayNumberForLearner respects an arbitrary maxDay (the testing extension is just a bigger cap)", () => {
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-30", 30), 30);
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-31", 30), null, "day 31 is past even the extended window");
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-08", 7), null, "day 8 is past the real 7-day pilot");
  assert.equal(dayNumberForLearner("2026-08-01", "2026-08-08", 30), 8, "but day 8 is fine under the extended window");
});

test("findDueLearners with an extended maxDay surfaces day 8-29 (route.ts is responsible for skipping them gracefully)", () => {
  const learner: OnboardedLearner = {
    id: "l1",
    telegram_user_id: 1,
    gender_branch: "male",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: "2026-08-01",
  };
  const now = new Date("2026-08-15T01:00:00.000Z"); // day 15 of the pilot, 08:00 Bangkok
  const withoutExtension = findDueLearners([learner], { now, lookbackMinutes: 30 });
  const withExtension = findDueLearners([learner], { now, lookbackMinutes: 30, maxDay: 30 });

  assert.equal(withoutExtension.length, 0, "day 15 is past the real 7-day window by default");
  assert.equal(withExtension.length, 1);
  assert.equal(withExtension[0].lessonNumber, 15);
});
