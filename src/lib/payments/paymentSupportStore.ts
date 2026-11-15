// Access to payment_support_requests (supabase/migrations/20260903000000_star_payments.sql).
// Every request gets its own row — same "no already-exists check" shape as
// oopsReportsStore.ts, not day29QuestStore.ts's single-row-per-learner guard.

import { queryOneOrThrow, type Query } from "@/lib/db";

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

export function pgPaymentSupportStore(query: Query): PaymentSupportStore {
  return {
    async create(learnerId, purchaseId, requestText) {
      return queryOneOrThrow<PaymentSupportRequest>(
        query,
        "INSERT INTO payment_support_requests (learner_id, purchase_id, request_text) VALUES ($1, $2, $3) RETURNING to_jsonb(payment_support_requests) AS r",
        [learnerId, purchaseId, requestText],
      );
    },
  };
}
