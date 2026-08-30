import { test } from "node:test";
import assert from "node:assert/strict";

import { getLessonAudioContent } from "@/lib/lessonAudio/lessonAudioApi";
import { getLesson } from "@/lib/curriculum/content";
import { FakeLearnerStore } from "./fakes";
import { FakeDeliveryStore } from "./deliveryFakes";

function makeDeps() {
  return { learnerStore: new FakeLearnerStore(), deliveryStore: new FakeDeliveryStore() };
}

// --- Scope guard: only Lesson 3 / Day 8 are prototype days -----------------

test("getLessonAudioContent: a day outside WEB_APP_AUDIO_DAYS (e.g. Lesson 5) is rejected, even for an existing learner", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(1);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  await deps.deliveryStore.insertTextSent(learner.id, 5, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(1, 5, deps);
  assert.deepEqual(result, { ok: false, error: "not_a_prototype_day" });
});

test("getLessonAudioContent: Lesson 2 (numbers) is rejected — explicitly out of scope (LDTKB-057, pending)", async () => {
  const deps = makeDeps();
  const result = await getLessonAudioContent(1, 2, deps);
  assert.deepEqual(result, { ok: false, error: "not_a_prototype_day" });
});

// --- Learner / access guard -------------------------------------------------

test("getLessonAudioContent: unknown telegram user id -> learner_not_found", async () => {
  const deps = makeDeps();
  const result = await getLessonAudioContent(999, 3, deps);
  assert.deepEqual(result, { ok: false, error: "learner_not_found" });
});

test("getLessonAudioContent: known learner who hasn't had Lesson 3 delivered yet -> not_yet_delivered (no early access via a guessed URL)", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(2);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  // Delivered lesson 1, but NOT lesson 3.
  await deps.deliveryStore.insertTextSent(learner.id, 1, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(2, 3, deps);
  assert.deepEqual(result, { ok: false, error: "not_yet_delivered" });
});

// --- Content shape: phrase day (Lesson 3) -----------------------------------

test("getLessonAudioContent: Lesson 3, delivered, male learner — gender-branched phrase content + audio URL", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(3);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  await deps.deliveryStore.insertTextSent(learner.id, 3, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(3, 3, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const lesson3 = getLesson(3);
  if (lesson3.kind !== "phrase") throw new Error("expected lesson 3 to be a phrase lesson");

  assert.deepEqual(result.content, {
    kind: "phrase",
    lessonNumber: 3,
    englishMeaning: lesson3.englishMeaning,
    karaoke: lesson3.karaoke.male,
    script: lesson3.script.male,
    audioUrl: "/lessons/lesson03_male.mp3",
  });
});

test("getLessonAudioContent: Lesson 3, delivered, female learner — female branch, not male", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(4);
  await deps.learnerStore.update(learner.id, { gender_branch: "female" });
  await deps.deliveryStore.insertTextSent(learner.id, 3, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(4, 3, deps);
  assert.equal(result.ok, true);
  if (!result.ok || result.content.kind !== "phrase") throw new Error("expected ok phrase content");

  const lesson3 = getLesson(3);
  if (lesson3.kind !== "phrase") throw new Error("expected lesson 3 to be a phrase lesson");
  assert.equal(result.content.karaoke, lesson3.karaoke.female);
  assert.equal(result.content.audioUrl, "/lessons/lesson03_female.mp3");
});

// --- Content shape: word-set day (Day 8) — multiple audio players ---------

test("getLessonAudioContent: Day 8, delivered — one word entry (and one audio URL) per word, no gender branch", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(5);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  await deps.deliveryStore.insertTextSent(learner.id, 8, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(5, 8, deps);
  assert.equal(result.ok, true);
  if (!result.ok || result.content.kind !== "wordset") throw new Error("expected ok wordset content");

  const day8 = getLesson(8);
  if (day8.kind !== "wordset") throw new Error("expected day 8 to be a word-set day");

  assert.equal(result.content.words.length, day8.words.length);
  assert.equal(result.content.words.length, 4, "Day 8 has exactly 4 words -> 4 audio players on the page");

  for (let i = 0; i < day8.words.length; i++) {
    assert.equal(result.content.words[i].karaoke, day8.words[i].karaoke);
    assert.equal(result.content.words[i].meaning, day8.words[i].meaning);
    assert.equal(result.content.words[i].audioUrl, `/lessons/week2_day08_${day8.words[i].index}.mp3`);
  }
});
