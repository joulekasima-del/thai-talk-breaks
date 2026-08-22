import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { supabaseDay29QuestStore } from "@/lib/day29/questStore";
import { validateTelegramInitData } from "@/lib/day29/telegramInitData";
import { getQuestStatus, submitQuestAnswer } from "@/lib/day29/questApi";

// GET  ?initData=<raw Telegram Web App initData> -> current Surprise Quest state
// POST { initData, answerId } -> submit an answer (unlimited wrong attempts, locks on correct)
//
// initData is validated server-side (HMAC against TELEGRAM_BOT_TOKEN, per
// telegramInitData.ts) before either handler trusts the telegram user id it
// carries — per LDTKB-049, this must not be a bare client-supplied id.

export async function GET(request: Request): Promise<Response> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return new Response("Server misconfigured", { status: 500 });

  const { searchParams } = new URL(request.url);
  const validated = validateTelegramInitData(searchParams.get("initData") ?? "", botToken);
  if (!validated) return new Response("Unauthorized", { status: 401 });

  const supabase = createSupabaseServerClient();
  const result = await getQuestStatus(validated.telegramUserId, {
    learnerStore: supabaseLearnerStore(supabase),
    questStore: supabaseDay29QuestStore(supabase),
  });

  if (!result.ok) return new Response("Learner not found", { status: 404 });
  return Response.json({ answeredCorrectly: result.answeredCorrectly, answeredCorrectlyAt: result.answeredCorrectlyAt });
}

export async function POST(request: Request): Promise<Response> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return new Response("Server misconfigured", { status: 500 });

  let body: { initData?: string; answerId?: string };
  try {
    body = (await request.json()) as { initData?: string; answerId?: string };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const validated = validateTelegramInitData(body.initData ?? "", botToken);
  if (!validated) return new Response("Unauthorized", { status: 401 });
  if (!body.answerId) return new Response("Missing answerId", { status: 400 });

  const supabase = createSupabaseServerClient();
  const result = await submitQuestAnswer(validated.telegramUserId, body.answerId, {
    learnerStore: supabaseLearnerStore(supabase),
    questStore: supabaseDay29QuestStore(supabase),
  });

  if (!result.ok) return new Response("Learner not found", { status: 404 });
  return Response.json(result.correct ? { correct: true, alreadyAnswered: result.alreadyAnswered } : { correct: false });
}
