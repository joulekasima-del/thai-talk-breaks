// Learner persistence, abstracted behind an interface so the onboarding
// logic (handleUpdate.ts) can be unit-tested against an in-memory fake
// without a real Supabase connection. supabaseLearnerStore() below is the
// only implementation that talks to the actual `learners` table defined in
// supabase/migrations/20260820000000_initial_schema.sql.

import type { SupabaseClient } from "@supabase/supabase-js";

export type GenderBranch = "male" | "female";
export type SchedulePeriod = "morning" | "afternoon" | "evening";
export type OnboardingStep =
  | "gender_pending"
  | "schedule_period_pending"
  | "schedule_time_pending"
  | "complete";

export interface Learner {
  id: string;
  telegram_user_id: number;
  gender_branch: GenderBranch | null;
  schedule_period: SchedulePeriod | null;
  schedule_time: string | null;
  onboarding_step: OnboardingStep;
  onboarding_completed_at: string | null;
  pilot_start_date: string | null;
  /**
   * Set while waiting for a learner's next message to be captured as an
   * /oops report; null otherwise. Deliberately independent of
   * onboarding_step — see supabase/migrations/20260826000000_oops_reports.sql.
   */
  awaiting_oops_report_since: string | null;
  /**
   * Set while waiting for a learner's next message to be captured as a
   * /paysupport request; null otherwise. Same pending-flag pattern as
   * awaiting_oops_report_since — see
   * supabase/migrations/20260903000000_star_payments.sql (Stage 5, LDTKB-014).
   */
  awaiting_paysupport_request_since: string | null;
}

export type LearnerPatch = Partial<
  Pick<
    Learner,
    | "gender_branch"
    | "schedule_period"
    | "schedule_time"
    | "onboarding_step"
    | "onboarding_completed_at"
    | "pilot_start_date"
    | "awaiting_oops_report_since"
    | "awaiting_paysupport_request_since"
  >
>;

export interface LearnerStore {
  findByTelegramId(telegramUserId: number): Promise<Learner | null>;
  /**
   * Look up by the learner's own row id, not their Telegram id. Added for
   * Stage 5 (LDTKB-014)'s /refund flow: a purchases row only carries
   * learner_id (the internal uuid), so resolving the learner's
   * telegram_user_id to actually send them the refund-issued message (and
   * call refundStarPayment) needs this, not findByTelegramId.
   */
  findById(id: string): Promise<Learner | null>;
  create(telegramUserId: number): Promise<Learner>;
  update(id: string, patch: LearnerPatch): Promise<Learner>;
  /**
   * All learners with onboarding_step = 'complete' (uses the
   * idx_learners_due_for_delivery partial index). Added in Checkpoint 3 for
   * the delivery cron route — the onboarding flow itself (handleUpdate.ts)
   * never calls this; it only ever looks up a single learner by Telegram id.
   */
  listOnboarded(): Promise<Learner[]>;
}

export function supabaseLearnerStore(client: SupabaseClient): LearnerStore {
  return {
    async findByTelegramId(telegramUserId) {
      const { data, error } = await client
        .from("learners")
        .select("*")
        .eq("telegram_user_id", telegramUserId)
        .maybeSingle();
      if (error) throw error;
      return (data as Learner | null) ?? null;
    },

    async findById(id) {
      const { data, error } = await client.from("learners").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Learner | null) ?? null;
    },

    async create(telegramUserId) {
      const { data, error } = await client
        .from("learners")
        .insert({ telegram_user_id: telegramUserId })
        .select("*")
        .single();
      if (error) throw error;
      return data as Learner;
    },

    async update(id, patch) {
      const { data, error } = await client
        .from("learners")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Learner;
    },

    async listOnboarded() {
      const { data, error } = await client.from("learners").select("*").eq("onboarding_step", "complete");
      if (error) throw error;
      return (data as Learner[]) ?? [];
    },
  };
}
