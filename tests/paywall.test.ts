import { test } from "node:test";
import assert from "node:assert/strict";

import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import {
  BUY_INVOICE_AMOUNT_STARS,
  BUY_INVOICE_PAYLOAD,
  PAYWALL_PROMPT_MESSAGE,
  REFUND_ISSUED_MESSAGE,
} from "@/lib/payments/content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeOopsReportsStore } from "./oopsFakes";
import { FakePaymentSupportStore, FakePurchasesStore } from "./paymentsFakes";
import { FakeDeliveryStore, FakeMediaLoader } from "./deliveryFakes";
import type { TelegramUpdate } from "@/lib/telegram";
import type { LearnerPatch } from "@/lib/onboarding/learnerStore";

// The lesson-counted paywall (instant-lessons redesign) — payment unlocking
// Lesson 8, the check-in re-send — is covered end to end in
// tests/instantLessons.test.ts. What stays here: /refund clearing the anchor.
//
// Day 8 paywall gate (Stage 8 groundwork, LDTKB-016) — the handleUpdate.ts /
// webhook-side half: instant Day 8 delivery on payment, the check-in
// re-send, and /refund clearing the anchor. The cron-route half (who's due,
// what to do on a tick) is covered by tests/duePaidLearners.test.ts.

let nextUpdateId = 1;

function textUpdate(telegramUserId: number, text: string, chatId = telegramUserId): TelegramUpdate {
  return { update_id: nextUpdateId++, message: { text, chat: { id: chatId }, from: { id: telegramUserId } } };
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


// --- Pays mid-free-week (Day 3): Days 4-7 first, Day 8 only later ---------


// --- Gated learner messages the bot again: check-in re-sent --------------




// --- Day 9+ continues anchored to paid_course_start_date ----------------


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
