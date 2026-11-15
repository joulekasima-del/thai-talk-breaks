// Dedup guard for Telegram webhook updates, backed by
// processed_telegram_updates (supabase/migrations/20260825000000_processed_telegram_updates.sql).
// Same interface/Postgres-implementation split as learnerStore.ts, so the
// webhook route's dedup check can be unit-tested with an in-memory fake.

import type { Query } from "@/lib/db";

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

export function pgProcessedUpdatesStore(query: Query): ProcessedUpdatesStore {
  return {
    async tryMarkProcessed(updateId) {
      try {
        await query("INSERT INTO processed_telegram_updates (update_id) VALUES ($1)", [updateId]);
        return true;
      } catch (error) {
        if ((error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION) return false;
        throw error;
      }
    },
  };
}
