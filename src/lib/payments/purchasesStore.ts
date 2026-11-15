// Access to purchases (supabase/migrations/20260903000000_star_payments.sql).
// Same shape as oopsReportsStore.ts: one row per event (here, a successful
// payment), plus lookups the /refund and /paysupport flows need.

import { queryOne, queryOneOrThrow, type Query } from "@/lib/db";

export interface Purchase {
  id: string;
  learner_id: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string | null;
  currency: string;
  total_amount: number;
  invoice_payload: string;
  status: "paid" | "refunded";
  created_at: string;
  refunded_at: string | null;
}

export interface CreatePurchaseInput {
  learnerId: string;
  telegramPaymentChargeId: string;
  providerPaymentChargeId: string | null;
  currency: string;
  totalAmount: number;
  invoicePayload: string;
}

export interface PurchasesStore {
  create(input: CreatePurchaseInput): Promise<Purchase>;
  findByChargeId(telegramPaymentChargeId: string): Promise<Purchase | null>;
  /** Most recent purchase for a learner, if any — used by /paysupport to attach a likely charge id. */
  findMostRecentByLearner(learnerId: string): Promise<Purchase | null>;
  /**
   * Most recent still-'paid' (not refunded) purchase for a learner, if any.
   * The Day 8 paywall gate's "has this learner actually paid?" check
   * (cron/deliver/route.ts boundary crossing, handleUpdate.ts check-in
   * re-send) — deliberately narrower than findMostRecentByLearner, whose
   * most-recent row could be a refund.
   */
  findPaidByLearner(learnerId: string): Promise<Purchase | null>;
  markRefunded(id: string, refundedAt: string): Promise<Purchase>;
}

export function pgPurchasesStore(query: Query): PurchasesStore {
  return {
    async create(input) {
      return queryOneOrThrow<Purchase>(
        query,
        "INSERT INTO purchases (learner_id, telegram_payment_charge_id, provider_payment_charge_id, currency, total_amount, invoice_payload) VALUES ($1, $2, $3, $4, $5, $6) RETURNING to_jsonb(purchases) AS r",
        [
          input.learnerId,
          input.telegramPaymentChargeId,
          input.providerPaymentChargeId,
          input.currency,
          input.totalAmount,
          input.invoicePayload,
        ],
      );
    },

    async findByChargeId(telegramPaymentChargeId) {
      return queryOne<Purchase>(
        query,
        "SELECT to_jsonb(p) AS r FROM purchases p WHERE telegram_payment_charge_id = $1",
        [telegramPaymentChargeId],
      );
    },

    async findMostRecentByLearner(learnerId) {
      return queryOne<Purchase>(
        query,
        "SELECT to_jsonb(p) AS r FROM purchases p WHERE learner_id = $1 ORDER BY created_at DESC LIMIT 1",
        [learnerId],
      );
    },

    async findPaidByLearner(learnerId) {
      return queryOne<Purchase>(
        query,
        "SELECT to_jsonb(p) AS r FROM purchases p WHERE learner_id = $1 AND status = 'paid' ORDER BY created_at DESC LIMIT 1",
        [learnerId],
      );
    },

    async markRefunded(id, refundedAt) {
      return queryOneOrThrow<Purchase>(
        query,
        "UPDATE purchases SET status = 'refunded', refunded_at = $2 WHERE id = $1 RETURNING to_jsonb(purchases) AS r",
        [id, refundedAt],
      );
    },
  };
}
