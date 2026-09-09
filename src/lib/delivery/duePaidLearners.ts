// Paid-content ("Day 8+") counterpart to dueLearners.ts. Same shape: pure
// day-math + "who's due right now" filtering, no I/O. Days 1-7 stay on
// dueLearners.ts anchored to pilot_start_date; Days 8-30 count from
// paid_course_start_date instead (the date the learner actually crossed the
// paywall), so a long gap waiting for payment never skips days once they
// resume. See supabase/migrations/20260909000000_paid_course_gating.sql and
// tests/duePaidLearners.test.ts.
//
// This module has no opinion on payment state or eligibility — callers
// (cron/deliver/route.ts) filter down to the right learners and look up
// purchases before calling in, exactly as the cron route already filters
// `onboarded` before calling findDueLearners.

import { PILOT_LESSON_COUNT } from "@/lib/curriculum/content";
import {
  bangkokNow,
  daysBetween,
  isWithinDeliveryWindow,
  type OnboardedLearner,
} from "@/lib/delivery/dueLearners";

/** First paid day-number (day 8) and the last day of the 30-day course. */
export const PAID_COURSE_FIRST_DAY = PILOT_LESSON_COUNT + 1;
export const PAID_COURSE_LAST_DAY = 30;

/** An onboarded learner who has already crossed the paywall (anchor set). */
export interface PaidCourseLearner extends OnboardedLearner {
  paid_course_start_date: string; // "YYYY-MM-DD" Thailand calendar date, non-null
}

/** An onboarded learner who may or may not have crossed the paywall yet. */
export interface PaywallGateLearner extends OnboardedLearner {
  paid_course_start_date: string | null;
  paywall_prompt_sent_at: string | null;
}

export interface DuePaidLearner {
  learner: PaidCourseLearner;
  dayNumber: number;
}

/**
 * Day 1 of the paid anchor (the day paid_course_start_date falls on) =
 * day-number 8, day 2 = day-number 9, etc., up to day-number 30 — the exact
 * same "anchor day 1 = first day-number of this range" relationship
 * dueLearners.ts uses for pilot_start_date/day-number-1. Outside
 * [8, 30] returns null (a negative offset is the same defensive
 * "nothing due" as dueLearners.ts, not an error).
 */
export function paidDayNumberForLearner(
  paidCourseStartDate: string,
  todayCalendarDate: string,
): number | null {
  const elapsedDays = daysBetween(paidCourseStartDate, todayCalendarDate);
  const dayNumber = elapsedDays + PAID_COURSE_FIRST_DAY;
  if (dayNumber < PAID_COURSE_FIRST_DAY || dayNumber > PAID_COURSE_LAST_DAY) return null;
  return dayNumber;
}

/**
 * Has this learner used up the 7-day free preview as of `todayCalendarDate`?
 * True only once the learner is genuinely past Day 7 (day-number would be
 * >= 8). A null pilot_start_date (shouldn't happen for an onboarded learner)
 * and the defensive "today is before pilot_start_date" case both return
 * false — this is how "past Day 7" is told apart from "before Day 1", both
 * of which make dayNumberForLearner(..., PILOT_LESSON_COUNT) return null.
 */
export function isFreeWeekExhausted(
  pilotStartDate: string | null,
  todayCalendarDate: string,
): boolean {
  if (pilotStartDate === null) return false;
  return daysBetween(pilotStartDate, todayCalendarDate) >= PILOT_LESSON_COUNT;
}

export interface FindDuePaidLearnersOptions {
  now: Date;
  lookbackMinutes: number;
}

/**
 * Filters learners who have ALREADY crossed the paywall down to those due
 * right now, and which paid day-number (8-30) is due. Same delivery-window
 * logic as findDueLearners. Callers must only pass learners with
 * paid_course_start_date set (the type enforces non-null); the cron route
 * filters `eligible` before calling, the same way it already does for
 * findDueLearners.
 *
 * A returned dayNumber of 29/30 maps to the living-comic / quiz special
 * cases, dispatched exactly as the cron route already handles them for the
 * Days 1-28 counterpart.
 */
export function findDuePaidLearners(
  learners: PaidCourseLearner[],
  options: FindDuePaidLearnersOptions,
): DuePaidLearner[] {
  const { calendarDate, minutesSinceMidnight } = bangkokNow(options.now);
  const due: DuePaidLearner[] = [];

  for (const learner of learners) {
    if (!isWithinDeliveryWindow(learner.schedule_time, minutesSinceMidnight, options.lookbackMinutes)) continue;
    const dayNumber = paidDayNumberForLearner(learner.paid_course_start_date, calendarDate);
    if (dayNumber === null) continue;
    due.push({ learner, dayNumber });
  }

  return due;
}

/**
 * What the cron route should do about a learner who has NOT yet crossed the
 * paywall, on this tick:
 *   - "none":           still within (or before) the free week, not in their
 *                       delivery window, or already prompted and still
 *                       unpaid — the cron route does nothing.
 *   - "checkin":        first time they're due for Day 8 unpaid — send the
 *                       one-time check-in message, set paywall_prompt_sent_at.
 *   - "cross_boundary": they're past Day 7 AND have a paid purchase on
 *                       record — set paid_course_start_date to today and
 *                       deliver Day 8 immediately.
 *
 * Pure: `hasPaidPurchase` is resolved by the caller (a purchases lookup) and
 * passed in, the same way the cron route resolves other I/O before calling
 * the pure due-filters.
 */
export type PaywallGateAction =
  | { kind: "none" }
  | { kind: "checkin" }
  | { kind: "cross_boundary"; dayNumber: number };

export interface DecidePaywallGateOptions {
  now: Date;
  lookbackMinutes: number;
  hasPaidPurchase: boolean;
}

export function decidePaywallGateAction(
  learner: PaywallGateLearner,
  options: DecidePaywallGateOptions,
): PaywallGateAction {
  // Already crossed — findDuePaidLearners owns this learner now, not the gate.
  if (learner.paid_course_start_date !== null) return { kind: "none" };

  const { calendarDate, minutesSinceMidnight } = bangkokNow(options.now);

  // The check-in (or the instant Day 8) goes out when the lesson would
  // have — at the learner's chosen daily time, not on an arbitrary tick.
  if (!isWithinDeliveryWindow(learner.schedule_time, minutesSinceMidnight, options.lookbackMinutes)) {
    return { kind: "none" };
  }

  // Still inside the free week (or, defensively, before Day 1) — Days 1-7
  // own this learner.
  if (!isFreeWeekExhausted(learner.pilot_start_date, calendarDate)) return { kind: "none" };

  if (options.hasPaidPurchase) return { kind: "cross_boundary", dayNumber: PAID_COURSE_FIRST_DAY };
  if (learner.paywall_prompt_sent_at === null) return { kind: "checkin" };
  return { kind: "none" };
}
