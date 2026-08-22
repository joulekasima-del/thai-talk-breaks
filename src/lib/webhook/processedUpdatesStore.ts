// Dedup guard for Telegram webhook updates, backed by
// processed_telegram_updates (supabase/migrations/20260825000000_processed_telegram_updates.sql).
// Same interface/supabase-implementation split as learnerStore.ts, so the
// webhook route's dedup check can be unit-tested with an in-memory fake.

import type { SupabaseClient } from "@supabase/supabase-js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export interface ProcessedUpdatesStore {
  /**
   * Attempts to record `updateId` as processed. Returns true the first time
   * (caller should proceed with normal processing), false if a row already
   * exists for it (a Telegram retry of an update already handled — caller
   * must skip all processing and still return 200 OK).
   */
  tryMarkProcessed(updateId: number): Promise<boolean>;
}

export function supabaseProcessedUpdatesStore(client: SupabaseClient): ProcessedUpdatesStore {
  return {
    async tryMarkProcessed(updateId) {
      const { error } = await client.from("processed_telegram_updates").insert({ update_id: updateId });
      if (!error) return true;
      if (error.code === POSTGRES_UNIQUE_VIOLATION) return false;
      throw error;
    },
  };
}
