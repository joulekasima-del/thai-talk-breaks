import { test } from "node:test";
import assert from "node:assert/strict";

import { startDay30Quiz, handleDay30QuizCallback } from "@/lib/quiz/day30Quiz";
import { DAY30_QUESTION_COUNT } from "@/lib/curriculum/day30Content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeDay30QuizStore } from "./quizFakes";
import type { MediaFile } from "@/lib/telegram";

// Originally: every audio message should display a real title/performer,
// never the raw internal disk filename. "Rule A" (teaching audio reveals
// the pronunciation as its title) applied only to native sendAudio calls
// for lesson/day content — as of the LDTKB-058 full Web App audio rollout,
// no lesson day sends native audio at all any more (see deliverLesson.ts),
// so there is no more Rule-A code path left to test here. Lesson/Day audio
// delivery is now covered by tests/deliverLessonWebAppPrototype.test.ts
// (the web_app button send) and tests/lessonAudio.test.ts (the content
// API's audioUrl values). "Rule B" (anonymized activity/quiz audio) never
// applied to lesson/day content in the first place — Day 30's quiz audio
// below is the only rule-B audio left in the app, and is unaffected by
// this rollout (Day 30 is explicitly out of scope).

// --- Day 30 quiz: anonymized throughout --------------------------------

function fakeAudio(filename: string): MediaFile {
  return { buffer: Buffer.from(filename), filename, contentType: "audio/mpeg" };
}

function makeQuizDeps() {
  return {
    telegram: new FakeTelegramClient(),
    learnerStore: new FakeLearnerStore(),
    quizStore: new FakeDay30QuizStore(),
    now: () => new Date("2026-08-23T01:00:00.000Z"),
    rng: () => 0.99,
    loadAudio: async (filename: string) => fakeAudio(filename),
  };
}

test("Day 30 quiz prompt audio: title = 'Question N/10', performer = 'Day 30 Quiz'", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(900);

  await startDay30Quiz(learner.id, 900, deps);

  assert.equal(deps.telegram.sentAudio[0].title, `Question 1/${DAY30_QUESTION_COUNT}`);
  assert.equal(deps.telegram.sentAudio[0].performer, "Day 30 Quiz");
});

test("Day 30 quiz tapped-button audio: generic title/performer, never the answer text", async () => {
  const deps = makeQuizDeps();
  const learner = await deps.learnerStore.create(901);
  await startDay30Quiz(learner.id, 901, deps);

  await handleDay30QuizCallback({ id: "cb-901", from: { id: 901 }, message: { chat: { id: 901 } } }, "quiz:1:c", deps);

  const tappedAudio = deps.telegram.sentAudio[1];
  assert.equal(tappedAudio.title, "Day 30");
  assert.equal(tappedAudio.performer, "Day 30 Quiz");
});
