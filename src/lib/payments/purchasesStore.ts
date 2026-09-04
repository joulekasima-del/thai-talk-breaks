// Access to purchases (supabase/migrations/20260903000000_star_payments.sql).
// Same shape as oopsReportsStore.ts: one row per event (here, a successful
// payment), plus lookups the /refund and /paysupport flows need.

import type { SupabaseClient } from "@supabase/supabase-js";

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
  markRefunded(id: string, refundedAt: string): Promise<Purchase>;
}

export function supabasePurchasesStore(client: SupabaseClient): PurchasesStore {
  return {
    async create(input) {
      const { data, error } = await client
        .from("purchases")
        .insert({
          learner_id: input.learnerId,
          telegram_payment_charge_id: input.telegramPaymentChargeId,
          provider_payment_charge_id: input.providerPaymentChargeId,
          currency: input.currency,
          total_amount: input.totalAmount,
          invoice_payload: input.invoicePayload,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Purchase;
    },

    async findByChargeId(telegramPaymentChargeId) {
      const { data, error } = await client
        .from("purchases")
        .select("*")
        .eq("telegram_payment_charge_id", telegramPaymentChargeId)
        .maybeSingle();
      if (error) throw error;
      return (data as Purchase | null) ?? null;
    },

    async findMostRecentByLearner(learnerId) {
      const { data, error } = await client
        .from("purchases")
        .select("*")
        .eq("learner_id", learnerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as Purchase | null) ?? null;
    },

    async markRefunded(id, refundedAt) {
      const { data, error } = await client
        .from("purchases")
        .update({ status: "refunded", refunded_at: refundedAt })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Purchase;
    },
  };
}
