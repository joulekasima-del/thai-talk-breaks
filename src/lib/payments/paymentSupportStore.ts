// Access to payment_support_requests (supabase/migrations/20260903000000_star_payments.sql).
// Every request gets its own row — same "no already-exists check" shape as
// oopsReportsStore.ts, not day29QuestStore.ts's single-row-per-learner guard.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PaymentSupportRequest {
  id: string;
  learner_id: string;
  purchase_id: string | null;
  request_text: string;
  created_at: string;
}

export interface PaymentSupportStore {
  create(learnerId: string, purchaseId: string | null, requestText: string): Promise<PaymentSupportRequest>;
}

export function supabasePaymentSupportStore(client: SupabaseClient): PaymentSupportStore {
  return {
    async create(learnerId, purchaseId, requestText) {
      const { data, error } = await client
        .from("payment_support_requests")
        .insert({ learner_id: learnerId, purchase_id: purchaseId, request_text: requestText })
        .select("*")
        .single();
      if (error) throw error;
      return data as PaymentSupportRequest;
    },
  };
}
