import { createTelegramClient, type TelegramUpdate } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { handleUpdate } from "@/lib/onboarding/handleUpdate";

// Telegram webhook endpoint. Verifies the shared secret, then delegates all
// onboarding logic to handleUpdate() (src/lib/onboarding/handleUpdate.ts).
// No lesson-delivery or scheduling logic lives here — that's Checkpoint 3.

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

  const telegram = createTelegramClient(botToken);
  const store = supabaseLearnerStore(createSupabaseServerClient());

  try {
    await handleUpdate(update, { store, telegram });
  } catch (error) {
    console.error("Webhook handling failed", error);
    // Non-2xx so Telegram retries delivery rather than silently dropping it.
    return new Response("Internal error", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
