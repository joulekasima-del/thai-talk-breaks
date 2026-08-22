// Pilot lesson content (Days 1-7), encoded from curriculum/pilot/lesson-*.md,
// PLUS Weeks 2-4 content (Days 8-28), encoded from
// curriculum/week{2,3,4}-lessons-*.md (Checkpoint 5) — all read-only source
// of truth; do not edit lesson text here without updating those files
// first. This module is the code-side mirror of the finalized copy,
// analogous to onboarding/content.ts in Checkpoint 2.
//
// Karaoke/script text is copied verbatim from each source file. Days
// 29-30 are NOT here — Day 29 (living comic) is unbuilt, separate scope;
// Day 30 (quiz-ladder) has its own dedicated module, day30Content.ts.

export type GenderBranch = "male" | "female";

// lessonNumber widened beyond a tight literal union to plain `number` for
// Days 8-28 (23 possible values across the pilot + 3 weeks) — a pragmatic
// simplification over an unwieldy 23-member union type; getLesson() below
// still validates at runtime (throws for any undefined lessonNumber), so
// nothing is silently permitted through that wasn't previously deliberate.
export interface GenderBranchedLesson {
  kind: "phrase";
  lessonNumber: number;
  englishMeaning: string;
  karaoke: Record<GenderBranch, string>;
  script: Record<GenderBranch, string>;
}

export interface NumbersLesson {
  kind: "numbers";
  lessonNumber: 2;
  englishMeaning: string;
  numbers: { value: number; karaoke: string }[];
}

// Days 8, 10, 16, 26 (LDTKB-048 names 8/16/26 explicitly for the
// word-matching activity design; Day 10 is structurally identical — see
// Checkpoint 5 report item 12). No gender branch, no single phrase — a set
// of standalone words, each with its own audio, but ALL SHARING ONE IMAGE
// (confirmed against the actual week2/3/4-images/ files: day08.png,
// day10.png, day16.png, day26.png each exist exactly once, unlike the
// pilot's Lesson 2 which has one image PER number) — this is why WordSet
// gets its own `kind` rather than reusing NumbersLesson's shape.
export interface WordSetWord {
  index: number; // 1-based, matches the audio filename suffix and table row order
  karaoke: string;
  meaning: string;
}

export interface WordSetLesson {
  kind: "wordset";
  lessonNumber: 8 | 10 | 16 | 26;
  words: WordSetWord[];
}

export type Lesson = GenderBranchedLesson | NumbersLesson | WordSetLesson;

// curriculum/pilot/lesson-01-greetings.md
const LESSON_1: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 1,
  englishMeaning: "Hello",
  karaoke: { male: "sà-wàt-dii kráp", female: "sà-wàt-dii kâ" },
  script: { male: "สวัสดีครับ", female: "สวัสดีค่ะ" },
};

// curriculum/pilot/lesson-02-numbers.md
const LESSON_2: NumbersLesson = {
  kind: "numbers",
  lessonNumber: 2,
  englishMeaning: "Numbers 1–10",
  numbers: [
    { value: 1, karaoke: "nùeng" },
    { value: 2, karaoke: "sǎwng" },
    { value: 3, karaoke: "sǎam" },
    { value: 4, karaoke: "sìi" },
    { value: 5, karaoke: "hâa" },
    { value: 6, karaoke: "hòk" },
    { value: 7, karaoke: "jèt" },
    { value: 8, karaoke: "bpàet" },
    { value: 9, karaoke: "gâo" },
    { value: 10, karaoke: "sìp" },
  ],
};

// curriculum/pilot/lesson-03-ordering.md
const LESSON_3: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 3,
  englishMeaning: "I'll take this one / I would like this",
  karaoke: { male: "ao an-níi kráp", female: "ao an-níi kâ" },
  script: { male: "เอาอันนี้ครับ", female: "เอาอันนี้ค่ะ" },
};

// curriculum/pilot/lesson-04-transport.md
const LESSON_4: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 4,
  englishMeaning: "How much?",
  karaoke: { male: "tâo-rài kráp", female: "tâo-rài ká" },
  script: { male: "เท่าไหร่ครับ", female: "เท่าไหร่คะ" },
};

// curriculum/pilot/lesson-05-shopping.md
const LESSON_5: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 5,
  englishMeaning: "Can I pay by card?",
  karaoke: { male: "jàai pàan bàt dâai măi kráp", female: "jàai pàan bàt dâai măi ká" },
  script: { male: "จ่ายผ่านบัตรได้ไหมครับ", female: "จ่ายผ่านบัตรได้ไหมคะ" },
};

// curriculum/pilot/lesson-06-smalltalk.md
const LESSON_6: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 6,
  englishMeaning: "Where are you from?",
  karaoke: { male: "bpen kon tîi năi kráp", female: "bpen kon tîi năi ká" },
  script: { male: "เป็นคนที่ไหนครับ", female: "เป็นคนที่ไหนคะ" },
};

// curriculum/pilot/lesson-07-help.md
const LESSON_7: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 7,
  englishMeaning: "I don't understand",
  karaoke: { male: "mâi kâo-jai kráp", female: "mâi kâo-jai kâ" },
  script: { male: "ไม่เข้าใจครับ", female: "ไม่เข้าใจค่ะ" },
};

// ---------------------------------------------------------------------------
// Weeks 2-4 (Days 8-28) — curriculum/week2-lessons-08-14.md,
// week3-lessons-15-21.md, week4-lessons-22-30.md
// ---------------------------------------------------------------------------

// curriculum/week2-lessons-08-14.md, Day 8
const DAY_8: WordSetLesson = {
  kind: "wordset",
  lessonNumber: 8,
  words: [
    { index: 1, karaoke: "dtrong bpai", meaning: "Straight ahead" },
    { index: 2, karaoke: "líeow sái", meaning: "Turn left" },
    { index: 3, karaoke: "líeow khwǎa", meaning: "Turn right" },
    { index: 4, karaoke: "jòrt dtrong-níi", meaning: "Stop here" },
  ],
};

// Day 9 — main phrase only, NOT the "excuse me" extended two-part version
// (see report item 7 — a flagged, not certain, judgment call).
const DAY_9: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 9,
  englishMeaning: "What time is it now?",
  karaoke: { male: "gìi-mohng-láew kráp", female: "gìi-mohng-láew ká" },
  script: { male: "กี่โมงแล้วครับ", female: "กี่โมงแล้วคะ" },
};

// Day 10 — structurally a word set (see WordSetLesson comment above).
const DAY_10: WordSetLesson = {
  kind: "wordset",
  lessonNumber: 10,
  words: [
    { index: 1, karaoke: "wan-níi", meaning: "Today" },
    { index: 2, karaoke: "phrûng-níi", meaning: "Tomorrow" },
    { index: 3, karaoke: "mêua-waan-níi", meaning: "Yesterday" },
  ],
};

const DAY_11: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 11,
  englishMeaning: "It's really hot today",
  karaoke: { male: "wan-níi rórn mâak kráp", female: "wan-níi rórn mâak kâ" },
  script: { male: "วันนี้ร้อนมากครับ", female: "วันนี้ร้อนมากค่ะ" },
};

// Day 12 — main ("bigger") phrase only, not the "opposite/smaller" variant.
const DAY_12: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 12,
  englishMeaning: "Do you have anything bigger than this?",
  karaoke: { male: "mii yài gwàa níi mǎi kráp", female: "mii yài gwàa níi mǎi ká" },
  script: { male: "มีใหญ่กว่านี้ไหมครับ", female: "มีใหญ่กว่านี้ไหมคะ" },
};

// Day 13 — main phrase only; the 4 sweetness-level words are teaching
// content, not part of a word-set activity (Day 13 is not one of LDTKB-048's
// named word-set days).
const DAY_13: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 13,
  englishMeaning: "I'll take one iced coffee",
  karaoke: { male: "ao gaa-fae yen nèung gâew kráp", female: "ao gaa-fae yen nèung gâew kâ" },
  script: { male: "เอากาแฟเย็นหนึ่งแก้วครับ", female: "เอากาแฟเย็นหนึ่งแก้วค่ะ" },
};

const DAY_14: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 14,
  englishMeaning: "See you next time",
  karaoke: { male: "jer gan mài kráp", female: "jer gan mài kâ" },
  script: { male: "เจอกันใหม่ครับ", female: "เจอกันใหม่ค่ะ" },
};

// Day 15 — template phrase (name inserted after "chêu"). Per LDTKB-047,
// only the younger-speaker form is delivered/tested (ผม/หนู, never พี่).
// The literal template text (with "..." where a name goes) is used as-is
// from the source file — the exact name/example actually spoken in the
// recorded audio is not documented anywhere in the repo; flagged in the
// report rather than guessed at.
const DAY_15: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 15,
  englishMeaning: "My name is...",
  karaoke: { male: "phǒm chêu ... kráp", female: "nǔu chêu ... kâ" },
  script: { male: "ผมชื่อ...ครับ", female: "หนูชื่อ...ค่ะ" },
};

const DAY_16: WordSetLesson = {
  kind: "wordset",
  lessonNumber: 16,
  words: [
    { index: 1, karaoke: "mâe", meaning: "Mother" },
    { index: 2, karaoke: "phôr", meaning: "Father" },
    { index: 3, karaoke: "phîi-nórng", meaning: "Siblings" },
  ],
};

// Day 17 — template phrase (activity inserted after "chôrp"). Younger form
// only, per LDTKB-047 — same flagged-template caveat as Day 15.
const DAY_17: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 17,
  englishMeaning: "I like...",
  karaoke: { male: "phǒm chôrp ... kráp", female: "nǔu chôrp ... kâ" },
  script: { male: "ผมชอบ...ครับ", female: "หนูชอบ...ค่ะ" },
};

const DAY_18: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 18,
  englishMeaning: "Let's meet tomorrow",
  karaoke: { male: "phrûng-níi jer gan ná kráp", female: "phrûng-níi jer gan ná-ká" },
  script: { male: "พรุ่งนี้เจอกันนะครับ", female: "พรุ่งนี้เจอกันนะคะ" },
};

const DAY_19: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 19,
  englishMeaning: "This is very delicious!",
  karaoke: { male: "a-rôi mâak kráp", female: "a-rôi mâak kâ" },
  script: { male: "อร่อยมากครับ", female: "อร่อยมากค่ะ" },
};

const DAY_20: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 20,
  englishMeaning: "I'm sorry",
  karaoke: { male: "khǎaw-thôht kráp", female: "khǎaw-thôht kâ" },
  script: { male: "ขอโทษครับ", female: "ขอโทษค่ะ" },
};

// Day 21 — template phrase (activity inserted after "chôrp"). Younger form
// only, per LDTKB-047 — same flagged-template caveat as Days 15/17.
const DAY_21: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 21,
  englishMeaning: "I don't like it",
  karaoke: { male: "phǒm mâi chôrp ... kráp", female: "nǔu mâi chôrp ... kâ" },
  script: { male: "ผมไม่ชอบ...ครับ", female: "หนูไม่ชอบ...ค่ะ" },
};

// Day 22 — headache phrase, LDTKB-048's named canonical phrase for this
// day. Unlike 15/17/21, this is a COMPLETE phrase, not a template — no
// blank to fill. Younger form only per LDTKB-047. The 3 additional
// wellbeing phrases (feverish, stomach ache, "it hurts here") are teaching
// content only, same treatment as Day 12's "opposite" / Day 24's "online
// booking" variants.
const DAY_22: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 22,
  englishMeaning: "I have a headache",
  karaoke: { male: "phǒm bpùat hǔa kráp", female: "nǔu bpùat hǔa kâ" },
  script: { male: "ผมปวดหัวครับ", female: "หนูปวดหัวค่ะ" },
};

const DAY_23: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 23,
  englishMeaning: "Help me!",
  karaoke: { male: "chûay-dûay kráp", female: "chûay-dûay kâ" },
  script: { male: "ช่วยด้วยครับ", female: "ช่วยด้วยค่ะ" },
};

// Day 24 — main ("book a room") phrase only, not the "online booking" variant.
const DAY_24: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 24,
  englishMeaning: "I'd like to book a room for one night",
  karaoke: { male: "jorng hôrng nèung khuen kráp", female: "jorng hôrng nèung khuen kâ" },
  script: { male: "จองห้องหนึ่งคืนครับ", female: "จองห้องหนึ่งคืนค่ะ" },
};

// Day 25 — LDTKB-048 names example #1 ("may I park here?") as the
// canonical tested phrase, out of 5 valid examples. Unlike 15/17/21, this
// is fully filled in (not a "..." template) — LDTKB-048 gives the complete
// text directly.
const DAY_25: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 25,
  englishMeaning: "May I park here?",
  karaoke: { male: "khǎw jòrt rót dtrong-níi dâai mǎi kráp", female: "khǎw jòrt rót dtrong-níi dâai mǎi ká" },
  script: { male: "ขอจอดรถตรงนี้ได้ไหมครับ", female: "ขอจอดรถตรงนี้ได้ไหมคะ" },
};

const DAY_26: WordSetLesson = {
  kind: "wordset",
  lessonNumber: 26,
  words: [
    { index: 1, karaoke: "châi", meaning: "Yes/correct" },
    { index: 2, karaoke: "mâi châi", meaning: "No/incorrect" },
    { index: 3, karaoke: "àat-jà", meaning: "Maybe" },
  ],
};

const DAY_27: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 27,
  englishMeaning: "Thank you very much",
  karaoke: { male: "khàwp-khun mâak kráp", female: "khàwp-khun mâak kâ" },
  script: { male: "ขอบคุณมากครับ", female: "ขอบคุณมากค่ะ" },
};

const DAY_28: GenderBranchedLesson = {
  kind: "phrase",
  lessonNumber: 28,
  englishMeaning: "Thailand is beautiful",
  karaoke: { male: "meuang-thai sǔay kráp", female: "meuang-thai sǔay kâ" },
  script: { male: "เมืองไทยสวยครับ", female: "เมืองไทยสวยค่ะ" },
};

export const LESSONS: Record<number, Lesson> = {
  1: LESSON_1,
  2: LESSON_2,
  3: LESSON_3,
  4: LESSON_4,
  5: LESSON_5,
  6: LESSON_6,
  7: LESSON_7,
  8: DAY_8,
  9: DAY_9,
  10: DAY_10,
  11: DAY_11,
  12: DAY_12,
  13: DAY_13,
  14: DAY_14,
  15: DAY_15,
  16: DAY_16,
  17: DAY_17,
  18: DAY_18,
  19: DAY_19,
  20: DAY_20,
  21: DAY_21,
  22: DAY_22,
  23: DAY_23,
  24: DAY_24,
  25: DAY_25,
  26: DAY_26,
  27: DAY_27,
  28: DAY_28,
};

export const PILOT_LESSON_COUNT = 7;

// Last day with real, deliverable content as of Checkpoint 5. Day 29
// (living comic) and Day 30 (quiz-ladder, its own module) are NOT included
// here — see cron/deliver/route.ts for how the day-window branches.
export const WEEKS234_LAST_DAY = 28;

const WORDSET_DAY_NUMBERS = new Set([8, 10, 16, 26]);
export function isWordSetDay(lessonNumber: number): boolean {
  return WORDSET_DAY_NUMBERS.has(lessonNumber);
}

export function getLesson(lessonNumber: number): Lesson {
  const lesson = LESSONS[lessonNumber];
  if (!lesson) throw new Error(`No such pilot lesson: ${lessonNumber}`);
  return lesson;
}
