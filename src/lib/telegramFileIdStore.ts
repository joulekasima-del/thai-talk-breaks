import { queryOne, type Query } from "@/lib/db";
import type { FileIdCache } from "@/lib/telegram";

// Postgres-backed FileIdCache (table telegram_file_ids). One row per bot and
// media path. See supabase/migrations/20261113000000_telegram_file_ids.sql.

/** The bot's numeric id: the part of the token before ":" (null if the token has an unexpected shape). */
export function botIdFromToken(botToken: string): number | null {
  const id = Number(botToken.split(":")[0]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function pgFileIdCache(query: Query, botId: number): FileIdCache {
  return {
    async get(mediaPath) {
      return queryOne<string>(
        query,
        "select to_jsonb(file_id) as r from telegram_file_ids where bot_id = $1 and media_path = $2",
        [botId, mediaPath],
      );
    },
    async put(mediaPath, fileId) {
      await query(
        `insert into telegram_file_ids (bot_id, media_path, file_id) values ($1, $2, $3)
         on conflict (bot_id, media_path) do update set file_id = excluded.file_id, updated_at = now()`,
        [botId, mediaPath, fileId],
      );
    },
  };
}

/** A FileIdCache for this bot token, or undefined when the token gives no bot id (then every photo is uploaded). */
export function fileIdCacheForBot(query: Query, botToken: string): FileIdCache | undefined {
  const botId = botIdFromToken(botToken);
  return botId === null ? undefined : pgFileIdCache(query, botId);
}
