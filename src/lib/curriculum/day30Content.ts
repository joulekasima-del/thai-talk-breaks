// Day 30 quiz-ladder content — encoded verbatim from
// curriculum/day30-button-wording.md (the checkpoint's designated literal
// source of truth for the audio-file-to-button-text mapping) and
// curriculum/day30-quiz-content.md (completion screen text).
//
// Per LDTKB-046 and day30-quiz-content.md's own worked example ("Prompt:
// Play Q1_correct_answer.mp3... Options shown as 3 buttons"), only the
// CORRECT answer's audio is ever played — the 20 distractor audio files
// exist in curriculum/day30-audio/ but are not referenced by this module or
// played during the quiz; only their button-text labels are used. Flagged
// as a judgment call in CHECKPOINT4.md in case that reading is wrong.

export interface Day30Option {
  buttonText: string;
}

export interface Day30Question {
  index: number; // 1-10
  correctAudioFile: string;
  correctButtonText: string;
  distractorButtonTexts: [string, string];
}

export const DAY30_QUESTIONS: Day30Question[] = [
  { index: 1, correctAudioFile: "Q1_correct_answer.mp3", correctButtonText: "Hello", distractorButtonTexts: ["Sorry", "See you again"] },
  { index: 2, correctAudioFile: "Q2_correct_answer.mp3", correctButtonText: "How much?", distractorButtonTexts: ["Can I pay by card?", "Book one night"] },
  { index: 3, correctAudioFile: "Q3_correct_answer.mp3", correctButtonText: "I don't understand", distractorButtonTexts: ["Help!", "Sorry"] },
  { index: 4, correctAudioFile: "Q4_correct_answer.mp3", correctButtonText: "What time is it?", distractorButtonTexts: ["See you tomorrow", "See you again"] },
  { index: 5, correctAudioFile: "Q5_correct_answer.mp3", correctButtonText: "I'll take one iced coffee", distractorButtonTexts: ["I'll take this one", "This is very delicious!"] },
  { index: 6, correctAudioFile: "Q6_correct_answer.mp3", correctButtonText: "I like watching movies", distractorButtonTexts: ["I don't like traffic", "My name is Dtom"] },
  { index: 7, correctAudioFile: "Q7_correct_answer.mp3", correctButtonText: "This is very delicious!", distractorButtonTexts: ["It's very hot today", "Thailand is beautiful"] },
  { index: 8, correctAudioFile: "Q8_correct_answer.mp3", correctButtonText: "Sorry", distractorButtonTexts: ["I don't understand", "Help!"] },
  { index: 9, correctAudioFile: "Q9_correct_answer.mp3", correctButtonText: "I have a headache", distractorButtonTexts: ["I have a stomach ache", "I feel feverish"] },
  { index: 10, correctAudioFile: "Q10_correct_answer.mp3", correctButtonText: "Thank you very much", distractorButtonTexts: ["Hello", "Sorry"] },
];

export const DAY30_QUESTION_COUNT = DAY30_QUESTIONS.length;

export function getDay30Question(index: number): Day30Question {
  const question = DAY30_QUESTIONS.find((q) => q.index === index);
  if (!question) throw new Error(`No such Day 30 question: ${index}`);
  return question;
}

// day30-quiz-content.md "Completion screen" — locked format (score + badge,
// LDTKB-043), text itself not locked.
export function day30ScoreMessage(correctCount: number): string {
  return `You got **${correctCount}/10**! 🎉`;
}

export const DAY30_BADGE_MESSAGE = "🏅 **Thai Talk Breaks Graduate**";
