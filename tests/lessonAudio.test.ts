import { test } from "node:test";
import assert from "node:assert/strict";

import { getLessonAudioContent } from "@/lib/lessonAudio/lessonAudioApi";
import { getLesson } from "@/lib/curriculum/content";
import { FakeLearnerStore } from "./fakes";
import { FakeDeliveryStore } from "./deliveryFakes";

function makeDeps() {
  return { learnerStore: new FakeLearnerStore(), deliveryStore: new FakeDeliveryStore() };
}

// --- Scope guard: only Days 1-28 are in WEB_APP_AUDIO_DAYS -----------------
// (LDTKB-058 full rollout — every lesson day is in scope now; Day 29 has its
// own separate mechanism, Day 30's quiz audio is explicitly out of scope.)

test("getLessonAudioContent: Day 29 (outside WEB_APP_AUDIO_DAYS) is rejected, even for an existing learner", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(1);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  await deps.deliveryStore.insertTextSent(learner.id, 29, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(1, 29, deps);
  assert.deepEqual(result, { ok: false, error: "not_a_prototype_day" });
});

test("getLessonAudioContent: Day 30 (outside WEB_APP_AUDIO_DAYS) is rejected, even for an existing learner", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(1000);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  await deps.deliveryStore.insertTextSent(learner.id, 30, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(1000, 30, deps);
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

// --- Content shape: Weeks 2-4 phrase/word-set days — full rollout coverage -
// (Regression coverage for a real bug found while building the LDTKB-058
// rollout: phraseAudioUrl/wordSetAudioUrl previously hardcoded a bare
// "lessonNN" prefix / a fixed "week2_" prefix respectively — invisible while
// only Lesson 3 [pilot] and Day 8 [already week2] were ever exercised by the
// 2-day prototype, but wrong for any other Weeks 2-4 day. Fixed in
// lessonAudioApi.ts; these tests cover days outside week2 specifically.)

test("getLessonAudioContent: Day 20 (Weeks 2-4 phrase day, week3) — audioUrl uses the 'weekN_dayNN' prefix, not a bare 'lessonNN'", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(7);
  await deps.learnerStore.update(learner.id, { gender_branch: "male" });
  await deps.deliveryStore.insertTextSent(learner.id, 20, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(7, 20, deps);
  assert.equal(result.ok, true);
  if (!result.ok || result.content.kind !== "phrase") throw new Error("expected ok phrase content");
  assert.equal(result.content.audioUrl, "/lessons/week3_day20_male.mp3");
});

test("getLessonAudioContent: Day 26 (word-set day, week4) — audioUrl uses 'week4_day26', not a hardcoded 'week2_'", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(8);
  await deps.learnerStore.update(learner.id, { gender_branch: "female" });
  await deps.deliveryStore.insertTextSent(learner.id, 26, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(8, 26, deps);
  assert.equal(result.ok, true);
  if (!result.ok || result.content.kind !== "wordset") throw new Error("expected ok wordset content");

  const day26 = getLesson(26);
  if (day26.kind !== "wordset") throw new Error("expected day 26 to be a word-set day");

  for (let i = 0; i < day26.words.length; i++) {
    assert.equal(result.content.words[i].audioUrl, `/lessons/week4_day26_${day26.words[i].index}.mp3`);
  }
});

// --- Content shape: Lesson 2 (numbers) — reuses the "wordset" shape --------

test("getLessonAudioContent: Lesson 2, delivered — all 10 numbers as 'wordset'-shaped entries, no gender branch", async () => {
  const deps = makeDeps();
  const learner = await deps.learnerStore.create(6);
  await deps.learnerStore.update(learner.id, { gender_branch: "female" });
  await deps.deliveryStore.insertTextSent(learner.id, 2, "2026-08-30", new Date().toISOString());

  const result = await getLessonAudioContent(6, 2, deps);
  assert.equal(result.ok, true);
  if (!result.ok || result.content.kind !== "wordset") throw new Error("expected ok wordset-shaped content");

  const lesson2 = getLesson(2);
  if (lesson2.kind !== "numbers") throw new Error("expected lesson 2 to be the numbers lesson");

  assert.equal(result.content.words.length, 10);
  for (let i = 0; i < lesson2.numbers.length; i++) {
    assert.equal(result.content.words[i].karaoke, lesson2.numbers[i].karaoke);
    assert.equal(result.content.words[i].meaning, String(lesson2.numbers[i].value), "meaning is the number's own value, no English word to show otherwise");
    assert.equal(result.content.words[i].audioUrl, `/lessons/lesson02_${lesson2.numbers[i].value}.mp3`);
  }
});
