import { neon } from "@neondatabase/serverless";

// Postgres access for the whole app: a single `Query` function that runs one
// parameterised SQL statement and returns its rows. The stores (learnerStore.ts
// and friends) are written against this type, not against a driver, so tests can
// run the real SQL against an in-process Postgres (see tests/pgStores.test.ts)
// and the production implementation below can use Neon's HTTP driver, which
// works on serverless runtimes such as Cloudflare Workers.
//
// Convention: every statement returns its row as one JSON column named `r`
// (`SELECT to_jsonb(t) AS r ...`, `RETURNING to_jsonb(t) AS r`). to_jsonb gives
// the same shapes the app already expects: bigint as a JS number, timestamps as
// ISO-8601 strings, dates as "YYYY-MM-DD", time as "HH:MM:SS".
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

// Neon's HTTP endpoint fails occasionally — about 4 of the ~1440 daily cron runs
// (0.3%) died on their very first query with `NeonDbError: Server error (HTTP
// status 520)`, observed in the Worker logs on 2026-11-15. Nothing is lost when
// that happens (the next minute's run retries, and lesson_deliveries' unique
// constraint stops a double send), but a run that dies does no work at all, so
// one short retry removes almost all of them.
//
// Only read-only statements are retried. A retry is safe only when running the
// statement twice is the same as running it once, and that is NOT true of every
// write here: day30QuizStore's `correct_count + $2` would double-count, and a
// retried lesson_deliveries insert whose first attempt actually succeeded would
// hit the unique constraint. A transport error gives no way to tell whether the
// statement ran, so writes are left alone and keep failing fast as before.

const RETRY_DELAYS_MS = [150, 500];

/** A statement that only reads, and so can be repeated safely. */
export function isReadOnlyStatement(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed.startsWith("select") && !trimmed.startsWith("with")) return false;
  // A CTE can still write (`with d as (delete ... )`), and so can SELECT ... FOR
  // UPDATE; anything carrying a write keyword is treated as a write.
  return !/\b(insert|update|delete|upsert|for\s+update|for\s+no\s+key\s+update|returning)\b/.test(trimmed);
}

/**
 * Transport-level failure (Neon unreachable, 5xx from its endpoint) rather than
 * the database rejecting the statement. A rejected statement — bad SQL, a
 * constraint violation — fails the same way every time, so retrying it only
 * wastes the run.
 */
export function isTransientDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/\bHTTP status 5\d\d\b/.test(message)) return true;
  return /fetch failed|network|socket hang up|terminated|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a runner so a read-only statement that fails on transport is tried
 * again. Exported for tests; createDbQuery() below is the production caller.
 */
export function withDbRetry(
  run: (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>,
  delaysMs: number[] = RETRY_DELAYS_MS,
): Query {
  return async (text, params = []) => {
    const retryable = isReadOnlyStatement(text);
    let attempt = 0;
    for (;;) {
      try {
        return await run(text, params);
      } catch (error) {
        if (!retryable || attempt >= delaysMs.length || !isTransientDbError(error)) throw error;
        await sleep(delaysMs[attempt]);
        attempt += 1;
      }
    }
  };
}

// Server-side only. DATABASE_URL is the pooled Neon connection string.
export function createDbQuery(): Query {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set");
  }
  const sql = neon(url);
  return withDbRetry(async (text, params) => (await sql.query(text, params)) as Record<string, unknown>[]);
}

/** First row's `r` column, or null when the statement returned no rows (replaces supabase `.maybeSingle()`). */
export async function queryOne<T>(query: Query, text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query(text, params);
  return rows.length === 0 ? null : (rows[0].r as T);
}

/** Like queryOne, but a missing row is an error (replaces supabase `.single()`). */
export async function queryOneOrThrow<T>(query: Query, text: string, params: unknown[] = []): Promise<T> {
  const row = await queryOne<T>(query, text, params);
  if (row === null) throw new Error("Expected one row but the query returned none");
  return row;
}

export async function queryMany<T>(query: Query, text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await query(text, params);
  return rows.map((row) => row.r as T);
}
