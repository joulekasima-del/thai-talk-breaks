import { test } from "node:test";
import assert from "node:assert/strict";

import {
  paidDayNumberForLearner,
  isFreeWeekExhausted,
  findDuePaidLearners,
  decidePaywallGateAction,
  PAID_COURSE_FIRST_DAY,
  type PaidCourseLearner,
  type PaywallGateLearner,
} from "@/lib/delivery/duePaidLearners";

// Day 8 paywall gate (Stage 8 groundwork, LDTKB-016). Pure day-math +
// "who's due / what to do" filtering — the same shape as tests/delivery.test.ts
// covers for the Days 1-7 path.

// --- paidDayNumberForLearner: anchor day 1 == day-number 8 ----------------

test("paidDayNumberForLearner: the anchor date itself is day-number 8", () => {
  assert.equal(paidDayNumberForLearner("2026-09-15", "2026-09-15"), 8);
});

test("paidDayNumberForLearner: one day after the anchor is day-number 9 (Days 9+ continue on the same daily cadence)", () => {
  assert.equal(paidDayNumberForLearner("2026-09-15", "2026-09-16"), 9);
  assert.equal(paidDayNumberForLearner("2026-09-15", "2026-09-21"), 14);
});

test("paidDayNumberForLearner: day-number 30 is the last day; past it is null", () => {
  assert.equal(paidDayNumberForLearner("2026-09-01", "2026-09-23"), 30);
  assert.equal(paidDayNumberForLearner("2026-09-01", "2026-09-24"), null);
});

test("paidDayNumberForLearner: a date before the anchor is defensively null, not negative/throwing", () => {
  assert.equal(paidDayNumberForLearner("2026-09-15", "2026-09-14"), null);
});

// --- isFreeWeekExhausted: "past Day 7" vs "before Day 1" ------------------

test("isFreeWeekExhausted: true only once the learner is genuinely past Day 7", () => {
  assert.equal(isFreeWeekExhausted("2026-09-01", "2026-09-07"), false, "Day 7 — still the free preview");
  assert.equal(isFreeWeekExhausted("2026-09-01", "2026-09-08"), true, "Day 8 — free week is up");
  assert.equal(isFreeWeekExhausted("2026-09-01", "2026-09-30"), true, "still exhausted weeks later");
});

test("isFreeWeekExhausted: a null pilot_start_date and a not-yet-started learner both read as NOT exhausted", () => {
  assert.equal(isFreeWeekExhausted(null, "2026-09-30"), false);
  assert.equal(isFreeWeekExhausted("2026-09-10", "2026-09-01"), false, "today is before Day 1 — defensive, not 'exhausted'");
});

// --- findDuePaidLearners -------------------------------------------------

function paidLearner(overrides: Partial<PaidCourseLearner> = {}): PaidCourseLearner {
  return {
    id: "l1",
    telegram_user_id: 1,
    gender_branch: "female",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: "2026-08-01", // deliberately old — must be ignored for Days 8+
    paid_course_start_date: "2026-09-01",
    ...overrides,
  };
}

test("findDuePaidLearners: an in-window learner is due for the day-number counted from paid_course_start_date, NOT pilot_start_date", () => {
  const now = new Date("2026-09-02T01:15:00.000Z"); // 08:15 Bangkok, inside the 30-min window
  const due = findDuePaidLearners([paidLearner()], { now, lookbackMinutes: 30 });
  assert.equal(due.length, 1);
  assert.equal(due[0].dayNumber, 9, "2026-09-01 anchor + 1 day = day-number 9 (pilot_start_date 2026-08-01 is irrelevant here)");
});

test("findDuePaidLearners: a learner outside their delivery window is not due", () => {
  const now = new Date("2026-09-02T05:00:00.000Z"); // 12:00 Bangkok, well past 08:00 + lookback
  assert.equal(findDuePaidLearners([paidLearner()], { now, lookbackMinutes: 30 }).length, 0);
});

test("findDuePaidLearners: past day-number 30 the learner drops out", () => {
  const now = new Date("2026-09-24T01:15:00.000Z"); // anchor + 23 days -> day-number 31
  assert.equal(findDuePaidLearners([paidLearner()], { now, lookbackMinutes: 30 }).length, 0);
});

// --- decidePaywallGateAction: the boundary crossing ----------------------

function gateLearner(overrides: Partial<PaywallGateLearner> = {}): PaywallGateLearner {
  return {
    id: "l1",
    telegram_user_id: 1,
    gender_branch: "male",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: "2026-09-01",
    paid_course_start_date: null,
    paywall_prompt_sent_at: null,
    ...overrides,
  };
}

const IN_WINDOW = new Date("2026-09-09T01:15:00.000Z"); // 08:15 Bangkok on 2026-09-09 (Day 9 relative to a 2026-09-01 start)
const OUT_OF_WINDOW = new Date("2026-09-09T06:00:00.000Z"); // 13:00 Bangkok

test("decidePaywallGateAction: still inside the free week -> nothing (Days 1-7 own this learner)", () => {
  const learner = gateLearner({ pilot_start_date: "2026-09-07" }); // Day 3 on 2026-09-09
  assert.deepEqual(
    decidePaywallGateAction(learner, { now: IN_WINDOW, lookbackMinutes: 30, hasPaidPurchase: false }),
    { kind: "none" },
  );
});

test("decidePaywallGateAction: paid mid-free-week -> STILL nothing until the boundary is actually crossed (Days 4-7 deliver normally first)", () => {
  const learner = gateLearner({ pilot_start_date: "2026-09-07" }); // Day 3
  assert.deepEqual(
    decidePaywallGateAction(learner, { now: IN_WINDOW, lookbackMinutes: 30, hasPaidPurchase: true }),
    { kind: "none" },
    "an early purchase does not fast-forward to Day 8",
  );
});

test("decidePaywallGateAction: out of the delivery window -> nothing, even past Day 7", () => {
  assert.deepEqual(
    decidePaywallGateAction(gateLearner(), { now: OUT_OF_WINDOW, lookbackMinutes: 30, hasPaidPurchase: false }),
    { kind: "none" },
  );
});

test("decidePaywallGateAction: past Day 7, unpaid, never prompted -> send the one-time check-in", () => {
  assert.deepEqual(
    decidePaywallGateAction(gateLearner(), { now: IN_WINDOW, lookbackMinutes: 30, hasPaidPurchase: false }),
    { kind: "checkin" },
  );
});

test("decidePaywallGateAction: past Day 7, unpaid, ALREADY prompted -> nothing (cron never re-sends the check-in)", () => {
  const learner = gateLearner({ paywall_prompt_sent_at: "2026-09-09T01:00:00.000Z" });
  assert.deepEqual(
    decidePaywallGateAction(learner, { now: IN_WINDOW, lookbackMinutes: 30, hasPaidPurchase: false }),
    { kind: "none" },
  );
});

test("decidePaywallGateAction: past Day 7 AND has a paid purchase -> cross the boundary, deliver Day 8", () => {
  assert.deepEqual(
    decidePaywallGateAction(gateLearner(), { now: IN_WINDOW, lookbackMinutes: 30, hasPaidPurchase: true }),
    { kind: "cross_boundary", dayNumber: PAID_COURSE_FIRST_DAY },
  );
  assert.equal(PAID_COURSE_FIRST_DAY, 8);
});

test("decidePaywallGateAction: a learner who has already crossed the boundary -> nothing (findDuePaidLearners owns them now)", () => {
  const learner = gateLearner({ paid_course_start_date: "2026-09-09", paywall_prompt_sent_at: "2026-09-09T01:00:00.000Z" });
  assert.deepEqual(
    decidePaywallGateAction(learner, { now: IN_WINDOW, lookbackMinutes: 30, hasPaidPurchase: true }),
    { kind: "none" },
  );
});
