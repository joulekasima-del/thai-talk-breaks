import type { Query } from "@/lib/db";
import type { TelegramClient } from "@/lib/telegram";
import { pgLearnerStore } from "@/lib/onboarding/learnerStore";
import { pgDeliveryStore } from "@/lib/delivery/deliveryStore";
import { pgPurchasesStore } from "@/lib/payments/purchasesStore";
import { bangkokNow, isWithinDeliveryWindow } from "@/lib/delivery/dueLearners";
import type { MediaLoader } from "@/lib/delivery/deliverLesson";
import { pgDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { pgSrsStore } from "@/lib/srs/srsStore";
import { startSession } from "@/lib/session/session";

// The daily reminder run (Cloudflare cron trigger, and the /api/cron/deliver
// route). Instant-lessons redesign: lessons are no longer tied to calendar
// days — a learner can tap "▶️ Next lesson" any time. The learner's chosen
// time is now a daily reminder: if they haven't had a session yet today, the
// reminder starts one (due reviews, then their next lesson). See
// src/lib/session/session.ts.
//
// Paywall (LDTKB-016/065), counted in lessons: a learner whose next lesson is
// 8+ without a paid purchase gets the check-in message once; after that the
// reminder only fires when they have reviews due.
//
// Every learner handled gets last_session_date = today, so the 30-minute
// window (one run a minute) reaches each learner at most once a day.

const LOOKBACK_MINUTES = 30; // see SCHEDULER.md "Cron interval and window"

export interface DeliveryCronDeps {
  telegram: TelegramClient;
  query: Query;
  media: MediaLoader;
  appUrl: string | undefined;
  now: Date;
  /**
   * Cloudflare's free plan allows only 50 outgoing requests (database, Telegram,
   * assets) per invocation. The Worker passes a function that turns true when
   * most of that budget is spent; the run then stops cleanly and whatever is
   * still due is picked up by the next run a minute later.
   */
  shouldStop?: () => boolean;
}

export interface DeliveryCronResult {
  checked: number;
  due: number;
  results: { telegramUserId: number; dayNumber: number; status: string }[];
  stoppedEarly: boolean;
}

export async function runDeliveryCron(deps: DeliveryCronDeps): Promise<DeliveryCronResult> {
  const { now, telegram, query, media, appUrl, shouldStop } = deps;
  const { calendarDate, minutesSinceMidnight } = bangkokNow(now);
  const learnerStore = pgLearnerStore(query);
  const sessionDeps = {
    telegram,
    learnerStore,
    srsStore: pgSrsStore(query),
    deliveryStore: pgDeliveryStore(query),
    purchasesStore: pgPurchasesStore(query),
    quizStore: pgDay30QuizStore(query),
    media,
    appUrl,
    now: () => now,
  };

  const onboarded = await learnerStore.listOnboarded();
  const eligible = onboarded.filter((l) => l.gender_branch !== null && l.schedule_time !== null);
  const due = eligible.filter(
    (l) =>
      l.last_session_date !== calendarDate &&
      isWithinDeliveryWindow(l.schedule_time!, minutesSinceMidnight, LOOKBACK_MINUTES),
  );

  const results: DeliveryCronResult["results"] = [];
  let stoppedEarly = false;

  for (const learner of due) {
    if (shouldStop?.()) {
      stoppedEarly = true;
      break;
    }
    try {
      const result = await startSession(learner, learner.telegram_user_id, sessionDeps, {
        reminder: true,
        paywallOnlyOnce: true,
        skipIfActive: true,
      });
      // startSession already stamps today on a session it starts; stamp the rest too.
      if (result.status !== "started") await learnerStore.update(learner.id, { last_session_date: calendarDate });
      results.push({
        telegramUserId: learner.telegram_user_id,
        dayNumber: result.status === "started" ? (result.lessonNumber ?? 0) : learner.next_lesson_number,
        status: result.status,
      });
    } catch (error) {
      console.error(`Reminder failed for learner ${learner.id}`, error);
      results.push({ telegramUserId: learner.telegram_user_id, dayNumber: learner.next_lesson_number, status: "error" });
    }
  }

  return { checked: eligible.length, due: due.length, results, stoppedEarly };
}
