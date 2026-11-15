// Persistence for spaced repetition: srs_cards, learning_sessions and
// quiz_prompts (supabase/migrations/20261115000000_instant_lessons_srs.sql).
// Interface + Postgres implementation, same pattern as learnerStore.ts.

import { queryMany, queryOne, queryOneOrThrow, type Query } from "@/lib/db";
import type { SrsCard } from "@/lib/srs/scheduler";
import type { QuizDirection } from "@/lib/srs/items";

export interface LearningSession {
  id: number;
  learner_id: string;
  lesson_number: number | null;
  lesson_delivered: boolean;
  status: "active" | "done";
}

export interface QuizPrompt {
  id: number;
  session_id: number;
  learner_id: string;
  seq: number;
  item_key: string;
  kind: "review" | "new";
  direction: QuizDirection;
  question: string;
  options: string[];
  correct_index: number;
  sent_at: string | null;
  answered_at: string | null;
  chosen_index: number | null;
  correct: boolean | null;
}

export type NewQuizPrompt = Pick<QuizPrompt, "item_key" | "kind" | "direction" | "question" | "options" | "correct_index">;

export interface SrsStore {
  listCards(learnerId: string): Promise<SrsCard[]>;
  getCard(learnerId: string, itemKey: string): Promise<SrsCard | null>;
  /** Inserts cards that don't exist yet; existing ones are left untouched. */
  addCards(cards: SrsCard[]): Promise<void>;
  saveCard(card: SrsCard): Promise<void>;
  countCards(learnerId: string): Promise<number>;

  findActiveSession(learnerId: string): Promise<LearningSession | null>;
  /** Null if the learner already has an active session (unique index). */
  createSession(learnerId: string, lessonNumber: number | null): Promise<LearningSession | null>;
  markLessonDelivered(sessionId: number): Promise<void>;
  finishSession(sessionId: number, finishedAt: string): Promise<void>;

  /** Appends prompts after the session's existing ones, keeping their order. */
  addPrompts(sessionId: number, learnerId: string, prompts: NewQuizPrompt[]): Promise<void>;
  listPrompts(sessionId: number): Promise<QuizPrompt[]>;
  getPrompt(promptId: number): Promise<QuizPrompt | null>;
  markPromptSent(promptId: number, sentAt: string): Promise<void>;
  /** Records the answer once; null if it was already answered (a double tap). */
  answerPrompt(promptId: number, chosenIndex: number, correct: boolean, answeredAt: string): Promise<QuizPrompt | null>;
}

function cardFromRow(row: SrsCard): SrsCard {
  return { ...row, ease: Number(row.ease) };
}

export function pgSrsStore(query: Query): SrsStore {
  return {
    async listCards(learnerId) {
      const rows = await queryMany<SrsCard>(query, "SELECT to_jsonb(c) AS r FROM srs_cards c WHERE learner_id = $1", [learnerId]);
      return rows.map(cardFromRow);
    },

    async getCard(learnerId, itemKey) {
      const row = await queryOne<SrsCard>(query, "SELECT to_jsonb(c) AS r FROM srs_cards c WHERE learner_id = $1 AND item_key = $2", [
        learnerId,
        itemKey,
      ]);
      return row ? cardFromRow(row) : null;
    },

    async addCards(cards) {
      if (cards.length === 0) return;
      const params: unknown[] = [];
      const values = cards.map((card, i) => {
        params.push(card.learner_id, card.item_key, card.lesson_number);
        return `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`;
      });
      await query(
        `INSERT INTO srs_cards (learner_id, item_key, lesson_number) VALUES ${values.join(", ")} ON CONFLICT (learner_id, item_key) DO NOTHING`,
        params,
      );
    },

    async saveCard(card) {
      await query(
        `UPDATE srs_cards SET phase = $3, streak = $4, ease = $5, interval_days = $6, due_date = $7, reps = $8, lapses = $9, updated_at = now()
         WHERE learner_id = $1 AND item_key = $2`,
        [card.learner_id, card.item_key, card.phase, card.streak, card.ease, card.interval_days, card.due_date, card.reps, card.lapses],
      );
    },

    async countCards(learnerId) {
      const row = await queryOneOrThrow<{ n: number }>(
        query,
        "SELECT jsonb_build_object('n', count(*)) AS r FROM srs_cards WHERE learner_id = $1",
        [learnerId],
      );
      return Number(row.n);
    },

    async findActiveSession(learnerId) {
      return queryOne<LearningSession>(
        query,
        "SELECT to_jsonb(s) AS r FROM learning_sessions s WHERE learner_id = $1 AND status = 'active'",
        [learnerId],
      );
    },

    async createSession(learnerId, lessonNumber) {
      return queryOne<LearningSession>(
        query,
        `INSERT INTO learning_sessions (learner_id, lesson_number) VALUES ($1, $2)
         ON CONFLICT (learner_id) WHERE status = 'active' DO NOTHING
         RETURNING to_jsonb(learning_sessions) AS r`,
        [learnerId, lessonNumber],
      );
    },

    async markLessonDelivered(sessionId) {
      await query("UPDATE learning_sessions SET lesson_delivered = true WHERE id = $1", [sessionId]);
    },

    async finishSession(sessionId, finishedAt) {
      await query("UPDATE learning_sessions SET status = 'done', finished_at = $2 WHERE id = $1", [sessionId, finishedAt]);
    },

    async addPrompts(sessionId, learnerId, prompts) {
      if (prompts.length === 0) return;
      const params: unknown[] = [sessionId, learnerId];
      const values = prompts.map((p, i) => {
        const base = params.length;
        params.push(p.item_key, p.kind, p.direction, p.question, JSON.stringify(p.options), p.correct_index);
        return `($1, $2, (SELECT coalesce(max(seq), 0) FROM quiz_prompts WHERE session_id = $1) + ${i + 1}, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6})`;
      });
      await query(
        `INSERT INTO quiz_prompts (session_id, learner_id, seq, item_key, kind, direction, question, options, correct_index) VALUES ${values.join(", ")}`,
        params,
      );
    },

    async listPrompts(sessionId) {
      return queryMany<QuizPrompt>(query, "SELECT to_jsonb(p) AS r FROM quiz_prompts p WHERE session_id = $1 ORDER BY seq", [sessionId]);
    },

    async getPrompt(promptId) {
      return queryOne<QuizPrompt>(query, "SELECT to_jsonb(p) AS r FROM quiz_prompts p WHERE id = $1", [promptId]);
    },

    async markPromptSent(promptId, sentAt) {
      await query("UPDATE quiz_prompts SET sent_at = $2 WHERE id = $1", [promptId, sentAt]);
    },

    async answerPrompt(promptId, chosenIndex, correct, answeredAt) {
      return queryOne<QuizPrompt>(
        query,
        `UPDATE quiz_prompts SET chosen_index = $2, correct = $3, answered_at = $4
         WHERE id = $1 AND answered_at IS NULL RETURNING to_jsonb(quiz_prompts) AS r`,
        [promptId, chosenIndex, correct, answeredAt],
      );
    },
  };
}
