// Access to the lesson_deliveries table (supabase/migrations/20260820000000_initial_schema.sql).
// This IS the duplicate-send guard: findExisting() before sending anything,
// insertTextSent() only after the text portion succeeds (before audio is
// attempted), markAudioSent() afterwards. Reuses the exact German Breaks
// text-before-audio pattern documented in ARCHITECTURE.md — see report item 5.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface DeliveryRecord {
  id: number;
  learner_id: string;
  lesson_number: number;
  delivery_date: string;
  delivered_at: string;
  audio_delivered_at: string | null;
}

export interface DeliveryStore {
  findExisting(learnerId: string, lessonNumber: number, deliveryDate: string): Promise<DeliveryRecord | null>;
  /** Inserts the row — this insert IS the guard, enforced by the table's unique constraint. */
  insertTextSent(learnerId: string, lessonNumber: number, deliveryDate: string, deliveredAt: string): Promise<DeliveryRecord>;
  markAudioSent(deliveryId: number, audioDeliveredAt: string): Promise<void>;
  /** All lesson_number values already delivered to this learner (any date) — for distractor selection. */
  listDeliveredLessonNumbers(learnerId: string): Promise<number[]>;
}

export function supabaseDeliveryStore(client: SupabaseClient): DeliveryStore {
  return {
    async findExisting(learnerId, lessonNumber, deliveryDate) {
      const { data, error } = await client
        .from("lesson_deliveries")
        .select("*")
        .eq("learner_id", learnerId)
        .eq("lesson_number", lessonNumber)
        .eq("delivery_date", deliveryDate)
        .maybeSingle();
      if (error) throw error;
      return (data as DeliveryRecord | null) ?? null;
    },

    async insertTextSent(learnerId, lessonNumber, deliveryDate, deliveredAt) {
      const { data, error } = await client
        .from("lesson_deliveries")
        .insert({
          learner_id: learnerId,
          lesson_number: lessonNumber,
          delivery_date: deliveryDate,
          delivered_at: deliveredAt,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as DeliveryRecord;
    },

    async markAudioSent(deliveryId, audioDeliveredAt) {
      const { error } = await client
        .from("lesson_deliveries")
        .update({ audio_delivered_at: audioDeliveredAt })
        .eq("id", deliveryId);
      if (error) throw error;
    },

    async listDeliveredLessonNumbers(learnerId) {
      const { data, error } = await client
        .from("lesson_deliveries")
        .select("lesson_number")
        .eq("learner_id", learnerId);
      if (error) throw error;
      return (data as { lesson_number: number }[]).map((row) => row.lesson_number);
    },
  };
}
