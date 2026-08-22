import { createTelegramClient } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { supabaseDeliveryStore } from "@/lib/delivery/deliveryStore";
import { findDueLearners, bangkokNow, DAY_WINDOW_MAX_DAY } from "@/lib/delivery/dueLearners";
import { deliverLesson, type MediaLoader } from "@/lib/delivery/deliverLesson";
import { supabaseDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { startDay30Quiz } from "@/lib/quiz/day30Quiz";
import { PILOT_LESSON_COUNT } from "@/lib/curriculum/content";
import {
  loadNumberAudio,
  loadNumberImage,
  loadPhraseLessonAudio,
  loadPhraseLessonImage,
  loadRepresentativeClip,
} from "@/lib/curriculum/mediaFiles";

// pg_cron -> pg_net delivery endpoint. See SCHEDULER.md (Checkpoints 1-3)
// and CHECKPOINT4.md (Day 30 quiz-ladder, testing day-window) for the
// schedule/window rationale. No lesson-authoring or scheduling *decisions*
// live here beyond what dueLearners.ts / deliverLesson.ts / day30Quiz.ts
// already encode — this route is just wiring: auth, fetch due learners,
// dispatch, report.

const LOOKBACK_MINUTES = 30; // see SCHEDULER.md "Cron interval and window"

// Day-number 30 = the fixed slot for the quiz-ladder. Days
// PILOT_LESSON_COUNT+1 through 29 have no content yet (Weeks 2-4 activities
// are Checkpoint 5; Day 29's living comic is separate, unbuilt scope) and
// must be skipped gracefully, not crash — see CHECKPOINT4.md.
const DAY30_QUIZ_DAY_NUMBER = 30;

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
  const quizStore = supabaseDay30QuizStore(supabase);

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

  // maxDay is DAY_WINDOW_MAX_DAY (7 in production; 30 only when
  // TESTING_EXTENDED_WINDOW=true — see dueLearners.ts). `lessonNumber` here
  // is really "day-number due" — only values 1..PILOT_LESSON_COUNT map to
  // an actual lesson; see the branch below.
  const due = findDueLearners(eligible, { now, lookbackMinutes: LOOKBACK_MINUTES, maxDay: DAY_WINDOW_MAX_DAY });

  const results: { telegramUserId: number; dayNumber: number; status: string }[] = [];

  for (const { learner, lessonNumber: dayNumber } of due) {
    try {
      if (dayNumber >= 1 && dayNumber <= PILOT_LESSON_COUNT) {
        const previouslyDelivered = await deliveryStore.listDeliveredLessonNumbers(learner.id);
        const result = await deliverLesson(
          {
            learnerId: learner.id,
            chatId: learner.telegram_user_id,
            gender: learner.gender_branch,
            lessonNumber: dayNumber,
            deliveryDate: calendarDate,
            previouslyDeliveredLessonNumbers: previouslyDelivered,
          },
          { telegram, deliveryStore, media, now: () => now },
        );
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: result.status });
      } else if (dayNumber === DAY30_QUIZ_DAY_NUMBER) {
        await startDay30Quiz(learner.id, learner.telegram_user_id, { telegram, learnerStore, quizStore, now: () => now });
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "day30_quiz_started_or_already_in_progress" });
      } else {
        // Days PILOT_LESSON_COUNT+1..29: no content yet (Checkpoint 5 /
        // Day 29 living comic, both unbuilt). Graceful no-op, per LDTKB-044's
        // "must not crash" requirement — only reachable at all under the
        // testing-only extended window.
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "skipped_no_content_yet" });
      }
    } catch (error) {
      console.error(`Delivery failed for learner ${learner.id}, day ${dayNumber}`, error);
      results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "error" });
    }
  }

  return Response.json({ checked: eligible.length, due: due.length, results });
}
