import { test } from "node:test";
import assert from "node:assert/strict";

import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import {
  BUY_INVOICE_AMOUNT_STARS,
  BUY_INVOICE_PAYLOAD,
  PAYMENT_CONFIRMATION_MESSAGE,
  PAYWALL_PROMPT_MESSAGE,
  REFUND_ISSUED_MESSAGE,
} from "@/lib/payments/content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeOopsReportsStore } from "./oopsFakes";
import { FakePaymentSupportStore, FakePurchasesStore } from "./paymentsFakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";
import type { TelegramUpdate } from "@/lib/telegram";
import type { LearnerPatch } from "@/lib/onboarding/learnerStore";

// Day 8 paywall gate (Stage 8 groundwork, LDTKB-016) — the handleUpdate.ts /
// webhook-side half: instant Day 8 delivery on payment, the check-in
// re-send, and /refund clearing the anchor. The cron-route half (who's due,
// what to do on a tick) is covered by tests/duePaidLearners.test.ts.

let nextUpdateId = 1;

function textUpdate(telegramUserId: number, text: string, chatId = telegramUserId): TelegramUpdate {
  return { update_id: nextUpdateId++, message: { text, chat: { id: chatId }, from: { id: telegramUserId } } };
}

function successfulPaymentUpdate(telegramUserId: number, chargeId: string, chatId = telegramUserId): TelegramUpdate {
  return {
    update_id: nextUpdateId++,
    message: {
      chat: { id: chatId },
      from: { id: telegramUserId },
      successful_payment: {
        currency: "XTR",
        total_amount: BUY_INVOICE_AMOUNT_STARS,
        invoice_payload: BUY_INVOICE_PAYLOAD,
        telegram_payment_charge_id: chargeId,
      },
    },
  };
}

// 10:00 Bangkok on 2026-09-09 — used as "now" throughout.
const NOW = new Date("2026-09-09T03:00:00.000Z");

function makeDeps(adminTelegramUserId: number | null = null) {
  return {
    store: new FakeLearnerStore(),
    telegram: new FakeTelegramClient(),
    oopsReportsStore: new FakeOopsReportsStore(),
    purchasesStore: new FakePurchasesStore(),
    paymentSupportStore: new FakePaymentSupportStore(),
    deliveryStore: new FakeDeliveryStore(),
    media: new FakeMediaLoader(),
    appUrl: "https://thaitalkbreaks.example",
    adminTelegramUserId,
    now: () => NOW,
  };
}

async function onboardedLearner(
  deps: ReturnType<typeof makeDeps>,
  telegramUserId: number,
  pilotStartDate: string,
  patch: LearnerPatch = {},
) {
  const learner = await deps.store.create(telegramUserId);
  await deps.store.update(learner.id, {
    onboarding_step: "complete",
    gender_branch: "male",
    schedule_period: "morning",
    schedule_time: "08:00",
    pilot_start_date: pilotStartDate,
    ...patch,
  });
  return deps.store.findByTelegramId(telegramUserId);
}

// --- Locked-style copy check (draft, pending its own LDTKB entry) ---------

test("PAYWALL_PROMPT_MESSAGE matches the draft copy verbatim", () => {
  assert.equal(PAYWALL_PROMPT_MESSAGE, "How's it going so far? Ready to keep going? Send /buy to unlock Days 8–30.");
});

// --- Pays while already past Day 7: Day 8 delivered in the same call ------

test("successful_payment past the free week sets paid_course_start_date to today and delivers Day 8 instantly", async () => {
  const deps = makeDeps();
  await onboardedLearner(deps, 700, "2026-09-01"); // Day 9 relative to 2026-09-09 — free week is up

  await handleUpdate(successfulPaymentUpdate(700, "charge-past7"), deps);

  assert.equal(deps.purchasesStore.purchases.length, 1, "purchase still recorded");

  const learner = await deps.store.findByTelegramId(700);
  assert.equal(learner!.paid_course_start_date, "2026-09-09", "anchor set to today's Thailand date");

  // Day 8 is a word-set day — FakeMediaLoader serves day8.png for it.
  assert.ok(
    deps.telegram.sentPhotos.some((p) => p.filename === "day8.png"),
    "Day 8's image was sent in this same handler call — no cron tick needed",
  );
  assert.ok(deps.telegram.sent.some((m) => m.text === PAYMENT_CONFIRMATION_MESSAGE), "confirmation still sent");
});

// --- Pays mid-free-week (Day 3): Days 4-7 first, Day 8 only later ---------

test("successful_payment mid-free-week records the purchase but does NOT anchor or deliver Day 8 yet", async () => {
  const deps = makeDeps();
  await onboardedLearner(deps, 701, "2026-09-07"); // Day 3 on 2026-09-09

  await handleUpdate(successfulPaymentUpdate(701, "charge-day3"), deps);

  assert.equal(deps.purchasesStore.purchases.length, 1);

  const learner = await deps.store.findByTelegramId(701);
  assert.equal(learner!.paid_course_start_date, null, "no anchor yet — still mid-free-week");
  assert.equal(deps.telegram.sentPhotos.length, 0, "no Day 8 lesson delivered — Days 4-7 run their normal course first");
  assert.ok(deps.telegram.sent.some((m) => m.text === PAYMENT_CONFIRMATION_MESSAGE));
});

// --- Gated learner messages the bot again: check-in re-sent --------------

test("a gated learner (check-in already sent, still unpaid, not across the boundary) gets the check-in re-sent on any message", async () => {
  const deps = makeDeps();
  await onboardedLearner(deps, 702, "2026-09-01", { paywall_prompt_sent_at: "2026-09-09T01:00:00.000Z" });

  await handleUpdate(textUpdate(702, "hello? is there more?"), deps);

  assert.deepEqual(
    deps.telegram.sent.map((m) => m.text),
    [PAYWALL_PROMPT_MESSAGE],
    "exactly the same check-in message, nothing else",
  );
});

test("re-send is read-only: it does not set or clear paywall_prompt_sent_at or any pending flag", async () => {
  const deps = makeDeps();
  await onboardedLearner(deps, 703, "2026-09-01", { paywall_prompt_sent_at: "2026-09-09T01:00:00.000Z" });

  await handleUpdate(textUpdate(703, "still here"), deps);
  await handleUpdate(textUpdate(703, "and again"), deps);

  const learner = await deps.store.findByTelegramId(703);
  assert.equal(learner!.paywall_prompt_sent_at, "2026-09-09T01:00:00.000Z", "timestamp untouched");
  assert.equal(learner!.awaiting_oops_report_since, null);
  assert.equal(learner!.awaiting_paysupport_request_since, null);
  assert.equal(deps.telegram.sent.length, 2, "re-sent on each message");
});

test("a learner who HAS a paid purchase does not get the check-in re-sent (they've paid — cron will cross them over)", async () => {
  const deps = makeDeps();
  const learner = await onboardedLearner(deps, 704, "2026-09-01", { paywall_prompt_sent_at: "2026-09-09T01:00:00.000Z" });
  await deps.purchasesStore.create({
    learnerId: learner!.id,
    telegramPaymentChargeId: "charge-704",
    providerPaymentChargeId: null,
    currency: "XTR",
    totalAmount: BUY_INVOICE_AMOUNT_STARS,
    invoicePayload: BUY_INVOICE_PAYLOAD,
  });

  await handleUpdate(textUpdate(704, "hello"), deps);

  assert.equal(deps.telegram.sent.length, 0, "no re-send — the plain text is silently ignored, as before the gate existed");
});

// --- Day 9+ continues anchored to paid_course_start_date ----------------

test("after crossing on payment, Day 9 is due one day later counted from paid_course_start_date, not pilot_start_date", async () => {
  const deps = makeDeps();
  await onboardedLearner(deps, 705, "2026-07-01"); // very old pilot start — must not matter for Day 8+

  await handleUpdate(successfulPaymentUpdate(705, "charge-705"), deps);
  const learner = await deps.store.findByTelegramId(705);
  assert.equal(learner!.paid_course_start_date, "2026-09-09");

  // The cron path's day-math (duePaidLearners.ts) is unit-tested separately;
  // here we just assert the anchor it will count from is today, not the
  // 2026-07-01 pilot_start_date.
  assert.notEqual(learner!.paid_course_start_date, learner!.pilot_start_date);
});

// --- /refund clears the anchor -----------------------------------------

test("/refund on a learner who had crossed the paywall clears paid_course_start_date (falls back behind the gate)", async () => {
  const deps = makeDeps(999);
  const learner = await onboardedLearner(deps, 706, "2026-09-01", {
    paid_course_start_date: "2026-09-09",
    paywall_prompt_sent_at: "2026-09-09T01:00:00.000Z",
  });
  await deps.purchasesStore.create({
    learnerId: learner!.id,
    telegramPaymentChargeId: "charge-refundme",
    providerPaymentChargeId: null,
    currency: "XTR",
    totalAmount: BUY_INVOICE_AMOUNT_STARS,
    invoicePayload: BUY_INVOICE_PAYLOAD,
  });

  await handleUpdate(textUpdate(999, "/refund charge-refundme"), deps);

  assert.equal(deps.telegram.refunds.length, 1, "refund actually issued");
  const refreshed = await deps.store.findByTelegramId(706);
  assert.equal(refreshed!.paid_course_start_date, null, "anchor cleared — learner is back behind the gate");
  assert.equal(deps.purchasesStore.purchases[0].status, "refunded");
  assert.ok(deps.telegram.sent.some((m) => m.text === REFUND_ISSUED_MESSAGE));
});

test("/refund on a learner who never crossed the paywall just refunds — no anchor to clear", async () => {
  const deps = makeDeps(999);
  const learner = await onboardedLearner(deps, 707, "2026-09-07"); // still mid-free-week
  await deps.purchasesStore.create({
    learnerId: learner!.id,
    telegramPaymentChargeId: "charge-noanchor",
    providerPaymentChargeId: null,
    currency: "XTR",
    totalAmount: BUY_INVOICE_AMOUNT_STARS,
    invoicePayload: BUY_INVOICE_PAYLOAD,
  });

  await handleUpdate(textUpdate(999, "/refund charge-noanchor"), deps);

  assert.equal(deps.telegram.refunds.length, 1);
  const refreshed = await deps.store.findByTelegramId(707);
  assert.equal(refreshed!.paid_course_start_date, null);
});
