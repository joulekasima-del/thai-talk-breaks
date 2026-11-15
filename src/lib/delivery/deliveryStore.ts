// Access to the lesson_deliveries table (supabase/migrations/20260820000000_initial_schema.sql).
// This IS the duplicate-send guard: findExisting() before sending anything,
// insertTextSent() only after the text portion succeeds (before audio is
// attempted), markAudioSent() afterwards. Reuses the exact German Breaks
// text-before-audio pattern documented in ARCHITECTURE.md — see report item 5.

import { queryMany, queryOne, queryOneOrThrow, type Query } from "@/lib/db";

export interface DeliveryRecord {
  id: number;
  learner_id: string;
  lesson_number: number;
  delivery_date: string;
  delivered_at: string;
  audio_delivered_at: string | null;
  activity_answered_at: string | null;
  activity_correct: boolean | null;
}

export interface DeliveryStore {
  findExisting(learnerId: string, lessonNumber: number, deliveryDate: string): Promise<DeliveryRecord | null>;
  /** Inserts the row — this insert IS the guard, enforced by the table's unique constraint. */
  insertTextSent(learnerId: string, lessonNumber: number, deliveryDate: string, deliveredAt: string): Promise<DeliveryRecord>;
  markAudioSent(deliveryId: number, audioDeliveredAt: string): Promise<void>;
  /** All lesson_number values already delivered to this learner (any date) — for distractor selection. */
  listDeliveredLessonNumbers(learnerId: string): Promise<number[]>;
  /** Most recent delivery row for this learner/lesson that hasn't had its activity answered yet (Checkpoint 4). */
  findUnansweredActivity(learnerId: string, lessonNumber: number): Promise<DeliveryRecord | null>;
  markActivityAnswered(deliveryId: number, correct: boolean, answeredAt: string): Promise<void>;
}

export function pgDeliveryStore(query: Query): DeliveryStore {
  return {
    async findExisting(learnerId, lessonNumber, deliveryDate) {
      return queryOne<DeliveryRecord>(
        query,
        "SELECT to_jsonb(d) AS r FROM lesson_deliveries d WHERE learner_id = $1 AND lesson_number = $2 AND delivery_date = $3",
        [learnerId, lessonNumber, deliveryDate],
      );
    },

    async insertTextSent(learnerId, lessonNumber, deliveryDate, deliveredAt) {
      return queryOneOrThrow<DeliveryRecord>(
        query,
        "INSERT INTO lesson_deliveries (learner_id, lesson_number, delivery_date, delivered_at) VALUES ($1, $2, $3, $4) RETURNING to_jsonb(lesson_deliveries) AS r",
        [learnerId, lessonNumber, deliveryDate, deliveredAt],
      );
    },

    async markAudioSent(deliveryId, audioDeliveredAt) {
      await query("UPDATE lesson_deliveries SET audio_delivered_at = $2 WHERE id = $1", [deliveryId, audioDeliveredAt]);
    },

    async listDeliveredLessonNumbers(learnerId) {
      const rows = await queryMany<{ lesson_number: number }>(
        query,
        "SELECT jsonb_build_object('lesson_number', lesson_number) AS r FROM lesson_deliveries WHERE learner_id = $1",
        [learnerId],
      );
      return rows.map((row) => row.lesson_number);
    },

    async findUnansweredActivity(learnerId, lessonNumber) {
      return queryOne<DeliveryRecord>(
        query,
        "SELECT to_jsonb(d) AS r FROM lesson_deliveries d WHERE learner_id = $1 AND lesson_number = $2 AND activity_answered_at IS NULL ORDER BY delivered_at DESC LIMIT 1",
        [learnerId, lessonNumber],
      );
    },

    async markActivityAnswered(deliveryId, correct, answeredAt) {
      await query("UPDATE lesson_deliveries SET activity_answered_at = $2, activity_correct = $3 WHERE id = $1", [
        deliveryId,
        answeredAt,
        correct,
      ]);
    },
  };
}

/**
 * One query: "learner_id:lesson_number" for every delivery row dated `deliveryDate`.
 * Lets the cron run skip learners already served today without a query each.
 */
export async function listDeliveryKeysOn(query: Query, deliveryDate: string): Promise<Set<string>> {
  const rows = await queryMany<{ k: string }>(
    query,
    "SELECT jsonb_build_object('k', learner_id::text || ':' || lesson_number::text) AS r FROM lesson_deliveries WHERE delivery_date = $1",
    [deliveryDate],
  );
  return new Set(rows.map((row) => row.k));
}
