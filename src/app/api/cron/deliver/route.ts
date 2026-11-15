import { createTelegramClient } from "@/lib/telegram";
import { createDbQuery } from "@/lib/db";
import { fileIdCacheForBot } from "@/lib/telegramFileIdStore";
import { runDeliveryCron } from "@/lib/delivery/runDeliveryCron";
import type { MediaLoader } from "@/lib/delivery/deliverLesson";
import {
  loadCombinedNumbersImage,
  loadPhraseLessonImage,
  loadRepresentativeClip,
  loadWordSetImage,
} from "@/lib/curriculum/mediaFiles";

// Manual / external trigger for the delivery run (header x-cron-secret). The
// scheduled run on Cloudflare calls runDeliveryCron() directly from
// worker/index.ts instead. See SCHEDULER.md.

const media: MediaLoader = {
  loadPhraseLessonImage,
  loadCombinedNumbersImage,
  loadRepresentativeClip,
  loadWordSetImage,
};

export async function POST(request: Request): Promise<Response> {
  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = request.headers.get("x-cron-secret");
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const query = createDbQuery();
  const result = await runDeliveryCron({
    telegram: createTelegramClient(botToken, { fileIdCache: fileIdCacheForBot(query, botToken) }),
    query,
    media,
    appUrl: process.env.APP_URL,
    now: new Date(),
  });
  return Response.json(result);
}
