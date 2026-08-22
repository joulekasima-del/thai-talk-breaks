// Day 30 quiz-ladder content — encoded verbatim from
// curriculum/day30-button-wording.md (the checkpoint's designated literal
// source of truth for the audio-file-to-button-text mapping) and
// curriculum/day30-quiz-content.md (completion screen text).
//
// Per LDTKB-046's 22 August 2026 amendment, all 3 of a question's audio
// files are used: the correct-answer clip plays as the upfront prompt AND
// again if its button is tapped; each distractor clip plays if and when its
// own button is tapped. No button's label is ever false to its own audio —
// see distractorAudioFiles below, paired index-for-index with
// distractorButtonTexts.

export interface Day30Question {
  index: number; // 1-10
  correctAudioFile: string;
  correctButtonText: string;
  distractorButtonTexts: [string, string];
  distractorAudioFiles: [string, string]; // distractorAudioFiles[i] is the true audio for distractorButtonTexts[i]
}

export const DAY30_QUESTIONS: Day30Question[] = [
  { index: 1, correctAudioFile: "Q1_correct_answer.mp3", correctButtonText: "Hello", distractorButtonTexts: ["Sorry", "See you again"], distractorAudioFiles: ["Q1_distractor-1.mp3", "Q1_distractor-2.mp3"] },
  { index: 2, correctAudioFile: "Q2_correct_answer.mp3", correctButtonText: "How much?", distractorButtonTexts: ["Can I pay by card?", "Book one night"], distractorAudioFiles: ["Q2_distractor-1.mp3", "Q2_distractor-2.mp3"] },
  { index: 3, correctAudioFile: "Q3_correct_answer.mp3", correctButtonText: "I don't understand", distractorButtonTexts: ["Help!", "Sorry"], distractorAudioFiles: ["Q3_distractor-1.mp3", "Q3_distractor-2.mp3"] },
  { index: 4, correctAudioFile: "Q4_correct_answer.mp3", correctButtonText: "What time is it?", distractorButtonTexts: ["See you tomorrow", "See you again"], distractorAudioFiles: ["Q4_distractor-1.mp3", "Q4_distractor-2.mp3"] },
  { index: 5, correctAudioFile: "Q5_correct_answer.mp3", correctButtonText: "I'll take one iced coffee", distractorButtonTexts: ["I'll take this one", "This is very delicious!"], distractorAudioFiles: ["Q5_distractor-1.mp3", "Q5_distractor-2.mp3"] },
  { index: 6, correctAudioFile: "Q6_correct_answer.mp3", correctButtonText: "I like watching movies", distractorButtonTexts: ["I don't like traffic", "My name is Dtom"], distractorAudioFiles: ["Q6_distractor-1.mp3", "Q6_distractor-2.mp3"] },
  { index: 7, correctAudioFile: "Q7_correct_answer.mp3", correctButtonText: "This is very delicious!", distractorButtonTexts: ["It's very hot today", "Thailand is beautiful"], distractorAudioFiles: ["Q7_distractor-1.mp3", "Q7_distractor-2.mp3"] },
  { index: 8, correctAudioFile: "Q8_correct_answer.mp3", correctButtonText: "Sorry", distractorButtonTexts: ["I don't understand", "Help!"], distractorAudioFiles: ["Q8_distractor-1.mp3", "Q8_distractor-2.mp3"] },
  { index: 9, correctAudioFile: "Q9_correct_answer.mp3", correctButtonText: "I have a headache", distractorButtonTexts: ["I have a stomach ache", "I feel feverish"], distractorAudioFiles: ["Q9_distractor-1.mp3", "Q9_distractor-2.mp3"] },
  { index: 10, correctAudioFile: "Q10_correct_answer.mp3", correctButtonText: "Thank you very much", distractorButtonTexts: ["Hello", "Sorry"], distractorAudioFiles: ["Q10_distractor-1.mp3", "Q10_distractor-2.mp3"] },
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
