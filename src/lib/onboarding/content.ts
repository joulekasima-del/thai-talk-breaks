// Locked onboarding copy — sourced verbatim from onboarding/*.md.
//
// Do not edit text, spacing, or emoji here without updating the
// corresponding onboarding/*.md file and its LDTKB-### entry first. These
// constants ARE the implementation of that locked copy — this file has no
// authority of its own (see AGENTS.md authority order).
//
// Trailing spaces below are intentional and were confirmed against the
// source markdown byte-for-byte (see Checkpoint 2 report) — do not let an
// editor "clean up" them.

import type { InlineKeyboard } from "@/lib/telegram";

// onboarding/welcome-message.md (LDTKB-031, superseded by LDTKB-050,
// formatting fixed and content revised LDTKB-053/054). The only message in
// the product sent with parse_mode "HTML" — see handleUpdate.ts's one
// sendMessage call for WELCOME_MESSAGE, and telegram.ts's sendMessage
// signature. Every other message stays plain text.
export const WELCOME_MESSAGE =
  "Sawasdee ka! 🙏 \n" +
  "\n" +
  "Welcome to <b>Thai Talk Breaks</b>.\n" +
  "\n" +
  "We're happy to have you here. 🌿\n" +
  "\n" +
  "Thai Talk Breaks is a <b><i>30-day conversational Thai course</i></b> designed to help you build useful Thai little by little — without overwhelming study sessions.\n" +
  "\n" +
  "<i>Your first 7 days are free.</i>\n" +
  "\n" +
  "Each daily break is short and practical:\n" +
  "🖼️ one picture\n" +
  "💬 one useful Thai phrase\n" +
  "🔊 clear native Thai pronunciation\n" +
  "✨ explanation for daily use\n" +
  "\n" +
  "No Thai script required. We'll focus first on Thai you can understand, say, and use in everyday life.\n" +
  "\n" +
  "<i>If something ever seems confusing or doesn't work properly, just type <b>/oops</b> anytime. We'll take a look.</i>\n" +
  "\n" +
  "\n" +
  "And if you'd like to put your Thai into practice, join our <b>Thai Talk: Jot It Down</b> community. Every Saturday morning, <i>Chaa-yen</i> brings you a new little exercise to practise everyday Thai, improve your sentences, and learn together with the community.\n" +
  "👉 https://t.me/thaitalk_jot_it_down\n" +
  "\n" +
  "That's it. No preparation needed.\n" +
  "\n" +
  "Ready to begin?";

// onboarding/gender-question.md (LDTKB-033)
export const GENDER_QUESTION_MESSAGE =
  "Quick thing before we start!\n" +
  "\n" +
  "Thai has two polite word-endings depending on who's speaking — krap for a male voice, ka for a female voice.\n" +
  "\n" +
  "Which one should I use for you?";

export const GENDER_QUESTION_KEYBOARD: InlineKeyboard = [
  [
    { text: "Male (krap)", callback_data: "gender:male" },
    { text: "Female (ka)", callback_data: "gender:female" },
  ],
];

// onboarding/schedule-selection.md step 1 (LDTKB-034)
export const SCHEDULE_PERIOD_MESSAGE =
  "What time works best for your daily lesson? (Thailand time 🇹🇭)";

export const SCHEDULE_PERIOD_KEYBOARD: InlineKeyboard = [
  [
    { text: "🌅 Morning", callback_data: "period:morning" },
    { text: "☀️ Afternoon", callback_data: "period:afternoon" },
    { text: "🌙 Evening", callback_data: "period:evening" },
  ],
];

// onboarding/schedule-selection.md step 2 (LDTKB-034)
export const SCHEDULE_TIME_MESSAGE = "Pick your time:";

const SCHEDULE_TIME_OPTIONS: Record<"morning" | "afternoon" | "evening", string[]> = {
  morning: ["08:00", "09:00", "10:00", "11:00"],
  afternoon: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
  evening: ["18:00", "19:00", "20:00", "21:00"],
};

export function scheduleTimeKeyboard(period: "morning" | "afternoon" | "evening"): InlineKeyboard {
  return [
    SCHEDULE_TIME_OPTIONS[period].map((time) => ({
      text: time,
      callback_data: `time:${time}`,
    })),
  ];
}

export function isValidTimeForPeriod(period: "morning" | "afternoon" | "evening", time: string): boolean {
  return SCHEDULE_TIME_OPTIONS[period].includes(time);
}

// onboarding/notification-test.md (LDTKB-035)
export const NOTIFICATION_TEST_MESSAGE =
  "🔔 This is what your lesson notifications will look like.\n" +
  "\n" +
  "If you saw or heard this, you're all set — your first lesson arrives at your chosen time.\n" +
  "\n" +
  "If you didn't notice anything, check that notifications are turned on for Telegram in your phone settings.";

// onboarding/onboarding-complete.md (LDTKB-036)
export const ONBOARDING_COMPLETE_MESSAGE =
  "That's it, you're all set! 🎉\n" +
  "\n" +
  "Your first lesson arrives at your chosen time.\n" +
  "\n" +
  "See you soon!";

// --- Not locked copy — implementation-level design choices, see Checkpoint 2 ---
// report item 9 for why these exist and why they're flagged for Joule's review.
// Written in the same fixed-female narrator voice (LDTKB-030) for consistency,
// but the exact wording is NOT covered by any LDTKB-### entry.

export const ALREADY_ONBOARDED_MESSAGE =
  "You're all set already! 😊\n" +
  "\n" +
  "No need to go through this again — your lessons are on their way at your chosen time.";
