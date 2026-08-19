import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side only. Uses the service role key, which bypasses Row Level
// Security (ARCHITECTURE.md "Row Level Security") — never import this from
// client-rendered code.
export function createSupabaseServerClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
