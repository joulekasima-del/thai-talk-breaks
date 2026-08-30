import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { supabaseDeliveryStore } from "@/lib/delivery/deliveryStore";
import { validateTelegramInitData } from "@/lib/day29/telegramInitData";
import { getLessonAudioContent } from "@/lib/lessonAudio/lessonAudioApi";

// GET ?initData=<raw Telegram Web App initData> -> this lesson's
// gender-branched content + public audio URL(s), for src/app/lesson/[day]/page.tsx.
//
// PROTOTYPE — scoped to exactly Lesson 3 and Day 8 (see deliverLesson.ts's
// WEB_APP_AUDIO_DAYS, the single source of truth this route defers to via
// getLessonAudioContent). initData is validated server-side (HMAC against
// TELEGRAM_BOT_TOKEN) before trusting the telegram user id it carries, same
// as Day 29's quest-status route.

export async function GET(request: Request, context: { params: Promise<{ day: string }> }): Promise<Response> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return new Response("Server misconfigured", { status: 500 });

  const { day: dayParam } = await context.params;
  const day = Number(dayParam);
  if (!Number.isInteger(day)) return new Response("Not found", { status: 404 });

  const { searchParams } = new URL(request.url);
  const validated = validateTelegramInitData(searchParams.get("initData") ?? "", botToken);
  if (!validated) return new Response("Unauthorized", { status: 401 });

  const supabase = createSupabaseServerClient();
  const result = await getLessonAudioContent(validated.telegramUserId, day, {
    learnerStore: supabaseLearnerStore(supabase),
    deliveryStore: supabaseDeliveryStore(supabase),
  });

  if (!result.ok) {
    if (result.error === "not_a_prototype_day") return new Response("Not found", { status: 404 });
    if (result.error === "learner_not_found") return new Response("Learner not found", { status: 404 });
    // "not_yet_delivered": this learner hasn't reached this day yet — don't
    // let a guessed URL surface tomorrow's content early.
    return new Response("Not yet delivered", { status: 403 });
  }

  return Response.json({ content: result.content });
}
