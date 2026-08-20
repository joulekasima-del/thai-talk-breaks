import { createTelegramClient } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { supabaseDeliveryStore } from "@/lib/delivery/deliveryStore";
import { findDueLearners, bangkokNow } from "@/lib/delivery/dueLearners";
import { deliverLesson, type MediaLoader } from "@/lib/delivery/deliverLesson";
import {
  loadNumberAudio,
  loadNumberImage,
  loadPhraseLessonAudio,
  loadPhraseLessonImage,
  loadRepresentativeClip,
} from "@/lib/curriculum/mediaFiles";

// pg_cron -> pg_net delivery endpoint. See SCHEDULER.md for the cron
// schedule/window rationale. No lesson-authoring or scheduling *decisions*
// live here beyond what dueLearners.ts / deliverLesson.ts already encode —
// this route is just wiring: auth, fetch due learners, deliver, report.

const LOOKBACK_MINUTES = 30; // see SCHEDULER.md "Cron interval and window"

const media: MediaLoader = {
  loadPhraseLessonAudio,
  loadPhraseLessonImage,
  loadNumberAudio,
  loadNumberImage,
  loadRepresentativeClip,
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

  const telegram = createTelegramClient(botToken);
  const supabase = createSupabaseServerClient();
  const learnerStore = supabaseLearnerStore(supabase);
  const deliveryStore = supabaseDeliveryStore(supabase);

  const now = new Date();
  const { calendarDate } = bangkokNow(now);

  // idx_learners_due_for_delivery (Checkpoint 1) covers this query.
  const onboarded = await learnerStore.listOnboarded();

  // Learners with a null pilot_start_date are excluded here structurally,
  // not by a special case: OnboardedLearner requires pilot_start_date to be
  // a string, so a null-pilot_start_date row simply fails this filter and
  // never reaches findDueLearners. In practice this shouldn't happen —
  // pilot_start_date is always set in the same write that sets
  // onboarding_step = 'complete' (handleUpdate.ts) — but a learner mid
  // onboarding is also excluded already, since listOnboarded() only returns
  // onboarding_step = 'complete' rows.
  const eligible = onboarded.filter(
    (l): l is typeof l & { gender_branch: NonNullable<typeof l.gender_branch>; schedule_time: string; pilot_start_date: string } =>
      l.gender_branch !== null && l.schedule_time !== null && l.pilot_start_date !== null,
  );

  const due = findDueLearners(eligible, { now, lookbackMinutes: LOOKBACK_MINUTES });

  const results: { telegramUserId: number; lessonNumber: number; status: string }[] = [];

  for (const { learner, lessonNumber } of due) {
    try {
      const previouslyDelivered = await deliveryStore.listDeliveredLessonNumbers(learner.id);

      const result = await deliverLesson(
        {
          learnerId: learner.id,
          chatId: learner.telegram_user_id,
          gender: learner.gender_branch,
          lessonNumber,
          deliveryDate: calendarDate,
          previouslyDeliveredLessonNumbers: previouslyDelivered,
        },
        { telegram, deliveryStore, media, now: () => now },
      );
      results.push({ telegramUserId: learner.telegram_user_id, lessonNumber, status: result.status });
    } catch (error) {
      console.error(`Delivery failed for learner ${learner.id}, lesson ${lessonNumber}`, error);
      results.push({ telegramUserId: learner.telegram_user_id, lessonNumber, status: "error" });
    }
  }

  return Response.json({ checked: eligible.length, due: due.length, results });
}
