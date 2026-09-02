// Orchestrates one lesson delivery: guard check, picture -> text -> a Web
// App audio button (LDTKB-006 order; audio itself moved off native
// sendAudio entirely per the LDTKB-058 full rollout — see
// WEB_APP_AUDIO_DAYS), then a plain-text explanation (LDTKB-051). The
// recognition-tap activity that used to occupy that final slot (LDTKB-026)
// was removed as a deliberate product decision; LDTKB-051's explanation
// message is its replacement, now built (see LESSON_EXPLANATIONS import).
// All I/O (Telegram, DB, file reads) is behind injected interfaces, so this
// is unit-testable the same way handleUpdate.ts was in Checkpoint 2.

import { getLesson, WEEKS234_LAST_DAY, type GenderBranch, type Lesson, type WordSetLesson } from "@/lib/curriculum/content";
import { LESSON_EXPLANATIONS } from "@/lib/curriculum/lessonExplanations";
import type { InlineKeyboard, MediaFile, TelegramClient } from "@/lib/telegram";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";

// Web App audio delivery — FULL ROLLOUT (revises LDTKB-058). Validated first
// as a scoped prototype on Lessons 2/3/Day 8, now the permanent mechanism
// for every lesson day's audio, 1 through WEEKS234_LAST_DAY (28). Telegram's
// native sendAudio/sendDocument both auto-continue into whatever message
// comes next in the chat regardless of when each was sent (confirmed via
// real testing; no message-type trick avoids it) — a real HTML5 <audio>
// element inside a Telegram Web App isn't affected. Day 29 has its own,
// separate, already-working Web App mechanism (deliverDay29Entry.ts) and is
// deliberately not part of this array. Day 30's quiz audio is explicitly
// out of scope — structurally different, would need its own redesign.
export const WEB_APP_AUDIO_DAYS: readonly number[] = Array.from({ length: WEEKS234_LAST_DAY }, (_, i) => i + 1);

// Kept as a local type (not imported from the now-deleted distractors.ts) so
// DeliverLessonDeps.rng and existing callers that still pass an `rng` stay
// source-compatible even though nothing in this file reads it anymore.
type Rng = () => number;

/**
 * Full Web App audio rollout: every lesson day's audio now goes through
 * sendWebAppAudioButton, not MediaLoader — loadPhraseLessonAudio and
 * loadWordSetAudio are gone from this interface (nothing calls them via
 * `deps.media` any more). Their real implementations stay in mediaFiles.ts,
 * unremoved — loadRepresentativeClip still calls both directly (confirmed
 * via search), the same dependency this project has hit twice before with
 * loadCombinedNumbersAudio (LDTKB-057's two revisions).
 */
export interface MediaLoader {
  loadPhraseLessonImage(lessonNumber: number, gender: GenderBranch): Promise<MediaFile>;
  /** Lesson 2's photo is still one combined image, sent natively (LDTKB-057). */
  loadCombinedNumbersImage(): Promise<MediaFile>;
  loadRepresentativeClip(lessonNumber: number, gender: GenderBranch): Promise<MediaFile>;
  loadWordSetImage(dayNumber: number): Promise<MediaFile>;
}

export interface DeliverLessonInput {
  learnerId: string;
  chatId: number;
  gender: GenderBranch;
  lessonNumber: number;
  deliveryDate: string; // "YYYY-MM-DD", Thailand calendar date for this delivery
  /**
   * lesson_number values already delivered to this learner. Unused now that
   * the recognition-tap activity (its only consumer) is removed — kept on
   * the interface so the cron route's existing call site stays
   * source-compatible; not touched here since that route is out of scope
   * for this removal.
   */
  previouslyDeliveredLessonNumbers: number[];
}

export interface DeliverLessonDeps {
  telegram: TelegramClient;
  deliveryStore: DeliveryStore;
  media: MediaLoader;
  now?: () => Date;
  rng?: Rng;
  /**
   * Public base URL of the deployed app, used to build every lesson's
   * `/lesson/{day}` Web App button URL. Optional (falls back to reading
   * process.env.APP_URL directly) so the cron route's existing call site
   * doesn't need updating — same appUrl shape as deliverDay29Entry.ts's own deps.
   */
  appUrl?: string;
}

export type DeliverLessonResult = { status: "delivered" } | { status: "already_delivered" };

// curriculum/tone-mark-explainer.md (LDTKB-052)
const TONE_LEGEND_MESSAGE =
  "Before your first phrase — Thai Talk Breaks uses its own romanization with 5 tone marks, made specifically to help you pronounce Thai correctly here in @ThaiTalkBreaksBot. Thai has an official romanization for writing (called RTGS) but it doesn't include tone marks, so it's not what you'll see here. Here's what our tone marks mean:\n\n" +
  "a = mid (flat, calm)\n" +
  "à = low (starts low, stays low)\n" +
  "â = falling (starts high, drops)\n" +
  "á = high (tight, high pitch)\n" +
  "ǎ = rising (starts low, rises up)";

function composePhraseText(lessonNumber: number, lesson: Extract<Lesson, { kind: "phrase" }>, gender: GenderBranch): string {
  return (
    `Lesson ${lessonNumber}\n\n` +
    `${lesson.karaoke[gender]}\n` +
    `"${lesson.englishMeaning}"\n\n` +
    `${lesson.script[gender]}`
  );
}

export async function deliverLesson(input: DeliverLessonInput, deps: DeliverLessonDeps): Promise<DeliverLessonResult> {
  const now = deps.now ? deps.now() : new Date();

  const existing = await deps.deliveryStore.findExisting(input.learnerId, input.lessonNumber, input.deliveryDate);
  if (existing) {
    // Duplicate-send guard: never re-send picture/text/audio for a lesson
    // this learner already has a delivery row for today.
    return { status: "already_delivered" };
  }

  const lesson = getLesson(input.lessonNumber);

  if (lesson.kind === "phrase") {
    await deliverPhraseLesson(input, lesson, deps, now);
  } else if (lesson.kind === "numbers") {
    await deliverNumbersLesson(input, deps, now);
  } else {
    await deliverWordSetLesson(input, lesson, deps, now);
  }

  // LDTKB-051: the lesson explanation, sent as the final message — replaces
  // the gap left by the removed recognition-tap activity.
  await deps.telegram.sendMessage(input.chatId, LESSON_EXPLANATIONS[input.lessonNumber]);

  return { status: "delivered" };
}

async function deliverPhraseLesson(
  input: DeliverLessonInput,
  lesson: Extract<Lesson, { kind: "phrase" }>,
  deps: DeliverLessonDeps,
  now: Date,
): Promise<void> {
  const image = await deps.media.loadPhraseLessonImage(input.lessonNumber, input.gender);
  await deps.telegram.sendPhoto(input.chatId, image);

  // LDTKB-025: tone legend shown once, "early in onboarding or lesson 1" —
  // Checkpoint 2's locked onboarding messages don't include it, so lesson 1
  // is where this checkpoint fulfills that requirement. Exact wording here
  // is NOT locked copy (LDTKB-025 locks the 5-mark system, not this
  // message's phrasing) — flagged in SCHEDULER.md for review.
  if (input.lessonNumber === 1) {
    await deps.telegram.sendMessage(input.chatId, TONE_LEGEND_MESSAGE);
  }

  await deps.telegram.sendMessage(input.chatId, composePhraseText(input.lessonNumber, lesson, input.gender));

  // Guard point: text/visual portion is now sent — record it BEFORE
  // attempting audio, so an audio failure on retry never re-sends the above.
  const delivery = await deps.deliveryStore.insertTextSent(
    input.learnerId,
    input.lessonNumber,
    input.deliveryDate,
    now.toISOString(),
  );

  await sendWebAppAudioButton(input, deps);
  await deps.deliveryStore.markAudioSent(delivery.id, new Date().toISOString());
}

/** Shared by deliverPhraseLesson/deliverNumbersLesson/deliverWordSetLesson — see WEB_APP_AUDIO_DAYS. */
async function sendWebAppAudioButton(input: DeliverLessonInput, deps: DeliverLessonDeps): Promise<void> {
  const appUrl = deps.appUrl ?? process.env.APP_URL;
  if (!appUrl) throw new Error("APP_URL must be set to deliver the Web App audio button");

  const keyboard: InlineKeyboard = [
    [{ text: "🔊 Listen to the audio", web_app: { url: `${appUrl}/lesson/${input.lessonNumber}` } }],
  ];
  await deps.telegram.sendMessage(input.chatId, "Tap below to hear it:", keyboard);
}

// LDTKB-057 (this revision): the combined photo (curriculum/pilot/images/
// lesson02_combined.png) and text summary are unchanged. Audio delivers via
// the Web App (see WEB_APP_AUDIO_DAYS / sendWebAppAudioButton), delivering
// the original 10 per-number files (lesson02_1.mp3 .. lesson02_10.mp3).
async function deliverNumbersLesson(input: DeliverLessonInput, deps: DeliverLessonDeps, now: Date): Promise<void> {
  const lesson = getLesson(2);
  if (lesson.kind !== "numbers") throw new Error("expected lesson 2 to be the numbers lesson");

  const summary = lesson.numbers.map((n) => `${n.value}: ${n.karaoke}`).join("\n");
  await deps.telegram.sendMessage(input.chatId, `Lesson 2 — Numbers 1-10\n\n${summary}`);

  const image = await deps.media.loadCombinedNumbersImage();
  await deps.telegram.sendPhoto(input.chatId, image);

  // Guard point, same rule as the phrase-lesson path: text/visual first.
  const delivery = await deps.deliveryStore.insertTextSent(input.learnerId, 2, input.deliveryDate, now.toISOString());

  await sendWebAppAudioButton(input, deps);
  await deps.deliveryStore.markAudioSent(delivery.id, new Date().toISOString());
}

/**
 * Word-set days (8, 10, 16, 26 — Checkpoint 5, LDTKB-048). Same overall
 * shape as deliverNumbersLesson (text summary -> guard -> per-word audio),
 * but with exactly ONE shared image (confirmed against the actual
 * week{2,3,4}-images/ files — see content.ts's WordSetLesson doc), sent
 * once upfront rather than one image per word.
 */
async function deliverWordSetLesson(
  input: DeliverLessonInput,
  lesson: WordSetLesson,
  deps: DeliverLessonDeps,
  now: Date,
): Promise<void> {
  const image = await deps.media.loadWordSetImage(input.lessonNumber);
  await deps.telegram.sendPhoto(input.chatId, image);

  const summary = lesson.words.map((w) => `${w.karaoke} — ${w.meaning}`).join("\n");
  await deps.telegram.sendMessage(input.chatId, `Day ${input.lessonNumber}\n\n${summary}`);

  // Guard point, same rule as the other two delivery paths: text/visual first.
  const delivery = await deps.deliveryStore.insertTextSent(input.learnerId, input.lessonNumber, input.deliveryDate, now.toISOString());

  await sendWebAppAudioButton(input, deps);
  await deps.deliveryStore.markAudioSent(delivery.id, new Date().toISOString());
}

