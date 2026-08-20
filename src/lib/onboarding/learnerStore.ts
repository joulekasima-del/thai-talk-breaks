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
  >
>;

export interface LearnerStore {
  findByTelegramId(telegramUserId: number): Promise<Learner | null>;
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
