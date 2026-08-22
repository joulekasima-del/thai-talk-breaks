import { createTelegramClient, type TelegramUpdate } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import { supabaseDeliveryStore } from "@/lib/delivery/deliveryStore";
import { handleLessonActivityCallback } from "@/lib/activities/lessonActivity";
import { supabaseDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { handleDay30QuizCallback } from "@/lib/quiz/day30Quiz";
import { supabaseProcessedUpdatesStore } from "@/lib/webhook/processedUpdatesStore";
import { dedupeAndProcess } from "@/lib/webhook/dedupeAndProcess";

// Telegram webhook endpoint. Verifies the shared secret, dedups on
// update_id (hotfix — Telegram retries delivery of the same update if it
// doesn't get a timely 200 OK; see processedUpdatesStore.ts), then routes:
//   - "activity:*" callbacks -> lessonActivity.ts (Lessons 2-7's recognition-tap responses, Checkpoint 4)
//   - "quiz:*" callbacks     -> day30Quiz.ts (Day 30 quiz-ladder progression, Checkpoint 4)
//   - everything else        -> handleUpdate() (onboarding, Checkpoint 2 — untouched)
// No lesson-DELIVERY or scheduling logic lives here — that's the cron route (Checkpoint 3/4).

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return new Response("Server misconfigured", { status: 500 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const telegram = createTelegramClient(botToken);
  const store = supabaseLearnerStore(supabase);
  const processedUpdatesStore = supabaseProcessedUpdatesStore(supabase);

  try {
    // Dedup guard — dedupeAndProcess() marks update_id processed BEFORE
    // running the closure below, and never runs the closure at all for an
    // update_id already marked processed (a Telegram retry of an update
    // this route already handled, typically from a slow/cold-start
    // response). Either way this route still returns 200 OK, so Telegram
    // stops retrying.
    await dedupeAndProcess(update.update_id, processedUpdatesStore, async () => {
      const callbackData = update.callback_query?.data;
      if (callbackData?.startsWith("activity:")) {
        const deliveryStore = supabaseDeliveryStore(supabase);
        await handleLessonActivityCallback(update.callback_query!, callbackData, {
          telegram,
          learnerStore: store,
          deliveryStore,
        });
      } else if (callbackData?.startsWith("quiz:")) {
        const quizStore = supabaseDay30QuizStore(supabase);
        await handleDay30QuizCallback(update.callback_query!, callbackData, {
          telegram,
          learnerStore: store,
          quizStore,
        });
      } else {
        await handleUpdate(update, { store, telegram });
      }
    });
  } catch (error) {
    console.error("Webhook handling failed", error);
    // Non-2xx so Telegram retries delivery rather than silently dropping it.
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
