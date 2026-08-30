import { test } from "node:test";
import assert from "node:assert/strict";

import { deliverLesson, WEB_APP_AUDIO_DAYS } from "@/lib/delivery/deliverLesson";
import { FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";

// Web App audio delivery prototype — scoped to exactly Lesson 3 and Day 8.
// See deliverLesson.ts's WEB_APP_AUDIO_DAYS.

function makeDeps(appUrl: string | undefined = "https://thaitalkbreaks.example") {
  return {
    telegram: new FakeTelegramClient(),
    deliveryStore: new FakeDeliveryStore(),
    media: new FakeMediaLoader(),
    now: () => new Date("2026-08-30T01:00:00.000Z"),
    appUrl,
  };
}

test("WEB_APP_AUDIO_DAYS is exactly [3, 8] — the prototype's scope", () => {
  assert.deepEqual([...WEB_APP_AUDIO_DAYS], [3, 8]);
});

// --- Lesson 3 (phrase day): web_app button instead of sendAudio ------------

test("Lesson 3: sends a web_app button pointing at /lesson/3 instead of sendAudio, and still marks audio sent", async () => {
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

// --- Day 8 (word-set day): web_app button instead of per-word sendAudio ---

test("Day 8: sends a web_app button pointing at /lesson/8 instead of 4 separate sendAudio calls", async () => {
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

// --- Every other lesson number: byte-identical to before this prototype ---

test("Lesson 5 (not in WEB_APP_AUDIO_DAYS): still uses the native sendAudio path, no web_app button anywhere", async () => {
  const deps = makeDeps();

  await deliverLesson(
    { learnerId: "l3", chatId: 3, gender: "male", lessonNumber: 5, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2, 3, 4] },
    deps,
  );

  assert.equal(deps.telegram.sentAudio.length, 1, "Lesson 5 must still send its audio the normal way");
  assert.equal(deps.telegram.sentAudio[0].filename, "lesson5_male.mp3");
  assert.equal(deps.telegram.sentAudio[0].performer, "Lesson 5");

  const hasWebAppButton = deps.telegram.sent.some((m) => m.keyboard?.some((row) => row.some((b) => "web_app" in b)));
  assert.equal(hasWebAppButton, false, "no web_app button anywhere in Lesson 5's delivery");
});

test("Day 10 (word-set day, not in WEB_APP_AUDIO_DAYS): still sends per-word native audio, unaffected", async () => {
  const deps = makeDeps();

  await deliverLesson(
    { learnerId: "l4", chatId: 4, gender: "female", lessonNumber: 10, deliveryDate: "2026-08-30", previouslyDeliveredLessonNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    deps,
  );

  assert.ok(deps.telegram.sentAudio.length > 0, "Day 10 must still send native audio per word");
  const hasWebAppButton = deps.telegram.sent.some((m) => m.keyboard?.some((row) => row.some((b) => "web_app" in b)));
  assert.equal(hasWebAppButton, false);
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
