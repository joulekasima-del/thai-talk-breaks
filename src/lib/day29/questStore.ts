// Access to day29_quest_progress (supabase/migrations/20260824000000_day29_quest_progress.sql).
// Row existence is the entire guard — see that migration's comment.

import { queryOne, queryOneOrThrow, type Query } from "@/lib/db";

export interface Day29QuestProgress {
  id: string;
  learner_id: string;
  answered_correctly_at: string;
}

export interface Day29QuestStore {
  findByLearner(learnerId: string): Promise<Day29QuestProgress | null>;
  markAnsweredCorrectly(learnerId: string, answeredAt: string): Promise<Day29QuestProgress>;
}

export function pgDay29QuestStore(query: Query): Day29QuestStore {
  return {
    async findByLearner(learnerId) {
      return queryOne<Day29QuestProgress>(
        query,
        "SELECT to_jsonb(q) AS r FROM day29_quest_progress q WHERE learner_id = $1",
        [learnerId],
      );
    },

    async markAnsweredCorrectly(learnerId, answeredAt) {
      return queryOneOrThrow<Day29QuestProgress>(
        query,
        "INSERT INTO day29_quest_progress (learner_id, answered_correctly_at) VALUES ($1, $2) ON CONFLICT (learner_id) DO UPDATE SET answered_correctly_at = EXCLUDED.answered_correctly_at RETURNING to_jsonb(day29_quest_progress) AS r",
        [learnerId, answeredAt],
      );
    },
  };
}
