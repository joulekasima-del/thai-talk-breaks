// Session copy (instant-lessons redesign) — DRAFT, not locked. Needs Joule's
// confirmation before it becomes an LDTKB entry. Plain text only (no
// parse_mode), so a learner's typed name can never break formatting.

import type { InlineKeyboard } from "@/lib/telegram";

export const NEXT_LESSON_KEYBOARD: InlineKeyboard = [[{ text: "▶️ Next lesson", callback_data: "next:1" }]];
export const REVIEW_KEYBOARD: InlineKeyboard = [[{ text: "🔁 Review now", callback_data: "next:1" }]];

export function reminderGreeting(name: string | null): string {
  return name ? `⏰ Time for your Thai break, ${name}!` : "⏰ Time for your Thai break!";
}

export function reviewIntro(count: number): string {
  return count === 1 ? "🔁 Quick warm-up — 1 word from before:" : `🔁 Quick warm-up — ${count} words from before:`;
}

export const NEW_LESSON_QUIZ_INTRO = "Quick check 👇";

export function lessonDoneMessage(lessonNumber: number, name: string | null, right: number, total: number, deckSize: number): string {
  const who = name ? `, ${name}` : "";
  const score = total > 0 ? ` ${right}/${total} right.` : "";
  const cheer = total > 0 && right === total ? " 🔥" : "";
  return `🎉 Lesson ${lessonNumber} done${who}!${score}${cheer}\n📚 ${deckSize} ${deckSize === 1 ? "word" : "words"} in your review deck.`;
}

export function reviewDoneMessage(right: number, total: number): string {
  return `✅ Review done! ${right}/${total} right.`;
}

export const COURSE_FINISHED_MESSAGE =
  "🏆 You've finished all 30 lessons! Your words keep coming back in your daily break, so they stay fresh.";

export const ALL_CAUGHT_UP_MESSAGE = "✨ All caught up — nothing to review right now. Come back tomorrow!";

export const ACTIVE_SESSION_NUDGE = "You're in the middle of a quick check — answer this one first 👇";

// Replaces PAYWALL_PROMPT_MESSAGE's "Days 8–30" now that lessons aren't tied to days.
export const LESSON_PAYWALL_MESSAGE =
  "That's your 7 free lessons done! 🎉 Ready to keep going? Send /buy to unlock Lessons 8–30.";
