// Access to day29_quest_progress (supabase/migrations/20260824000000_day29_quest_progress.sql).
// Row existence is the entire guard — see that migration's comment.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Day29QuestProgress {
  id: string;
  learner_id: string;
  answered_correctly_at: string;
}

export interface Day29QuestStore {
  findByLearner(learnerId: string): Promise<Day29QuestProgress | null>;
  markAnsweredCorrectly(learnerId: string, answeredAt: string): Promise<Day29QuestProgress>;
}

export function supabaseDay29QuestStore(client: SupabaseClient): Day29QuestStore {
  return {
    async findByLearner(learnerId) {
      const { data, error } = await client
        .from("day29_quest_progress")
        .select("*")
        .eq("learner_id", learnerId)
        .maybeSingle();
      if (error) throw error;
      return (data as Day29QuestProgress | null) ?? null;
    },

    async markAnsweredCorrectly(learnerId, answeredAt) {
      const { data, error } = await client
        .from("day29_quest_progress")
        .upsert({ learner_id: learnerId, answered_correctly_at: answeredAt }, { onConflict: "learner_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as Day29QuestProgress;
    },
  };
}
