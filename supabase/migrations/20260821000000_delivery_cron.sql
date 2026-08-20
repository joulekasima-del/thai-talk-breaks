-- Thai Talk Breaks — delivery cron (Checkpoint 3: Scheduler & Lesson Delivery)
--
-- Schedules a periodic call to the Vercel delivery endpoint via pg_net,
-- matching the German Breaks pattern referenced in LDTKB-037 /
-- CLAUDE_AI_HANDOFF.md Section 4. This migration produces code that would
-- run once deployed with real credentials — it does NOT create a live cron
-- job against a real project (no Supabase project exists in this
-- environment; this file has not been applied anywhere).
--
-- IMPORTANT — placeholders, not real values:
-- 'https://REPLACE_WITH_APP_URL/api/cron/deliver' and
-- 'REPLACE_WITH_CRON_SECRET' below are NOT real secrets and must be
-- replaced before this migration is actually run against a live Supabase
-- project. Do not hardcode the real CRON_SECRET into a checked-in migration
-- file (see AGENTS.md "Repository safety" — secrets must not be committed).
-- The standard Supabase pattern is to store the secret in Vault and read it
-- with vault.decrypted_secrets, or set it via
-- `alter database postgres set app.settings.cron_secret = '...'` through
-- the dashboard (never in a migration file) and read it with
-- current_setting('app.settings.cron_secret'). Swap the placeholder line
-- below for whichever approach is chosen at actual deploy time.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 15 minutes. See SCHEDULER.md "Cron interval and window" for the
-- full reasoning; in short: every valid schedule_time (LDTKB-034) is exactly
-- on the hour, so 15 minutes gives learners a maximum wait of up to 15
-- minutes past their exact chosen time before their lesson arrives — stated
-- here plainly as a real, non-exact-delivery trade-off, not hidden as if
-- delivery were precise to the minute. Supabase Postgres runs in UTC, and
-- pg_cron's minute fields are evaluated in the database's own timezone, so
-- '*/15 * * * *' ticks at UTC :00/:15/:30/:45 — which are also exactly
-- Bangkok (UTC+7) :00/:15/:30/:45, since a whole-hour offset never shifts
-- the minute component. See dueLearners.ts for the corresponding
-- application-side window logic (a 30-minute lookback, for tolerance
-- against one missed/delayed tick — safe to over-match because the
-- lesson_deliveries unique constraint is the actual duplicate-send guard).
select cron.schedule(
  'deliver-pilot-lessons',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://REPLACE_WITH_APP_URL/api/cron/deliver',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'REPLACE_WITH_CRON_SECRET'
    ),
    body := '{}'::jsonb
  );
  $$
);
