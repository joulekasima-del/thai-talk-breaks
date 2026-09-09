import { createTelegramClient } from "@/lib/telegram";
import { createSupabaseServerClient } from "@/lib/supabase";
import { supabaseLearnerStore, type GenderBranch } from "@/lib/onboarding/learnerStore";
import { supabaseDeliveryStore } from "@/lib/delivery/deliveryStore";
import { supabasePurchasesStore } from "@/lib/payments/purchasesStore";
import { findDueLearners, bangkokNow, isWithinDeliveryWindow, DAY_WINDOW_MAX_DAY } from "@/lib/delivery/dueLearners";
import {
  findDuePaidLearners,
  decidePaywallGateAction,
  PAID_COURSE_FIRST_DAY,
  type PaidCourseLearner,
  type PaywallGateLearner,
} from "@/lib/delivery/duePaidLearners";
import { deliverLesson, type MediaLoader } from "@/lib/delivery/deliverLesson";
import { PAYWALL_PROMPT_MESSAGE } from "@/lib/payments/content";
import { supabaseDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { startDay30Quiz } from "@/lib/quiz/day30Quiz";
import { deliverDay29Entry, DAY29_LESSON_NUMBER } from "@/lib/day29/deliverDay29Entry";
import { WEEKS234_LAST_DAY } from "@/lib/curriculum/content";
import {
  loadCombinedNumbersImage,
  loadPhraseLessonImage,
  loadRepresentativeClip,
  loadWordSetImage,
} from "@/lib/curriculum/mediaFiles";

// pg_cron -> pg_net delivery endpoint. See SCHEDULER.md (Checkpoints 1-3)
// and CHECKPOINT4.md (Day 30 quiz-ladder, testing day-window) for the
// schedule/window rationale. No lesson-authoring or scheduling *decisions*
// live here beyond what dueLearners.ts / duePaidLearners.ts /
// deliverLesson.ts / day30Quiz.ts already encode — this route is just
// wiring: auth, fetch due learners, dispatch, report.
//
// Day 8 paywall gate (Stage 8 groundwork, LDTKB-016): Days 1-7 deliver
// exactly as before (findDueLearners, capped at 7). Days 8-30 deliver only
// for learners who have crossed the paywall (paid_course_start_date set),
// via findDuePaidLearners, anchored on that date rather than
// pilot_start_date. Learners who haven't crossed it yet are handled by the
// boundary-crossing loop below: an instant Day 8 if they've already paid, a
// one-time check-in message otherwise.

const LOOKBACK_MINUTES = 30; // see SCHEDULER.md "Cron interval and window"

// Day-number 30 = the fixed slot for the quiz-ladder. Day 29 = the living
// comic entry message + Web App button (Checkpoint 6) — DAY29_LESSON_NUMBER
// is imported from deliverDay29Entry.ts rather than redefined here.
const DAY30_QUIZ_DAY_NUMBER = 30;

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

  const telegram = createTelegramClient(botToken);
  const supabase = createSupabaseServerClient();
  const learnerStore = supabaseLearnerStore(supabase);
  const deliveryStore = supabaseDeliveryStore(supabase);
  const purchasesStore = supabasePurchasesStore(supabase);
  const quizStore = supabaseDay30QuizStore(supabase);

  const now = new Date();
  const { calendarDate, minutesSinceMidnight } = bangkokNow(now);

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

  // Days 1-7 (the free preview). DAY_WINDOW_MAX_DAY is now always 7 — the
  // old TESTING_EXTENDED_WINDOW bypass is retired (dueLearners.ts).
  const dueFree = findDueLearners(eligible, { now, lookbackMinutes: LOOKBACK_MINUTES, maxDay: DAY_WINDOW_MAX_DAY });

  // Days 8-30, for learners who have already crossed the paywall. Anchored
  // on paid_course_start_date, NOT pilot_start_date.
  const crossed: PaidCourseLearner[] = eligible.filter(
    (l): l is (typeof eligible)[number] & { paid_course_start_date: string } => l.paid_course_start_date !== null,
  );
  const duePaid = findDuePaidLearners(crossed, { now, lookbackMinutes: LOOKBACK_MINUTES });

  // One merged dispatch list feeding the exact same day-number branches as
  // before — only the day-number *source* is new for 8-30. Typed to just the
  // fields the dispatch below reads, so free-range (OnboardedLearner) and
  // paid-range (PaidCourseLearner) rows drop in without a cast.
  type DispatchLearner = { id: string; telegram_user_id: number; gender_branch: GenderBranch };
  const dispatch: { learner: DispatchLearner; dayNumber: number }[] = [
    ...dueFree.map((d) => ({ learner: d.learner, dayNumber: d.lessonNumber })),
    ...duePaid.map((d) => ({ learner: d.learner, dayNumber: d.dayNumber })),
  ];

  const results: { telegramUserId: number; dayNumber: number; status: string }[] = [];

  for (const { learner, dayNumber } of dispatch) {
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
        const appUrl = process.env.APP_URL;
        if (!appUrl) throw new Error("APP_URL must be set to deliver the Day 30 quiz button");
        await startDay30Quiz(learner.id, learner.telegram_user_id, { telegram, quizStore, appUrl });
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "day30_quiz_started_or_already_in_progress" });
      } else {
        // Defensive fallback only — every value dueFree/duePaid can return
        // (1..30) is handled by one of the branches above. Kept per
        // LDTKB-044's "must not crash" requirement.
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "skipped_unrecognized_day_number" });
      }
    } catch (error) {
      console.error(`Delivery failed for learner ${learner.id}, day ${dayNumber}`, error);
      results.push({ telegramUserId: learner.telegram_user_id, dayNumber, status: "error" });
    }
  }

  // Boundary crossing — learners who have NOT yet crossed the paywall. Only
  // acts on those actually in their delivery window whose free week is spent
  // (decidePaywallGateAction re-checks both); everyone else is a no-op.
  const notCrossed: PaywallGateLearner[] = eligible.filter(
    (l): l is (typeof eligible)[number] & { paid_course_start_date: null } => l.paid_course_start_date === null,
  );

  for (const learner of notCrossed) {
    try {
      // Cheap gate before the purchases lookup: only learners whose lesson
      // time is up right now can possibly need action this tick.
      if (!isWithinDeliveryWindow(learner.schedule_time, minutesSinceMidnight, LOOKBACK_MINUTES)) continue;

      const paidPurchase = await purchasesStore.findPaidByLearner(learner.id);
      const action = decidePaywallGateAction(learner, {
        now,
        lookbackMinutes: LOOKBACK_MINUTES,
        hasPaidPurchase: paidPurchase !== null,
      });

      if (action.kind === "none") continue;

      if (action.kind === "checkin") {
        await telegram.sendMessage(learner.telegram_user_id, PAYWALL_PROMPT_MESSAGE);
        await learnerStore.update(learner.id, { paywall_prompt_sent_at: now.toISOString() });
        results.push({ telegramUserId: learner.telegram_user_id, dayNumber: PAID_COURSE_FIRST_DAY, status: "paywall_checkin_sent" });
        continue;
      }

      // cross_boundary: they've paid and their free week is up — anchor Day 8
      // to today and deliver it in this same run.
      await learnerStore.update(learner.id, { paid_course_start_date: calendarDate });
      const previouslyDelivered = await deliveryStore.listDeliveredLessonNumbers(learner.id);
      const result = await deliverLesson(
        {
          learnerId: learner.id,
          chatId: learner.telegram_user_id,
          gender: learner.gender_branch,
          lessonNumber: action.dayNumber,
          deliveryDate: calendarDate,
          previouslyDeliveredLessonNumbers: previouslyDelivered,
        },
        { telegram, deliveryStore, media, now: () => now },
      );
      results.push({ telegramUserId: learner.telegram_user_id, dayNumber: action.dayNumber, status: `boundary_crossed:${result.status}` });
    } catch (error) {
      console.error(`Paywall gate failed for learner ${learner.id}`, error);
      results.push({ telegramUserId: learner.telegram_user_id, dayNumber: 8, status: "error" });
    }
  }

  return Response.json({ checked: eligible.length, due: dispatch.length, results });
}
