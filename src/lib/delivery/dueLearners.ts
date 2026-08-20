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
 * Day 1 of the pilot (the day pilot_start_date falls on) = lesson 1, day 2 =
 * lesson 2, ... day 7 = lesson 7. Day 8+ = past the pilot window, no lesson.
 * A negative "day" (today before pilot_start_date) is defensive-only — it
 * shouldn't occur, since pilot_start_date is only ever set to "today" at
 * onboarding completion (handleUpdate.ts) — but is treated the same as
 * "no lesson due" rather than throwing, since a clock skew or retry
 * shouldn't crash the whole delivery run over one learner.
 */
export function lessonNumberForDay(pilotStartDate: string, todayCalendarDate: string): number | null {
  const elapsedDays = daysBetween(pilotStartDate, todayCalendarDate);
  const lessonNumber = elapsedDays + 1;
  if (lessonNumber < 1 || lessonNumber > PILOT_LESSON_COUNT) return null;
  return lessonNumber;
}

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
}

/**
 * Filters a list of fully-onboarded learners down to those due for a lesson
 * right now, and which lesson number is due. Learners with a null
 * pilot_start_date must never appear in `learners` in the first place (see
 * report item on this edge case) — this function doesn't special-case null
 * because the type doesn't allow it: callers are expected to only pass
 * learners already known to have completed onboarding.
 */
export function findDueLearners(learners: OnboardedLearner[], options: FindDueLearnersOptions): DueLearner[] {
  const { calendarDate, minutesSinceMidnight } = bangkokNow(options.now);
  const due: DueLearner[] = [];

  for (const learner of learners) {
    if (!isWithinDeliveryWindow(learner.schedule_time, minutesSinceMidnight, options.lookbackMinutes)) continue;
    const lessonNumber = lessonNumberForDay(learner.pilot_start_date, calendarDate);
    if (lessonNumber === null) continue;
    due.push({ learner, lessonNumber });
  }

  return due;
}
