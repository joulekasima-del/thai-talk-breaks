import type { CreatePurchaseInput, Purchase, PurchasesStore } from "@/lib/payments/purchasesStore";
import type { PaymentSupportRequest, PaymentSupportStore } from "@/lib/payments/paymentSupportStore";

export class FakePurchasesStore implements PurchasesStore {
  purchases: Purchase[] = [];
  private nextId = 1;

  async create(input: CreatePurchaseInput): Promise<Purchase> {
    const existing = this.purchases.find((p) => p.telegram_payment_charge_id === input.telegramPaymentChargeId);
    if (existing) throw new Error("unique constraint violation: duplicate telegram_payment_charge_id"); // mirrors the real unique constraint
    const purchase: Purchase = {
      id: `purchase-${this.nextId++}`,
      learner_id: input.learnerId,
      telegram_payment_charge_id: input.telegramPaymentChargeId,
      provider_payment_charge_id: input.providerPaymentChargeId,
      currency: input.currency,
      total_amount: input.totalAmount,
      invoice_payload: input.invoicePayload,
      status: "paid",
      created_at: new Date().toISOString(),
      refunded_at: null,
    };
    this.purchases.push(purchase);
    return { ...purchase };
  }

  async findByChargeId(telegramPaymentChargeId: string): Promise<Purchase | null> {
    const purchase = this.purchases.find((p) => p.telegram_payment_charge_id === telegramPaymentChargeId);
    return purchase ? { ...purchase } : null;
  }

  async findMostRecentByLearner(learnerId: string): Promise<Purchase | null> {
    const matches = this.purchases.filter((p) => p.learner_id === learnerId);
    if (matches.length === 0) return null;
    // created_at is real-clock-derived and could tie within the same
    // millisecond in a fast test — fall back to insertion order (last
    // pushed = most recent), same tie-break a real `order by created_at
    // desc` with no secondary key would leave ambiguous, but deterministic
    // here since `purchases` is already insertion-ordered.
    return { ...matches[matches.length - 1] };
  }

  async markRefunded(id: string, refundedAt: string): Promise<Purchase> {
    const purchase = this.purchases.find((p) => p.id === id);
    if (!purchase) throw new Error(`FakePurchasesStore: no purchase ${id}`);
    purchase.status = "refunded";
    purchase.refunded_at = refundedAt;
    return { ...purchase };
  }
}

export class FakePaymentSupportStore implements PaymentSupportStore {
  requests: PaymentSupportRequest[] = [];
  private nextId = 1;

  async create(learnerId: string, purchaseId: string | null, requestText: string): Promise<PaymentSupportRequest> {
    const request: PaymentSupportRequest = {
      id: `paysupport-${this.nextId++}`,
      learner_id: learnerId,
      purchase_id: purchaseId,
      request_text: requestText,
      created_at: new Date().toISOString(),
    };
    this.requests.push(request);
    return { ...request };
  }
}
