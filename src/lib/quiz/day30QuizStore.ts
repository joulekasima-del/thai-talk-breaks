// Access to day30_quiz_progress (supabase/migrations/20260822000000_activity_and_quiz.sql).
// Row existence is the guard against re-starting the quiz on a later cron
// tick — same spirit as lesson_deliveries' unique constraint for Lessons 1-7.

import { queryOne, queryOneOrThrow, type Query } from "@/lib/db";

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

export function pgDay30QuizStore(query: Query): Day30QuizStore {
  return {
    async findByLearner(learnerId) {
      return queryOne<Day30QuizProgress>(
        query,
        "SELECT to_jsonb(q) AS r FROM day30_quiz_progress q WHERE learner_id = $1",
        [learnerId],
      );
    },

    async start(learnerId) {
      return queryOneOrThrow<Day30QuizProgress>(
        query,
        "INSERT INTO day30_quiz_progress (learner_id) VALUES ($1) RETURNING to_jsonb(day30_quiz_progress) AS r",
        [learnerId],
      );
    },

    async recordAnswer(id, correct) {
      // One atomic statement instead of read-then-write, so two answers
      // arriving together can't lose an increment.
      return queryOneOrThrow<Day30QuizProgress>(
        query,
        "UPDATE day30_quiz_progress SET correct_count = correct_count + $2 WHERE id = $1 RETURNING to_jsonb(day30_quiz_progress) AS r",
        [id, correct ? 1 : 0],
      );
    },

    async advance(id, nextQuestionIndex) {
      return queryOneOrThrow<Day30QuizProgress>(
        query,
        "UPDATE day30_quiz_progress SET current_question_index = $2 WHERE id = $1 RETURNING to_jsonb(day30_quiz_progress) AS r",
        [id, nextQuestionIndex],
      );
    },

    async complete(id, completedAt) {
      return queryOneOrThrow<Day30QuizProgress>(
        query,
        "UPDATE day30_quiz_progress SET completed_at = $2 WHERE id = $1 RETURNING to_jsonb(day30_quiz_progress) AS r",
        [id, completedAt],
      );
    },
  };
}
