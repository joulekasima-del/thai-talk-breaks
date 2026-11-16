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
  "And if you'd like to put your Thai into practice, join our <b>Thai Talk: Jot It Down</b> community. Every few days, Joule Kasima — the course's creator — shares a new little exercise to practise everyday Thai, improve your sentences, and grow together with others.\n" +
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

// --- Instant-lessons onboarding (proposed 15 November 2026) — DRAFT, not locked ---
// Replaces the long welcome + schedule-first flow with: name -> krap/ka ->
// four one-tap survey questions -> Lesson 1 straight away -> reminder time.
// Plain text only (no parse_mode), so a typed name can never break
// formatting. The long WELCOME_MESSAGE above is no longer sent; its /oops
// line, free-lessons note and community link moved into
// readyMessage() below. Needs Joule's confirmation before locking.

export const LEAN_WELCOME_MESSAGE =
  "Sawasdee ka! 🙏 Welcome to Thai Talk Breaks.\n" +
  "\n" +
  "Spoken Thai in tiny breaks — your first word is less than a minute away.\n" +
  "\n" +
  "First, what should I call you? Just type your name 👇";

export function nameKeyboard(firstName: string | undefined): InlineKeyboard | undefined {
  const name = cleanName(firstName ?? "");
  if (!name) return undefined;
  return [[{ text: `Call me ${name}`, callback_data: "name:tg" }]];
}

/** Trims, collapses whitespace, caps at 40 characters. Empty string = not a usable name. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 40).trim();
}

export function niceToMeetYou(name: string): string {
  return `Nice to meet you, ${name}! 😊`;
}

export interface SurveyQuestion {
  step: "survey_location_pending" | "survey_level_pending" | "survey_reason_pending" | "survey_source_pending";
  column: "survey_location" | "survey_level" | "survey_reason" | "survey_source";
  prefix: string; // callback_data prefix
  text: string;
  options: { value: string; label: string }[];
}

export const SURVEY_INTRO = "4 quick taps so I can get to know you (it really helps us too 🙏)";

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    step: "survey_location_pending",
    column: "survey_location",
    prefix: "loc",
    text: "1/4 · Are you in Thailand?",
    options: [
      { value: "live", label: "🏠 I live here" },
      { value: "visiting", label: "✈️ Visiting soon" },
      { value: "someday", label: "🗓️ Planning someday" },
      { value: "curious", label: "🌍 Just curious" },
    ],
  },
  {
    step: "survey_level_pending",
    column: "survey_level",
    prefix: "lvl",
    text: "2/4 · How much Thai do you know?",
    options: [
      { value: "beginner", label: "🌱 Total beginner" },
      { value: "few", label: "🙂 A few words" },
      { value: "basic", label: "💬 Basic chats" },
    ],
  },
  {
    step: "survey_reason_pending",
    column: "survey_reason",
    prefix: "why",
    text: "3/4 · What's your main reason for learning?",
    options: [
      { value: "daily", label: "🏡 Daily life" },
      { value: "travel", label: "🧳 Travel" },
      { value: "family", label: "❤️ Partner or family" },
      { value: "work", label: "💼 Work" },
    ],
  },
  {
    step: "survey_source_pending",
    column: "survey_source",
    prefix: "src",
    text: "4/4 · How did you find us?",
    options: [
      { value: "telegram", label: "💬 Telegram group" },
      { value: "friend", label: "👋 A friend" },
      { value: "social", label: "📱 Social media" },
      { value: "other", label: "✨ Other" },
    ],
  },
];

export function surveyKeyboard(question: SurveyQuestion): InlineKeyboard {
  // Two buttons per row keeps four options compact on a phone.
  const buttons = question.options.map((o) => ({ text: o.label, callback_data: `${question.prefix}:${o.value}` }));
  const rows: InlineKeyboard = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

export function firstWordMessage(name: string | null): string {
  return name ? `Perfect, ${name}! Here's your first Thai word 👇` : "Perfect! Here's your first Thai word 👇";
}

// Asked after Lesson 1. Same buttons/times as LDTKB-034, reworded: the time
// is now a daily reminder, not the only way to get a lesson.
export const REMINDER_PERIOD_MESSAGE =
  "One last thing: when should I send your daily Thai break? (Thailand time 🇹🇭)";

export const REMINDER_NOTIFICATION_TEST_MESSAGE =
  "🔔 This is what your daily reminder will look like.\n" +
  "\n" +
  "If you saw or heard this, you're all set.\n" +
  "\n" +
  "If you didn't notice anything, check that notifications are turned on for Telegram in your phone settings.";

export function readyMessage(name: string | null): string {
  return (
    `That's it, you're all set${name ? `, ${name}` : ""}! 🎉\n` +
    "\n" +
    "Your first 7 lessons are free, and you never have to wait — tap below whenever you want the next one.\n" +
    "\n" +
    "If something ever looks wrong, type /oops.\n" +
    "Want to practise with others? Join Thai Talk: Jot It Down 👉 https://t.me/thaitalk_jot_it_down"
  );
}

export const ALREADY_ONBOARDED_NEXT_MESSAGE =
  "You're all set already! 😊\n" +
  "\n" +
  "Tap below for your next lesson, or wait for your daily reminder.";
