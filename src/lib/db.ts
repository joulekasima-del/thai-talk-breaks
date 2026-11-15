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

// Server-side only. DATABASE_URL is the pooled Neon connection string.
export function createDbQuery(): Query {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set");
  }
  const sql = neon(url);
  return async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[];
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
