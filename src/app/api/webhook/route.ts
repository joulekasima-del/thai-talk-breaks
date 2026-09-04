import { createTelegramClient, type TelegramUpdate } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import { supabaseProcessedUpdatesStore } from "@/lib/webhook/processedUpdatesStore";
import { dedupeAndProcess } from "@/lib/webhook/dedupeAndProcess";
import { supabaseOopsReportsStore } from "@/lib/oops/oopsReportsStore";
import { supabasePurchasesStore } from "@/lib/payments/purchasesStore";
import { supabasePaymentSupportStore } from "@/lib/payments/paymentSupportStore";

// Telegram webhook endpoint. Verifies the shared secret, dedups on
// update_id (hotfix — Telegram retries delivery of the same update if it
// doesn't get a timely 200 OK; see processedUpdatesStore.ts), then routes
// everything to handleUpdate() (onboarding, Checkpoint 2 — untouched).
// The "quiz:*" callback route (Day 30's native quiz-ladder progression,
// Checkpoint 4) was removed along with the feature itself — Day 30 is now a
// single continuous Web App page (src/app/day30-quiz/), same as the
// "activity:*" callback route (Lessons 2-28's recognition-tap responses)
// was removed earlier — see lib/delivery/deliverLesson.ts. No lesson-DELIVERY
// or scheduling logic lives here — that's the cron route (Checkpoint 3/4).

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
  const oopsReportsStore = supabaseOopsReportsStore(supabase);
  const purchasesStore = supabasePurchasesStore(supabase);
  const paymentSupportStore = supabasePaymentSupportStore(supabase);

  // Missing/unset -> null: /oops reports are still saved, the admin DM is
  // just skipped (see handleUpdate.ts's maybeCaptureOopsReport).
  const adminTelegramUserIdRaw = process.env.ADMIN_TELEGRAM_USER_ID;
  const parsedAdminTelegramUserId = adminTelegramUserIdRaw ? Number(adminTelegramUserIdRaw) : NaN;
  const adminTelegramUserId = Number.isFinite(parsedAdminTelegramUserId) ? parsedAdminTelegramUserId : null;

  try {
    // Dedup guard — dedupeAndProcess() marks update_id processed BEFORE
    // running the closure below, and never runs the closure at all for an
    // update_id already marked processed (a Telegram retry of an update
    // this route already handled, typically from a slow/cold-start
    // response). Either way this route still returns 200 OK, so Telegram
    // stops retrying.
    await dedupeAndProcess(update.update_id, processedUpdatesStore, async () => {
      await handleUpdate(update, { store, telegram, oopsReportsStore, purchasesStore, paymentSupportStore, adminTelegramUserId });
    });
  } catch (error) {
    console.error("Webhook handling failed", error);
    // Non-2xx so Telegram retries delivery rather than silently dropping it.
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
