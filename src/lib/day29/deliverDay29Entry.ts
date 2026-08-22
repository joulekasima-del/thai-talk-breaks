// Day 29's bot-side trigger — the Kiki-style buildup + a web_app button
// opening the living comic (curriculum/day29/day29-living-comic-spec.md,
// "Entry message sequence" / "Bot trigger sequence"). Deliberately NOT built
// on top of deliverLesson.ts's picture->text->audio->activity pipeline —
// Day 29 sends none of that; it sends this buildup instead, then hands off
// entirely to the Web App page for the actual content and audio.
//
// Uses lesson_deliveries with lesson_number = 29 as the duplicate-send
// guard, exactly like every other day (deliverLesson.ts's insertTextSent
// pattern) — reuses the existing DeliveryStore rather than a new table,
// since this is still fundamentally "was today's entry message sent yet."

import type { InlineKeyboard, TelegramClient } from "@/lib/telegram";
import type { DeliveryStore } from "@/lib/delivery/deliveryStore";

export const DAY29_LESSON_NUMBER = 29;

// Locked copy, day29-living-comic-spec.md "Entry message sequence" (confirmed
// 22 August 2026) — intentionally drops the usual "ka" narrator tic (LDTKB-030)
// for this quest-framing moment, per that section's note. Not gender-branched:
// the spec gives one single version, no male/female variant.
const MESSAGE_1 = "🗺️ *knock knock*";
const MESSAGE_2 = "Heyy! Remember everything you've learned this month?";
const MESSAGE_3 =
  "I put together something special — a little story, a little journey, a few surprises along the way...";
const BUTTON_TEXT = "🎁 Start the story";

export interface DeliverDay29EntryInput {
  learnerId: string;
  chatId: number;
  deliveryDate: string; // "YYYY-MM-DD", Thailand calendar date
}

export interface DeliverDay29EntryDeps {
  telegram: TelegramClient;
  deliveryStore: DeliveryStore;
  /** Public base URL of the deployed app (APP_URL) — the button opens `${appUrl}/day29`. */
  appUrl: string;
  now?: () => Date;
}

export type DeliverDay29EntryResult = { status: "delivered" } | { status: "already_delivered" };

export async function deliverDay29Entry(
  input: DeliverDay29EntryInput,
  deps: DeliverDay29EntryDeps,
): Promise<DeliverDay29EntryResult> {
  const now = deps.now ? deps.now() : new Date();

  const existing = await deps.deliveryStore.findExisting(input.learnerId, DAY29_LESSON_NUMBER, input.deliveryDate);
  if (existing) return { status: "already_delivered" };

  await deps.telegram.sendMessage(input.chatId, MESSAGE_1);
  await deps.telegram.sendMessage(input.chatId, MESSAGE_2);

  // Paired with its keyboard on the same message, matching this project's
  // existing convention (e.g. onboarding's question-text-plus-keyboard
  // messages) rather than sending the button on its own separate message.
  const keyboard: InlineKeyboard = [[{ text: BUTTON_TEXT, web_app: { url: `${deps.appUrl}/day29` } }]];
  await deps.telegram.sendMessage(input.chatId, MESSAGE_3, keyboard);

  // Guard point: no separate audio phase for Day 29's entry (all narration
  // happens inside the Web App), so this single insert is the whole guard —
  // unlike deliverLesson.ts, there's no markAudioSent to call afterward.
  await deps.deliveryStore.insertTextSent(input.learnerId, DAY29_LESSON_NUMBER, input.deliveryDate, now.toISOString());

  return { status: "delivered" };
}
