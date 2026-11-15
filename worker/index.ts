// Cloudflare Worker entry: the same API routes that used to run on Vercel, plus
// the every-minute delivery trigger that used to be pg_cron + pg_net inside
// Supabase, plus the static pages / lesson media served from the assets binding.
//
//   POST /api/webhook            Telegram updates
//   POST /api/cron/deliver       manual trigger (x-cron-secret), same code as the cron
//   GET|POST /api/day29/quest-status, /api/day30-quiz, GET /api/lesson/<day>
//   everything else              static files from ./out (see scripts/buildWorkerAssets.mjs)
//
// Secrets and variables (wrangler secret put ... / wrangler.jsonc vars) show up
// on process.env thanks to the nodejs_compat flag, so the route modules are
// reused unchanged. See SCHEDULER.md.

import { setMediaReader } from "@/lib/curriculum/mediaFiles";
import { createDbQuery, type Query } from "@/lib/db";
import { createTelegramClient, type TelegramClient } from "@/lib/telegram";
import { runDeliveryCron } from "@/lib/delivery/runDeliveryCron";
import { fileIdCacheForBot } from "@/lib/telegramFileIdStore";
import type { MediaLoader } from "@/lib/delivery/deliverLesson";
import {
  loadCombinedNumbersImage,
  loadPhraseLessonImage,
  loadRepresentativeClip,
  loadWordSetImage,
} from "@/lib/curriculum/mediaFiles";
import * as webhook from "@/app/api/webhook/route";
import * as cronRoute from "@/app/api/cron/deliver/route";
import * as quest from "@/app/api/day29/quest-status/route";
import * as quiz from "@/app/api/day30-quiz/route";
import * as lesson from "@/app/api/lesson/[day]/route";

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
interface Env {
  ASSETS: Fetcher;
}
interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

// Cloudflare's free plan: 50 outgoing requests (database, Telegram, assets) per
// invocation. A single delivery uses roughly 8-10, so the run stops taking new
// learners once this many are spent and the next minute's run continues.
const SPEND_LIMIT_BEFORE_STOPPING = 36;

function installMediaReader(env: Env, onRead?: () => void): void {
  setMediaReader(async (relativePath) => {
    onRead?.();
    const response = await env.ASSETS.fetch(new Request(`https://assets.invalid/media/${relativePath}`));
    if (!response.ok) throw new Error(`Media file not found in assets: ${relativePath} (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  });
}

function countingQuery(query: Query, spend: () => void): Query {
  return (text, params) => {
    spend();
    return query(text, params);
  };
}

function countingTelegram(telegram: TelegramClient, spend: () => void): TelegramClient {
  return new Proxy(telegram, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        spend();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

const media: MediaLoader = {
  loadPhraseLessonImage,
  loadCombinedNumbersImage,
  loadRepresentativeClip,
  loadWordSetImage,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    installMediaReader(env);
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === "/api/webhook" && method === "POST") return webhook.POST(request);
    if (pathname === "/api/cron/deliver" && method === "POST") return cronRoute.POST(request);
    if (pathname === "/api/day29/quest-status") {
      if (method === "GET") return quest.GET(request);
      if (method === "POST") return quest.POST(request);
    }
    if (pathname === "/api/day30-quiz") {
      if (method === "GET") return quiz.GET(request);
      if (method === "POST") return quiz.POST(request);
    }
    const lessonMatch = pathname.match(/^\/api\/lesson\/([^/]+)$/);
    if (lessonMatch && method === "GET") {
      return lesson.GET(request, { params: Promise.resolve({ day: lessonMatch[1] }) });
    }
    if (pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

    return env.ASSETS.fetch(request);
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN must be set");

    let spent = 0;
    const spend = () => {
      spent += 1;
    };
    installMediaReader(env, spend);

    // Cache lookups/writes go through the counted query too, so they stay inside the spend budget.
    const query = countingQuery(createDbQuery(), spend);
    const result = await runDeliveryCron({
      telegram: countingTelegram(createTelegramClient(botToken, { fileIdCache: fileIdCacheForBot(query, botToken) }), spend),
      query,
      media,
      appUrl: process.env.APP_URL,
      now: new Date(controller.scheduledTime),
      shouldStop: () => spent >= SPEND_LIMIT_BEFORE_STOPPING,
    });

    console.log(JSON.stringify({ cron: controller.cron, spentRequests: spent, ...result }));
  },
};
