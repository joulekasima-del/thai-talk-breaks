import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { supabaseDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { validateTelegramInitData } from "@/lib/day29/telegramInitData";
import { getDay30QuizStatus, submitDay30QuizAnswer } from "@/lib/quiz/day30QuizApi";
import type { OptionKind } from "@/lib/quiz/day30Quiz";

// GET  ?initData=<raw Telegram Web App initData> -> current quiz state
//   (resumes an in-progress quiz, or reports the completed score/badge).
// POST { initData, questionIndex, kind } -> submit the tapped option
//   ("c"/"d1"/"d2") for the current question; returns updated state.
//
// initData is validated server-side (HMAC against TELEGRAM_BOT_TOKEN, per
// telegramInitData.ts) before either handler trusts the telegram user id it
// carries — same pattern as /api/day29/quest-status and /api/lesson/[day].

export async function GET(request: Request): Promise<Response> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return new Response("Server misconfigured", { status: 500 });

  const { searchParams } = new URL(request.url);
  const validated = validateTelegramInitData(searchParams.get("initData") ?? "", botToken);
  if (!validated) return new Response("Unauthorized", { status: 401 });

  const supabase = createSupabaseServerClient();
  const result = await getDay30QuizStatus(validated.telegramUserId, {
    learnerStore: supabaseLearnerStore(supabase),
    quizStore: supabaseDay30QuizStore(supabase),
  });

  if (!result.ok) {
    if (result.error === "learner_not_found") return new Response("Learner not found", { status: 404 });
    // "quiz_not_started": the learner hasn't reached Day 30 yet (or the
    // cron tick that starts it hasn't run) — don't let a guessed URL
    // surface anything early.
    return new Response("Quiz not started", { status: 403 });
  }

  return Response.json({ state: result.state });
}

function isOptionKind(value: unknown): value is OptionKind {
  return value === "c" || value === "d1" || value === "d2";
}

export async function POST(request: Request): Promise<Response> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return new Response("Server misconfigured", { status: 500 });

  let body: { initData?: string; questionIndex?: number; kind?: string };
  try {
    body = (await request.json()) as { initData?: string; questionIndex?: number; kind?: string };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const validated = validateTelegramInitData(body.initData ?? "", botToken);
  if (!validated) return new Response("Unauthorized", { status: 401 });

  if (typeof body.questionIndex !== "number" || !isOptionKind(body.kind)) {
    return new Response("Missing/invalid questionIndex or kind", { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const result = await submitDay30QuizAnswer(validated.telegramUserId, body.questionIndex, body.kind, {
    learnerStore: supabaseLearnerStore(supabase),
    quizStore: supabaseDay30QuizStore(supabase),
  });

  if (!result.ok) {
    if (result.error === "learner_not_found") return new Response("Learner not found", { status: 404 });
    if (result.error === "quiz_not_started") return new Response("Quiz not started", { status: 403 });
    // "stale_answer": out-of-order/replayed tap, or the quiz is already
    // completed — 409 so the page knows to re-fetch (GET) and resume from
    // whatever the DB actually has, rather than trusting its own local state.
    return new Response("Stale answer", { status: 409 });
  }

  return Response.json({ correct: result.correct, feedbackMessage: result.feedbackMessage, state: result.state });
}
