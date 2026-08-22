// Access to day30_quiz_progress (supabase/migrations/20260822000000_activity_and_quiz.sql).
// Row existence is the guard against re-starting the quiz on a later cron
// tick — same spirit as lesson_deliveries' unique constraint for Lessons 1-7.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface Day30QuizProgress {
  id: string;
  learner_id: string;
  current_question_index: number;
  correct_count: number;
  completed_at: string | null;
}

export interface Day30QuizStore {
  findByLearner(learnerId: string): Promise<Day30QuizProgress | null>;
  start(learnerId: string): Promise<Day30QuizProgress>;
  recordAnswer(id: string, correct: boolean): Promise<Day30QuizProgress>;
  advance(id: string, nextQuestionIndex: number): Promise<Day30QuizProgress>;
  complete(id: string, completedAt: string): Promise<Day30QuizProgress>;
}

export function supabaseDay30QuizStore(client: SupabaseClient): Day30QuizStore {
  return {
    async findByLearner(learnerId) {
      const { data, error } = await client
        .from("day30_quiz_progress")
        .select("*")
        .eq("learner_id", learnerId)
        .maybeSingle();
      if (error) throw error;
      return (data as Day30QuizProgress | null) ?? null;
    },

    async start(learnerId) {
      const { data, error } = await client
        .from("day30_quiz_progress")
        .insert({ learner_id: learnerId })
        .select("*")
        .single();
      if (error) throw error;
      return data as Day30QuizProgress;
    },

    async recordAnswer(id, correct) {
      const { data: current, error: fetchError } = await client
        .from("day30_quiz_progress")
        .select("correct_count")
        .eq("id", id)
        .single();
      if (fetchError) throw fetchError;

      const { data, error } = await client
        .from("day30_quiz_progress")
        .update({ correct_count: (current as { correct_count: number }).correct_count + (correct ? 1 : 0) })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Day30QuizProgress;
    },

    async advance(id, nextQuestionIndex) {
      const { data, error } = await client
        .from("day30_quiz_progress")
        .update({ current_question_index: nextQuestionIndex })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Day30QuizProgress;
    },

    async complete(id, completedAt) {
      const { data, error } = await client
        .from("day30_quiz_progress")
        .update({ completed_at: completedAt })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Day30QuizProgress;
    },
  };
}
