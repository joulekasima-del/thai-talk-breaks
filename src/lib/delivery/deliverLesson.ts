// Orchestrates one lesson delivery: guard check, picture -> text -> native
// audio (LDTKB-006 order), then the recognition-tap activity (LDTKB-026).
// All I/O (Telegram, DB, file reads) is behind injected interfaces, so this
// is unit-testable the same way handleUpdate.ts was in Checkpoint 2.

import { getLesson, type GenderBranch, type Lesson, type WordSetLesson } from "@/lib/curriculum/content";
import type { MediaFile, TelegramClient } from "@/lib/telegram";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";
import { pickCrossLessonDistractors, pickNumberDistractors, pickWordSetDistractors, type Rng } from "@/lib/delivery/distractors";

export interface MediaLoader {
  loadPhraseLessonAudio(lessonNumber: number, gender: GenderBranch): Promise<MediaFile>;
  loadPhraseLessonImage(lessonNumber: number, gender: GenderBranch): Promise<MediaFile>;
  loadNumberAudio(numberValue: number): Promise<MediaFile>;
  loadNumberImage(numberValue: number): Promise<MediaFile>;
  loadRepresentativeClip(lessonNumber: number, gender: GenderBranch): Promise<MediaFile>;
  /** Checkpoint 5 — Weeks 2-4 word-set days (8, 10, 16, 26). */
  loadWordSetAudio(dayNumber: number, wordIndex: number): Promise<MediaFile>;
  loadWordSetImage(dayNumber: number): Promise<MediaFile>;
}

export interface DeliverLessonInput {
  learnerId: string;
  chatId: number;
  gender: GenderBranch;
  lessonNumber: number;
  deliveryDate: string; // "YYYY-MM-DD", Thailand calendar date for this delivery
  /** lesson_number values already delivered to this learner, for distractor selection. */
  previouslyDeliveredLessonNumbers: number[];
}

export interface DeliverLessonDeps {
  telegram: TelegramClient;
  deliveryStore: DeliveryStore;
  media: MediaLoader;
  now?: () => Date;
  rng?: Rng;
}

export type DeliverLessonResult =
  | { status: "delivered" }
  | { status: "already_delivered" }
  | { status: "no_activity_content"; reason: string };

const TONE_LEGEND_MESSAGE =
  "Before your first phrase — Thai Karaoke uses 5 tone marks. Here's what they mean:\n\n" +
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
  const rng = deps.rng ?? Math.random;

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

  return await deliverActivity(input, lesson, deps, rng);
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

  const audio = await deps.media.loadPhraseLessonAudio(input.lessonNumber, input.gender);
  await deps.telegram.sendAudio(input.chatId, audio, `Lesson ${input.lessonNumber}`);
  await deps.deliveryStore.markAudioSent(delivery.id, new Date().toISOString());
}

async function deliverNumbersLesson(input: DeliverLessonInput, deps: DeliverLessonDeps, now: Date): Promise<void> {
  const lesson = getLesson(2);
  if (lesson.kind !== "numbers") throw new Error("expected lesson 2 to be the numbers lesson");

  const summary = lesson.numbers.map((n) => `${n.value}: ${n.karaoke}`).join("\n");
  await deps.telegram.sendMessage(input.chatId, `Lesson 2 — Numbers 1-10\n\n${summary}`);

  for (const n of lesson.numbers) {
    const image = await deps.media.loadNumberImage(n.value);
    await deps.telegram.sendPhoto(input.chatId, image, `${n.value}: ${n.karaoke}`);
  }

  // Guard point, same rule as the phrase-lesson path: text/visual first.
  const delivery = await deps.deliveryStore.insertTextSent(input.learnerId, 2, input.deliveryDate, now.toISOString());

  for (const n of lesson.numbers) {
    const audio = await deps.media.loadNumberAudio(n.value);
    await deps.telegram.sendAudio(input.chatId, audio, `${n.value}: ${n.karaoke}`);
  }
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

  for (const w of lesson.words) {
    const audio = await deps.media.loadWordSetAudio(input.lessonNumber, w.index);
    await deps.telegram.sendAudio(input.chatId, audio, w.meaning);
  }
  await deps.deliveryStore.markAudioSent(delivery.id, new Date().toISOString());
}

/**
 * LDTKB-026: 2-3 audio clips as inline buttons, one correct. Sent as
 * separate labeled audio messages (A/B/[C]) followed by one message with
 * inline buttons — Telegram has no single "audio quiz" message type.
 *
 * callback_data is self-describing (`activity:phrase:<lessonNumber>:<0|1>`
 * or `activity:num:<correctNumber>:<0|1>`) — Checkpoint 4 (see
 * src/lib/activities/lessonActivity.ts) routes on the `activity:` prefix
 * and reads correctness straight out of the tapped button, rather than
 * re-deriving it from lesson content at answer time.
 */
async function deliverActivity(
  input: DeliverLessonInput,
  lesson: Lesson,
  deps: DeliverLessonDeps,
  rng: Rng,
): Promise<DeliverLessonResult> {
  const labels = ["A", "B", "C"];

  if (lesson.kind === "numbers") {
    const correct = lesson.numbers[Math.floor(rng() * lesson.numbers.length)].value;
    const distractors = pickNumberDistractors(correct, rng);
    const options = shuffleWithCorrectMarked([correct, ...distractors], correct, rng);

    await deps.telegram.sendMessage(input.chatId, "Which number did you hear? Listen to each clip:");
    for (let i = 0; i < options.length; i++) {
      const audio = await deps.media.loadNumberAudio(options[i].value);
      await deps.telegram.sendAudio(input.chatId, audio, `Option ${labels[i]}`);
    }
    await deps.telegram.sendMessage(
      input.chatId,
      "Which one was it?",
      [options.map((o, i) => ({ text: labels[i], callback_data: `activity:num:${correct}:${o.value === correct ? 1 : 0}` }))],
    );
    return { status: "delivered" };
  }

  if (lesson.kind === "wordset") {
    const correctWord = lesson.words[Math.floor(rng() * lesson.words.length)];
    const distractorIndexes = pickWordSetDistractors(correctWord.index, lesson.words.length, rng);
    const options = shuffleWithCorrectMarked([correctWord.index, ...distractorIndexes], correctWord.index, rng);

    await deps.telegram.sendMessage(input.chatId, "Which word did you hear? Listen to each clip:");
    for (let i = 0; i < options.length; i++) {
      const audio = await deps.media.loadWordSetAudio(input.lessonNumber, options[i].value);
      await deps.telegram.sendAudio(input.chatId, audio, `Option ${labels[i]}`);
    }
    await deps.telegram.sendMessage(
      input.chatId,
      "Which one was it?",
      [
        options.map((o, i) => ({
          text: labels[i],
          callback_data: `activity:wordset:${input.lessonNumber}:${correctWord.index}:${o.value === correctWord.index ? 1 : 0}`,
        })),
      ],
    );
    return { status: "delivered" };
  }

  const distractorLessons = pickCrossLessonDistractors(input.lessonNumber, input.previouslyDeliveredLessonNumbers, rng);
  if (distractorLessons.length === 0) {
    // Lesson 1: no prior taught material exists to draw a distractor from
    // (see distractors.ts, SCHEDULER.md). Skip the tap activity rather than
    // invent content or violate "teach before testing" — flagged for review.
    await deps.telegram.sendMessage(
      input.chatId,
      "Nice work! Recognition-tap activities start from tomorrow's lesson, once there's more to compare against.",
    );
    return { status: "no_activity_content", reason: "lesson 1 has no eligible distractor pool" };
  }

  const optionLessonNumbers = shuffleWithCorrectMarked(
    [input.lessonNumber, ...distractorLessons],
    input.lessonNumber,
    rng,
  );

  await deps.telegram.sendMessage(input.chatId, "Which clip matches today's phrase? Listen to each one:");
  for (let i = 0; i < optionLessonNumbers.length; i++) {
    const isToday = optionLessonNumbers[i].value === input.lessonNumber;
    const audio = isToday
      ? await deps.media.loadPhraseLessonAudio(input.lessonNumber, input.gender)
      : await deps.media.loadRepresentativeClip(optionLessonNumbers[i].value, input.gender);
    await deps.telegram.sendAudio(input.chatId, audio, `Option ${labels[i]}`);
  }
  await deps.telegram.sendMessage(
    input.chatId,
    "Which one was it?",
    [
      optionLessonNumbers.map((o, i) => ({
        text: labels[i],
        callback_data: `activity:phrase:${input.lessonNumber}:${o.value === input.lessonNumber ? 1 : 0}`,
      })),
    ],
  );
  return { status: "delivered" };
}

function shuffleWithCorrectMarked<T extends number>(values: T[], correct: T, rng: Rng): { value: T }[] {
  const items = values.map((value) => ({ value }));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  void correct; // correctness is read from `value` at use sites; kept for clarity
  return items;
}
