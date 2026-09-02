import { test } from "node:test";
import assert from "node:assert/strict";

import { deliverLesson, WEB_APP_AUDIO_DAYS } from "@/lib/delivery/deliverLesson";
import { WEEKS234_LAST_DAY } from "@/lib/curriculum/content";
import { FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";

// Web App audio delivery — LDTKB-058 full rollout. Every lesson day (1-28)
// now delivers its audio via the Web App instead of native sendAudio.
// See deliverLesson.ts's WEB_APP_AUDIO_DAYS. Day 29 has its own separate
// mechanism (deliverDay29Entry.ts); Day 30's quiz is explicitly out of
// scope — neither is part of this array.

function makeDeps(appUrl: string | undefined = "https://thaitalkbreaks.example") {
  return {
    telegram: new FakeTelegramClient(),
    deliveryStore: new FakeDeliveryStore(),
    media: new FakeMediaLoader(),
    now: () => new Date("2026-08-30T01:00:00.000Z"),
    appUrl,
  };
}

test("WEB_APP_AUDIO_DAYS is exactly [1..28] — every lesson day, and only those", () => {
  const expected = Array.from({ length: WEEKS234_LAST_DAY }, (_, i) => i + 1);
  assert.deepEqual([...WEB_APP_AUDIO_DAYS], expected);
  assert.equal(WEB_APP_AUDIO_DAYS.length, 28);
  assert.ok(!WEB_APP_AUDIO_DAYS.includes(29), "Day 29 has its own separate Web App mechanism, not this array");
  assert.ok(!WEB_APP_AUDIO_DAYS.includes(30), "Day 30's quiz audio is explicitly out of scope");
});

// --- Lesson 2 (numbers day): combined photo still native, audio via Web App -

test("Lesson 2: still sends the combined photo natively, but a web_app button (not audio) for the numbers", async () => {
  const deps = makeDeps();

  const result = await deliverLesson(
    { learnerId: "l0", chatId: 0, gender: "male", lessonNumber: 2, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1] },
    deps,
  );

  assert.equal(result.status, "delivered");
  assert.equal(deps.telegram.sentPhotos.length, 1, "the combined photo is still sent natively");
  assert.equal(deps.telegram.sentPhotos[0].filename, "lesson2_combined.png");
  assert.equal(deps.telegram.sentAudio.length, 0, "no native sendAudio call for Lesson 2 any more");

  const buttonMessage = deps.telegram.sent.find((m) => m.keyboard);
  assert.ok(buttonMessage, "expected one message with a keyboard");
  const button = buttonMessage!.keyboard![0][0];
  assert.deepEqual(button, {
    text: "🔊 Listen to the audio",
    web_app: { url: "https://thaitalkbreaks.example/lesson/2" },
  });

  const delivery = await deps.deliveryStore.findExisting("l0", 2, "2026-08-30");
  assert.ok(delivery?.audio_delivered_at, "audio_delivered_at must still be set for the web_app path");
});

// --- Phrase days (pilot + Weeks 2-4): web_app button instead of sendAudio -

test("Lesson 3 (pilot phrase day): sends a web_app button pointing at /lesson/3 instead of sendAudio", async () => {
  const deps = makeDeps();

  const result = await deliverLesson(
    { learnerId: "l1", chatId: 1, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2] },
    deps,
  );

  assert.equal(result.status, "delivered");
  assert.equal(deps.telegram.sentAudio.length, 0, "no native sendAudio call for Lesson 3");
  assert.ok(!deps.media.requested.includes("lesson3_male.mp3"), "the audio file must not even be loaded for Lesson 3");

  const buttonMessage = deps.telegram.sent.find((m) => m.keyboard);
  assert.ok(buttonMessage, "expected one message with a keyboard");
  const button = buttonMessage!.keyboard![0][0];
  assert.deepEqual(button, {
    text: "🔊 Listen to the audio",
    web_app: { url: "https://thaitalkbreaks.example/lesson/3" },
  });

  const delivery = await deps.deliveryStore.findExisting("l1", 3, "2026-08-30");
  assert.ok(delivery?.audio_delivered_at, "audio_delivered_at must still be set for the web_app path");
});

test("Lesson 5 (pilot phrase day, previously exempt as the prototype's control case): now also sends a web_app button, no native audio", async () => {
  const deps = makeDeps();

  await deliverLesson(
    { learnerId: "l3", chatId: 3, gender: "male", lessonNumber: 5, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2, 3, 4] },
    deps,
  );

  assert.equal(deps.telegram.sentAudio.length, 0, "Lesson 5 no longer sends native audio (full rollout)");
  const buttonMessage = deps.telegram.sent.find((m) => m.keyboard?.some((row) => row.some((b) => "web_app" in b)));
  assert.ok(buttonMessage, "Lesson 5 must now send a web_app audio button");
  const button = buttonMessage!.keyboard![0][0];
  assert.deepEqual(button, { text: "🔊 Listen to the audio", web_app: { url: "https://thaitalkbreaks.example/lesson/5" } });
});

test("Day 20 (Weeks 2-4 phrase day): sends a web_app button pointing at /lesson/20, no native audio", async () => {
  const deps = makeDeps();

  await deliverLesson(
    {
      learnerId: "l7",
      chatId: 7,
      gender: "female",
      lessonNumber: 20,
      deliveryDate: "2026-08-30",
      previouslyDeliveredLessonNumbers: Array.from({ length: 19 }, (_, i) => i + 1),
    },
    deps,
  );

  assert.equal(deps.telegram.sentAudio.length, 0);
  const buttonMessage = deps.telegram.sent.find((m) => m.keyboard);
  assert.ok(buttonMessage);
  const button = buttonMessage!.keyboard![0][0];
  assert.deepEqual(button, { text: "🔊 Listen to the audio", web_app: { url: "https://thaitalkbreaks.example/lesson/20" } });
});

// --- Word-set days: web_app button instead of per-word sendAudio ----------

test("Day 8 (word-set day): sends a web_app button pointing at /lesson/8 instead of 4 separate sendAudio calls", async () => {
  const deps = makeDeps();

  const result = await deliverLesson(
    { learnerId: "l2", chatId: 2, gender: "female", lessonNumber: 8, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7] },
    deps,
  );

  assert.equal(result.status, "delivered");
  assert.equal(deps.telegram.sentAudio.length, 0, "no native sendAudio calls for Day 8 (would otherwise be 4, one per word)");
  assert.ok(
    !deps.media.requested.some((f) => f.startsWith("day8_") && !f.startsWith("representative:")),
    "none of Day 8's word audio files should even be loaded",
  );

  const buttonMessage = deps.telegram.sent.find((m) => m.keyboard);
  assert.ok(buttonMessage);
  const button = buttonMessage!.keyboard![0][0];
  assert.deepEqual(button, {
    text: "🔊 Listen to the audio",
    web_app: { url: "https://thaitalkbreaks.example/lesson/8" },
  });

  const delivery = await deps.deliveryStore.findExisting("l2", 8, "2026-08-30");
  assert.ok(delivery?.audio_delivered_at);
});

test("Day 26 (word-set day, previously exempt as the prototype's control case): now also sends a web_app button, no native audio", async () => {
  const deps = makeDeps();

  await deliverLesson(
    {
      learnerId: "l4",
      chatId: 4,
      gender: "female",
      lessonNumber: 26,
      deliveryDate: "2026-08-30",
      previouslyDeliveredLessonNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
    },
    deps,
  );

  assert.equal(deps.telegram.sentAudio.length, 0, "Day 26 no longer sends native per-word audio (full rollout)");
  const buttonMessage = deps.telegram.sent.find((m) => m.keyboard?.some((row) => row.some((b) => "web_app" in b)));
  assert.ok(buttonMessage, "Day 26 must now send a web_app audio button");
  const button = buttonMessage!.keyboard![0][0];
  assert.deepEqual(button, { text: "🔊 Listen to the audio", web_app: { url: "https://thaitalkbreaks.example/lesson/26" } });
});

// --- appUrl fallback ---------------------------------------------------

test("Lesson 3: falls back to process.env.APP_URL when deps.appUrl is not provided", async () => {
  const original = process.env.APP_URL;
  process.env.APP_URL = "https://env-fallback.example";
  try {
    // Deliberately NOT using makeDeps() here — its `appUrl` parameter has a
    // default value, and a default parameter still applies even when the
    // caller explicitly passes `undefined`, so makeDeps(undefined) would
    // silently produce "https://thaitalkbreaks.example" instead of a truly
    // absent appUrl. Build the deps object directly instead, omitting the
    // key entirely, to genuinely exercise the process.env.APP_URL fallback.
    const deps = {
      telegram: new FakeTelegramClient(),
      deliveryStore: new FakeDeliveryStore(),
      media: new FakeMediaLoader(),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
    };
    await deliverLesson(
      { learnerId: "l5", chatId: 5, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2] },
      deps,
    );
    const buttonMessage = deps.telegram.sent.find((m) => m.keyboard);
    const button = buttonMessage!.keyboard![0][0];
    assert.deepEqual(button, { text: "🔊 Listen to the audio", web_app: { url: "https://env-fallback.example/lesson/3" } });
  } finally {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  }
});

test("Lesson 3: throws if neither deps.appUrl nor process.env.APP_URL is set", async () => {
  const original = process.env.APP_URL;
  delete process.env.APP_URL;
  try {
    // Same reasoning as the fallback test above — omit appUrl entirely
    // rather than passing makeDeps(undefined), which would apply its
    // default value instead of truly leaving appUrl absent.
    const deps = {
      telegram: new FakeTelegramClient(),
      deliveryStore: new FakeDeliveryStore(),
      media: new FakeMediaLoader(),
      now: () => new Date("2026-08-30T01:00:00.000Z"),
    };
    await assert.rejects(() =>
      deliverLesson(
        { learnerId: "l6", chatId: 6, gender: "male", lessonNumber: 3, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2] },
        deps,
      ),
    );
  } finally {
    if (original === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = original;
  }
});
