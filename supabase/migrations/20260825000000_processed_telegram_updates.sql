-- Hotfix: Telegram webhook update deduplication.
--
-- Telegram retries webhook delivery of the same update_id if it doesn't get
-- a timely 200 OK (documented behavior, not a bug in Telegram). Found in
-- production: a slow Vercel cold-start response caused a retried /start
-- update to be processed twice, sending the gender-question message twice
-- to a real learner. Row existence in this table is the entire guard — the
-- webhook route inserts update_id before doing anything else; a
-- unique-constraint conflict means "already processed this one, skip it."

create table processed_telegram_updates (
  update_id bigint primary key,
  processed_at timestamptz not null default now()
);

comment on table processed_telegram_updates is
  'One row per Telegram update_id already processed by the webhook route. Row existence (via the primary key''s unique-constraint conflict) is the dedup guard against Telegram''s documented retry-on-slow-response behavior.';

alter table processed_telegram_updates enable row level security;
