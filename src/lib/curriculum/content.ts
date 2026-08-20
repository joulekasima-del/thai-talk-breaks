// Pilot lesson content, encoded from curriculum/pilot/lesson-*.md (read-only
// source of truth — do not edit lesson text here without updating those
// files first; this module is the code-side mirror of the finalized copy,
// analogous to onboarding/content.ts in Checkpoint 2).
//
// Karaoke/script text is copied from each lesson file's "Step 2" and
// "Step 4" tables/lines exactly as authored and native-speaker-reviewed
// (per BUILD_TRACKER.md Stage 3). English meaning from "Step 3".

export type GenderBranch = "male" | "female";

export interface GenderBranchedLesson {
  kind: "phrase";
  lessonNumber: 1 | 3 | 4 | 5 | 6 | 7;
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

export type Lesson = GenderBranchedLesson | NumbersLesson;

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

export const LESSONS: Record<number, Lesson> = {
  1: LESSON_1,
  2: LESSON_2,
  3: LESSON_3,
  4: LESSON_4,
  5: LESSON_5,
  6: LESSON_6,
  7: LESSON_7,
};

export const PILOT_LESSON_COUNT = 7;

export function getLesson(lessonNumber: number): Lesson {
  const lesson = LESSONS[lessonNumber];
  if (!lesson) throw new Error(`No such pilot lesson: ${lessonNumber}`);
  return lesson;
}
