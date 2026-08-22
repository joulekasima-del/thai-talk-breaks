// Pure day-math and "who's due right now" filtering. No I/O — takes a plain
// list of learner rows and a clock, returns which of them are due and for
// which lesson number. See tests/delivery.test.ts and SCHEDULER.md.

import { PILOT_LESSON_COUNT } from "@/lib/curriculum/content";
import type { GenderBranch, SchedulePeriod } from "@/lib/onboarding/learnerStore";

export interface OnboardedLearner {
  id: string;
  telegram_user_id: number;
  gender_branch: GenderBranch;
  // Not read by any day-math/window logic below — kept nullable so callers
  // don't need to prove it's set (only gender_branch/schedule_time/
  // pilot_start_date actually drive delivery decisions).
  schedule_period: SchedulePeriod | null;
  schedule_time: string; // "HH:MM:SS" or "HH:MM", Thailand wall-clock
  pilot_start_date: string; // "YYYY-MM-DD", Thailand calendar date
}

export interface DueLearner {
  learner: OnboardedLearner;
  lessonNumber: number;
}

/**
 * Thailand-local (UTC+7) "now", split into calendar date and time-of-day,
 * via UTC arithmetic — independent of the server's own timezone. Mirrors
 * onboarding/handleUpdate.ts's todayInBangkok, extended to also return the
 * time-of-day component the delivery window check needs.
 */
export function bangkokNow(date: Date): { calendarDate: string; minutesSinceMidnight: number } {
  const bangkok = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const yyyy = bangkok.getUTCFullYear();
  const mm = String(bangkok.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(bangkok.getUTCDate()).padStart(2, "0");
  return {
    calendarDate: `${yyyy}-${mm}-${dd}`,
    minutesSinceMidnight: bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes(),
  };
}

function daysBetween(fromDate: string, toDate: string): number {
  // Both are "YYYY-MM-DD" Thailand calendar dates — comparing them as UTC
  // midnights gives an exact whole-day difference with no DST/offset risk.
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const to = Date.parse(`${toDate}T00:00:00Z`);
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/**
 * Day 1 of the pilot (the day pilot_start_date falls on) = day-number 1,
 * day 2 = day-number 2, etc., up to `maxDay`. Beyond `maxDay` = past the
 * window, no delivery. A negative day (today before pilot_start_date) is
 * defensive-only — it shouldn't occur, since pilot_start_date is only ever
 * set to "today" at onboarding completion (handleUpdate.ts) — but is
 * treated the same as "nothing due" rather than throwing, since a clock
 * skew or retry shouldn't crash the whole delivery run over one learner.
 *
 * `maxDay` defaults to the real 7-day pilot (LDTKB-013). Checkpoint 4's
 * TESTING-ONLY extension to 30 (LDTKB-044) is applied by the caller passing
 * a larger `maxDay` — see TESTING_EXTENDED_DAY_WINDOW in this file. This
 * function has no opinion on which is "real"; it just bounds a range.
 */
export function dayNumberForLearner(pilotStartDate: string, todayCalendarDate: string, maxDay: number): number | null {
  const elapsedDays = daysBetween(pilotStartDate, todayCalendarDate);
  const dayNumber = elapsedDays + 1;
  if (dayNumber < 1 || dayNumber > maxDay) return null;
  return dayNumber;
}

/** @deprecated Checkpoint 3 name, kept for its existing tests. Equivalent to `dayNumberForLearner(..., PILOT_LESSON_COUNT)`. */
export function lessonNumberForDay(pilotStartDate: string, todayCalendarDate: string): number | null {
  return dayNumberForLearner(pilotStartDate, todayCalendarDate, PILOT_LESSON_COUNT);
}

// -----------------------------------------------------------------------
// TEMPORARY TESTING BYPASS — see LDTKB-044. Real pilot scope is 7 days
// (LDTKB-013). Do NOT treat this as the production day-window. Gated behind
// an environment variable that defaults OFF, so a deployment without it
// explicitly set behaves exactly like the real 7-day pilot.
// -----------------------------------------------------------------------
export const TESTING_EXTENDED_DAY_WINDOW = process.env.TESTING_EXTENDED_WINDOW === "true";
export const DAY_WINDOW_MAX_DAY = TESTING_EXTENDED_DAY_WINDOW ? 30 : PILOT_LESSON_COUNT;

function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * A learner is "due" if their schedule_time falls within the lookback
 * window ending at `now` — see SCHEDULER.md for the interval/window
 * rationale and its timing trade-off. All valid schedule_time values are
 * exactly on the hour (LDTKB-034's button set), so no midnight-wraparound
 * handling is needed: the earliest possible window start (08:00 minus the
 * lookback) never goes negative.
 */
export function isWithinDeliveryWindow(
  scheduleTime: string,
  nowMinutesSinceMidnight: number,
  lookbackMinutes: number,
): boolean {
  const scheduled = timeStringToMinutes(scheduleTime);
  return scheduled <= nowMinutesSinceMidnight && scheduled > nowMinutesSinceMidnight - lookbackMinutes;
}

export interface FindDueLearnersOptions {
  now: Date;
  lookbackMinutes: number;
  /** Defaults to the real 7-day pilot. Pass DAY_WINDOW_MAX_DAY for Checkpoint 4's testing-only extension. */
  maxDay?: number;
}

/**
 * Filters a list of fully-onboarded learners down to those due right now,
 * and which day-number is due (1-7 = an actual lesson; 8+ only reachable
 * under the testing extension, and callers must not assume every returned
 * lessonNumber maps to a real lesson — see cron/deliver/route.ts). Learners
 * with a null pilot_start_date must never appear in `learners` in the first
 * place (see report item on this edge case) — this function doesn't
 * special-case null because the type doesn't allow it: callers are
 * expected to only pass learners already known to have completed
 * onboarding.
 */
export function findDueLearners(learners: OnboardedLearner[], options: FindDueLearnersOptions): DueLearner[] {
  const { calendarDate, minutesSinceMidnight } = bangkokNow(options.now);
  const maxDay = options.maxDay ?? PILOT_LESSON_COUNT;
  const due: DueLearner[] = [];

  for (const learner of learners) {
    if (!isWithinDeliveryWindow(learner.schedule_time, minutesSinceMidnight, options.lookbackMinutes)) continue;
    const lessonNumber = dayNumberForLearner(learner.pilot_start_date, calendarDate, maxDay);
    if (lessonNumber === null) continue;
    due.push({ learner, lessonNumber });
  }

  return due;
}
