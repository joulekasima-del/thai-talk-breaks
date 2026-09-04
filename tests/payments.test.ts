import { test } from "node:test";
import assert from "node:assert/strict";

import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import {
  BUY_INVOICE_AMOUNT_STARS,
  BUY_INVOICE_DESCRIPTION,
  BUY_INVOICE_PAYLOAD,
  BUY_INVOICE_PRICE_LABEL,
  BUY_INVOICE_TITLE,
  BUY_NOT_ONBOARDED_MESSAGE,
  PAYMENT_CONFIRMATION_MESSAGE,
  PAYSUPPORT_CONFIRMATION_MESSAGE,
  PAYSUPPORT_PROMPT_MESSAGE,
  REFUND_ISSUED_MESSAGE,
} from "@/lib/payments/content";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeOopsReportsStore } from "./oopsFakes";
import { FakePaymentSupportStore, FakePurchasesStore } from "./paymentsFakes";
import type { TelegramSuccessfulPayment, TelegramUpdate } from "@/lib/telegram";

let nextUpdateId = 1;

function textUpdate(telegramUserId: number, text: string, chatId = telegramUserId): TelegramUpdate {
  return { update_id: nextUpdateId++, message: { text, chat: { id: chatId }, from: { id: telegramUserId } } };
}

function preCheckoutUpdate(telegramUserId: number, id = `pcq-${nextUpdateId}`): TelegramUpdate {
  return {
    update_id: nextUpdateId++,
    pre_checkout_query: {
      id,
      from: { id: telegramUserId },
      currency: "XTR",
      total_amount: BUY_INVOICE_AMOUNT_STARS,
      invoice_payload: BUY_INVOICE_PAYLOAD,
    },
  };
}

function successfulPaymentUpdate(
  telegramUserId: number,
  chargeId: string,
  chatId = telegramUserId,
  overrides: Partial<TelegramSuccessfulPayment> = {},
): TelegramUpdate {
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
        ...overrides,
      },
    },
  };
}

function makeDeps(adminTelegramUserId: number | null = null, now = new Date("2026-09-03T03:00:00.000Z")) {
  return {
    store: new FakeLearnerStore(),
    telegram: new FakeTelegramClient(),
    oopsReportsStore: new FakeOopsReportsStore(),
    purchasesStore: new FakePurchasesStore(),
    paymentSupportStore: new FakePaymentSupportStore(),
    adminTelegramUserId,
    now: () => now,
  };
}

// --- Locked copy, reproduced verbatim from the Stage 5 build prompt -------

test("locked payments copy matches the draft verbatim", () => {
  assert.equal(BUY_INVOICE_TITLE, "Thai Talk Breaks — 30-Day Course");
  assert.equal(
    BUY_INVOICE_DESCRIPTION,
    "The full 30-day spoken-Thai course, delivered daily at your chosen time. This is a test purchase for Stage 5 checkout verification.",
  );
  assert.equal(BUY_INVOICE_PAYLOAD, "thirty_day_course_v1");
  assert.equal(BUY_INVOICE_PRICE_LABEL, "30-Day Course");
  assert.equal(BUY_INVOICE_AMOUNT_STARS, 500);
  assert.equal(BUY_NOT_ONBOARDED_MESSAGE, "Send /start first to set up your account, then /buy again.");
  assert.equal(
    PAYMENT_CONFIRMATION_MESSAGE,
    "🎉 Payment received — thank you! If a lesson ever fails to arrive as scheduled, send /paysupport and I'll take a look.",
  );
  assert.equal(
    PAYSUPPORT_PROMPT_MESSAGE,
    "What's going on with your payment? Describe it and I'll take a look. 💳\n\nJust so you know: refunds are issued when Thai Talk Breaks fails to deliver a lesson as scheduled. For anything else, I'm still glad to help however I can — it just may not always mean a refund.",
  );
  assert.equal(
    PAYSUPPORT_CONFIRMATION_MESSAGE,
    "Got it — I've passed this along for review and will follow up here once it's sorted. 🙏",
  );
  assert.equal(
    REFUND_ISSUED_MESSAGE,
    "Your refund has been processed — the Stars are back in your balance. Thanks for your patience! 💛",
  );
});

// --- /buy: sends the invoice correctly -------------------------------------

test("/buy from a learner with a row sends the invoice with the correct fixed 500-Star price", async () => {
  const deps = makeDeps();
  await deps.store.create(100);

  await handleUpdate(textUpdate(100, "/buy"), deps);

  assert.equal(deps.telegram.sentInvoices.length, 1);
  const invoice = deps.telegram.sentInvoices[0];
  assert.equal(invoice.chatId, 100);
  assert.equal(invoice.title, BUY_INVOICE_TITLE);
  assert.equal(invoice.description, BUY_INVOICE_DESCRIPTION);
  assert.equal(invoice.payload, BUY_INVOICE_PAYLOAD);
  assert.deepEqual(invoice.prices, [{ label: BUY_INVOICE_PRICE_LABEL, amount: BUY_INVOICE_AMOUNT_STARS }]);
});

test("/buy from a learner with no row at all sends BUY_NOT_ONBOARDED_MESSAGE, no invoice", async () => {
  const deps = makeDeps();

  await handleUpdate(textUpdate(101, "/buy"), deps);

  assert.equal(deps.telegram.sentInvoices.length, 0);
  assert.equal(deps.telegram.sent.length, 1);
  assert.equal(deps.telegram.sent[0].text, BUY_NOT_ONBOARDED_MESSAGE);
});

// --- pre_checkout_query: always answered ok: true --------------------------

test("pre_checkout_query is always answered with ok: true", async () => {
  const deps = makeDeps();
  await deps.store.create(200);

  await handleUpdate(preCheckoutUpdate(200, "pcq-1"), deps);

  assert.equal(deps.telegram.answeredPreCheckoutQueries.length, 1);
  assert.deepEqual(deps.telegram.answeredPreCheckoutQueries[0], { preCheckoutQueryId: "pcq-1", ok: true, errorMessage: undefined });
});

test("pre_checkout_query is routed before any text-based branch (no message.text on this update shape)", async () => {
  const deps = makeDeps();
  await deps.store.create(201);

  // No message at all on this update — only pre_checkout_query.
  const update: TelegramUpdate = {
    update_id: nextUpdateId++,
    pre_checkout_query: { id: "pcq-2", from: { id: 201 }, currency: "XTR", total_amount: 500, invoice_payload: BUY_INVOICE_PAYLOAD },
  };
  await handleUpdate(update, deps);

  assert.equal(deps.telegram.answeredPreCheckoutQueries.length, 1);
  assert.equal(deps.telegram.sent.length, 0, "no ordinary message handling should fire for this update shape");
});

// --- successful_payment: records a purchase, confirms the learner ---------

test("successful_payment records a purchase and confirms the learner", async () => {
  const deps = makeDeps();
  const learner = await deps.store.create(300);

  await handleUpdate(successfulPaymentUpdate(300, "charge-abc123"), deps);

  assert.equal(deps.purchasesStore.purchases.length, 1);
  const purchase = deps.purchasesStore.purchases[0];
  assert.equal(purchase.learner_id, learner.id);
  assert.equal(purchase.telegram_payment_charge_id, "charge-abc123");
  assert.equal(purchase.currency, "XTR");
  assert.equal(purchase.total_amount, BUY_INVOICE_AMOUNT_STARS);
  assert.equal(purchase.invoice_payload, BUY_INVOICE_PAYLOAD);
  assert.equal(purchase.status, "paid");

  assert.equal(deps.telegram.sent.length, 1);
  assert.equal(deps.telegram.sent[0].text, PAYMENT_CONFIRMATION_MESSAGE);
  assert.equal(deps.telegram.sent[0].chatId, 300);
});

test("successful_payment is checked before the plain-text/oops fallback (a payment message's text is typically undefined)", async () => {
  const deps = makeDeps();
  await deps.store.create(301);

  // text is undefined on a real successful_payment message — confirm it's
  // not silently swallowed by the catch-all (which requires text !== undefined).
  await handleUpdate(successfulPaymentUpdate(301, "charge-def456"), deps);

  assert.equal(deps.purchasesStore.purchases.length, 1, "must still be recorded despite text being undefined");
});

// --- /paysupport: prompts, then captures and DMs the admin -----------------

test("/paysupport from a learner with no purchase sends the prompt (stating LDTKB-063's standard) and sets the pending flag", async () => {
  const deps = makeDeps();
  await deps.store.create(400);

  await handleUpdate(textUpdate(400, "/paysupport"), deps);

  assert.equal(deps.telegram.sent.length, 1);
  assert.equal(deps.telegram.sent[0].text, PAYSUPPORT_PROMPT_MESSAGE);

  const learner = await deps.store.findByTelegramId(400);
  assert.ok(learner!.awaiting_paysupport_request_since, "pending flag must be set after /paysupport");
});

test("/paysupport while already pending re-sends the same prompt without stacking", async () => {
  const deps = makeDeps();
  await deps.store.create(401);

  await handleUpdate(textUpdate(401, "/paysupport"), deps);
  const firstPending = (await deps.store.findByTelegramId(401))!.awaiting_paysupport_request_since;
  await handleUpdate(textUpdate(401, "/paysupport"), deps);
  const secondPending = (await deps.store.findByTelegramId(401))!.awaiting_paysupport_request_since;

  assert.equal(deps.telegram.sent.length, 2);
  assert.equal(firstPending, secondPending, "a repeated /paysupport must not change/stack the pending state");
});

test("plain text while a payment-support request is pending captures it, matched against the learner's most recent purchase, and DMs the admin with the right charge id", async () => {
  const deps = makeDeps(987654321);
  const learner = await deps.store.create(402);
  await handleUpdate(successfulPaymentUpdate(402, "charge-xyz789"), deps); // buys first

  await handleUpdate(textUpdate(402, "/paysupport"), deps);
  await handleUpdate(textUpdate(402, "my lesson never arrived today"), deps);

  const pendingFlag = (await deps.store.findByTelegramId(402))!.awaiting_paysupport_request_since;
  assert.equal(pendingFlag, null, "pending flag must be cleared after capture");

  assert.equal(deps.paymentSupportStore.requests.length, 1);
  const request = deps.paymentSupportStore.requests[0];
  assert.equal(request.learner_id, learner.id);
  assert.equal(request.request_text, "my lesson never arrived today");
  assert.equal(request.purchase_id, deps.purchasesStore.purchases[0].id);

  const confirmation = deps.telegram.sent.find((m) => m.text === PAYSUPPORT_CONFIRMATION_MESSAGE);
  assert.ok(confirmation, "confirmation message must be sent to the learner");
  assert.equal(confirmation!.chatId, 402);

  const adminMessages = deps.telegram.sent.filter((m) => m.chatId === 987654321);
  assert.equal(adminMessages.length, 1);
  assert.match(adminMessages[0].text, /charge-xyz789/);
  assert.match(adminMessages[0].text, /402/);
  assert.match(adminMessages[0].text, /my lesson never arrived today/);
});

test("/paysupport with no purchase on record captures the request and DMs the admin with 'none found'", async () => {
  const deps = makeDeps(555);
  await deps.store.create(403);

  await handleUpdate(textUpdate(403, "/paysupport"), deps);
  await handleUpdate(textUpdate(403, "did my payment even go through?"), deps);

  const adminMessages = deps.telegram.sent.filter((m) => m.chatId === 555);
  assert.equal(adminMessages.length, 1);
  assert.match(adminMessages[0].text, /none found/);
});

test("a failing admin DM does not undo the already-saved payment-support request or the learner's confirmation", async () => {
  const deps = makeDeps(42);
  await deps.store.create(404);
  await handleUpdate(textUpdate(404, "/paysupport"), deps);

  const originalSendMessage = deps.telegram.sendMessage.bind(deps.telegram);
  deps.telegram.sendMessage = async (chatId, text, keyboard) => {
    if (chatId === 42) throw new Error("Telegram sendMessage failed: 400 chat not found");
    return originalSendMessage(chatId, text, keyboard);
  };

  await handleUpdate(textUpdate(404, "charged twice for the same course"), deps);

  assert.equal(deps.paymentSupportStore.requests.length, 1, "request must still be saved despite the DM failure");
  assert.ok(deps.telegram.sent.some((m) => m.text === PAYSUPPORT_CONFIRMATION_MESSAGE), "learner confirmation must still send");
});

test("if both an /oops report and a /paysupport request are somehow pending, oops takes precedence", async () => {
  const deps = makeDeps();
  await deps.store.create(405);
  await handleUpdate(textUpdate(405, "/oops"), deps);
  await handleUpdate(textUpdate(405, "/paysupport"), deps);

  await handleUpdate(textUpdate(405, "which one captures this?"), deps);

  assert.equal(deps.oopsReportsStore.reports.length, 1, "oops must capture it");
  assert.equal(deps.paymentSupportStore.requests.length, 0, "paysupport must not also capture the same message");

  const learner = await deps.store.findByTelegramId(405);
  assert.equal(learner!.awaiting_oops_report_since, null);
  assert.ok(learner!.awaiting_paysupport_request_since, "the paysupport flag is left pending, untouched by the oops capture");
});

// --- /refund: admin-only ----------------------------------------------------

test("/refund from a non-admin is silently ignored", async () => {
  const deps = makeDeps(999); // configured admin is 999
  const learner = await deps.store.create(500);
  await handleUpdate(successfulPaymentUpdate(500, "charge-notadmin"), deps);

  await handleUpdate(textUpdate(500, "/refund charge-notadmin"), deps); // learner 500 is not the admin

  assert.equal(deps.telegram.refunds.length, 0, "refundStarPayment must not be called");
  const purchase = deps.purchasesStore.purchases[0];
  assert.equal(purchase.status, "paid", "purchase must be untouched");
  void learner;
});

test("/refund when no admin is configured at all is silently ignored", async () => {
  const deps = makeDeps(null);
  await deps.store.create(501);
  await handleUpdate(successfulPaymentUpdate(501, "charge-noadmin"), deps);

  await handleUpdate(textUpdate(501, "/refund charge-noadmin"), deps);

  assert.equal(deps.telegram.refunds.length, 0);
});

test("/refund from the admin calls refundStarPayment, marks the purchase refunded, DMs the admin, and notifies the learner", async () => {
  const deps = makeDeps(999);
  const learner = await deps.store.create(502);
  await handleUpdate(successfulPaymentUpdate(502, "charge-real123"), deps);

  await handleUpdate(textUpdate(999, "/refund charge-real123"), deps); // sent by the admin, from the admin's own chat

  assert.equal(deps.telegram.refunds.length, 1);
  assert.deepEqual(deps.telegram.refunds[0], { userId: 502, telegramPaymentChargeId: "charge-real123" });

  const purchase = deps.purchasesStore.purchases[0];
  assert.equal(purchase.status, "refunded");
  assert.ok(purchase.refunded_at);

  const adminConfirmation = deps.telegram.sent.find((m) => m.chatId === 999 && /Refunded charge/.test(m.text));
  assert.ok(adminConfirmation, "admin must get a confirmation DM");
  assert.match(adminConfirmation!.text, /charge-real123/);
  assert.match(adminConfirmation!.text, /502/);

  // chatId 502 already received PAYMENT_CONFIRMATION_MESSAGE from the
  // earlier successful_payment step — match on the refund text specifically,
  // not just the chatId, so this doesn't pick up that earlier message.
  const learnerMessage = deps.telegram.sent.find((m) => m.chatId === 502 && m.text === REFUND_ISSUED_MESSAGE);
  assert.ok(learnerMessage, "learner must be notified with the refund-issued message");
  void learner;
});

test("/refund with an unknown charge id is silently ignored", async () => {
  const deps = makeDeps(999);

  await handleUpdate(textUpdate(999, "/refund charge-does-not-exist"), deps);

  assert.equal(deps.telegram.refunds.length, 0);
  assert.equal(deps.telegram.sent.length, 0);
});

test("/refund on an already-refunded charge is silently ignored (no double refund)", async () => {
  const deps = makeDeps(999);
  await deps.store.create(503);
  await handleUpdate(successfulPaymentUpdate(503, "charge-already"), deps);
  await handleUpdate(textUpdate(999, "/refund charge-already"), deps);
  const refundCountAfterFirst = deps.telegram.refunds.length;

  await handleUpdate(textUpdate(999, "/refund charge-already"), deps);

  assert.equal(deps.telegram.refunds.length, refundCountAfterFirst, "a second /refund on the same charge must not call refundStarPayment again");
});
