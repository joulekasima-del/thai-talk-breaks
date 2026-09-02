import { createTelegramClient } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore } from "@/lib/onboarding/learnerStore";
import { supabaseDeliveryStore } from "@/lib/delivery/deliveryStore";
import { findDueLearners, bangkokNow, DAY_WINDOW_MAX_DAY } from "@/lib/delivery/dueLearners";
import { deliverLesson, type MediaLoader } from "@/lib/delivery/deliverLesson";
import { supabaseDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { startDay30Quiz } from "@/lib/quiz/day30Quiz";
import { deliverDay29Entry, DAY29_LESSON_NUMBER } from "@/lib/day29/deliverDay29Entry";
import { WEEKS234_LAST_DAY } from "@/lib/curriculum/content";
import {
  loadCombinedNumbersAudio,
  loadCombinedNumbersImage,
  loadPhraseLessonAudio,
  loadPhraseLessonImage,
  loadRepresentativeClip,
  loadWordSetAudio,
  loadWordSetImage,
} from "@/lib/curriculum/mediaFiles";

// pg_cron -> pg_net delivery endpoint. See SCHEDULER.md (Checkpoints 1-3)
// and CHECKPOINT4.md (Day 30 quiz-ladder, testing day-window) for the
// schedule/window rationale. No lesson-authoring or scheduling *decisions*
// live here beyond what dueLearners.ts / deliverLesson.ts / day30Quiz.ts
// already encode — this route is just wiring: auth, fetch due learners,
// dispatch, report.

const LOOKBACK_MINUTES = 30; // see SCHEDULER.md "Cron interval and window"

// Day-number 30 = the fixed slot for the quiz-ladder. Day 29 = the living
// comic entry message + Web App button (Checkpoint 6) — DAY29_LESSON_NUMBER
// is imported from deliverDay29Entry.ts rather than redefined here.
const DAY30_QUIZ_DAY_NUMBER = 30;

const media: MediaLoader = {
  loadPhraseLessonAudio,
  loadPhraseLessonImage,
  loadCombinedNumbersAudio,
  loadCombinedNumbersImage,
  loadRepresentativeClip,
  loadWordSetAudio,
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
  // is really "day-number due" — only values 1..WEEKS234_LAST_DAY map to
  // an actual lesson; see the branch below.
  const due = findDueLearners(eligible, { now, lookbackMinutes: LOOKBACK_MINUTES, maxDay: DAY_WINDOW_MAX_DAY });

  const results: { telegramUserId: number; dayNumber: number; status: string }[] = [];

  for (const { learner, lessonNumber: dayNumber } of due) {
    try {
      if (dayNumber >= 1 && dayNumber <= WEEKS234_LAST_DAY) {
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
      } else if (dayNumber === DAY29_LESSON_NUMBER) {
        const appUrl = process.env.APP_URL;
        if (!appUrl) throw new Error("APP_URL must be set to deliver Day 29's living comic button");
        const result = await deliverDay29Entry(
          { learnerId: learner.id, chatId: learner.telegram_user_id, deliveryDate: calendarDate },
          { telegram, deliveryStore, appUrl, now: () => now },
        );
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: result.status });
      } else if (dayNumber === DAY30_QUIZ_DAY_NUMBER) {
        await startDay30Quiz(learner.id, learner.telegram_user_id, { telegram, learnerStore, quizStore, now: () => now });
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "day30_quiz_started_or_already_in_progress" });
      } else {
        // Defensive fallback only — every value findDueLearners can return
        // (1..DAY_WINDOW_MAX_DAY, capped at 30) is now handled by one of the
        // branches above. Kept per LDTKB-044's "must not crash" requirement.
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "skipped_unrecognized_day_number" });
      }
    } catch (error) {
      console.error(`Delivery failed for learner ${learner.id}, day ${dayNumber}`, error);
      results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "error" });
    }
  }

  return Response.json({ checked: eligible.length, due: due.length, results });
}
