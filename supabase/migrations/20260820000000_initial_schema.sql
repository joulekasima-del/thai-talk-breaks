-- Thai Talk Breaks — initial schema (Checkpoint 1: Technical Foundation)
--
-- Scope: multi-learner Telegram onboarding state + 7-day pilot lesson delivery
-- tracking (LDTKB-013). No payment, curriculum-content, or 30-day paid-product
-- tables here — those are future stages (BUILD_TRACKER.md Stages 5 and 8).
--
-- Architecture: Supabase Postgres + pg_cron (LDTKB-037). This migration defines
-- tables and indexes only; scheduling logic itself is Checkpoint 3 scope.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- learners
-- ---------------------------------------------------------------------------
-- One row per Telegram user who has started onboarding (/start). Columns that
-- are only known partway through onboarding (gender_branch, schedule_period,
-- schedule_time) are nullable and populated progressively; onboarding_step
-- tracks how far a learner has gotten. Application logic (Checkpoint 2) is
-- responsible for enforcing the actual conversation order — this schema only
-- records state, it does not enforce flow sequencing.

create type gender_branch as enum ('male', 'female');
-- LDTKB-024: krap/kha branch for the learner's own lesson practice content.
-- Independent of the bot's fixed narrator voice (LDTKB-030), which is not
-- learner-specific and therefore not stored per learner.

create type schedule_period as enum ('morning', 'afternoon', 'evening');
-- LDTKB-034 step 1 (period) and step 2 (specific time) are both stored, per
-- the checkpoint spec, even though schedule_time alone is sufficient to
-- schedule delivery — period is kept for onboarding-analytics/debugging value.

create type onboarding_step as enum (
  'gender_pending',
  'schedule_period_pending',
  'schedule_time_pending',
  'complete'
);
-- Reflects the locked six-step onboarding flow (onboarding/onboarding-complete.md):
-- welcome + notification-test + onboarding-complete are all sent automatically
-- with no gate (LDTKB-028) and therefore need no dedicated "awaiting" state —
-- only the three learner-input steps (gender, period, time) do.

create table learners (
  id uuid primary key default gen_random_uuid(),

  -- Telegram's user id. For a private 1:1 bot chat, chat_id == user_id, so
  -- this single column serves both "who is this" and "where do I send to".
  telegram_user_id bigint not null unique,

  gender_branch gender_branch,
  schedule_period schedule_period,
  schedule_time time,

  onboarding_step onboarding_step not null default 'gender_pending',
  onboarding_completed_at timestamptz,

  -- Calendar date (Thailand time) lesson 1 is scheduled to go out. Populated
  -- once onboarding completes; pg_cron (Checkpoint 3) uses this to compute
  -- which of the 7 pilot lessons a learner is due for on a given day.
  pilot_start_date date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table learners is
  'One row per Telegram learner. Multi-learner by design (LDTKB-037) — unlike German Breaks single-user model.';
comment on column learners.gender_branch is
  'LDTKB-024 krap/kha branch for the learner''s own practice content. Null until the gender question is answered.';
comment on column learners.schedule_time is
  'Thailand local wall-clock time (UTC+7), one of the fixed slots in LDTKB-034. Null until schedule selection completes.';
comment on column learners.pilot_start_date is
  'Date (Thailand time) of the learner''s first scheduled lesson. Null until onboarding completes.';

create index idx_learners_due_for_delivery
  on learners (schedule_time)
  where onboarding_step = 'complete';
-- Partial index: pg_cron's delivery query only ever cares about fully
-- onboarded learners, matched against the current Thailand wall-clock time.

-- Keep updated_at current on every row change.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger learners_set_updated_at
  before update on learners
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- lesson_deliveries
-- ---------------------------------------------------------------------------
-- One row per (learner, lesson, day) successfully delivered. A row is only
-- inserted once the text portion of a lesson has actually been sent — this
-- is the German Breaks duplicate-send guard pattern (CLAUDE_AI_HANDOFF.md
-- Section 4: "Text should be recorded as successfully sent before optional
-- audio is attempted, preventing duplicate lessons after an audio failure"),
-- reused rather than reinvented, per this checkpoint's brief.
--
-- delivered_at marks that guard point (text sent). audio_delivered_at is a
-- separate, nullable timestamp so an audio-send failure/retry never causes
-- a duplicate text send: the unique constraint below is what Checkpoint 3's
-- scheduler checks before attempting a send at all.

create table lesson_deliveries (
  id bigserial primary key,
  learner_id uuid not null references learners (id) on delete cascade,

  -- 1-7: the 7-day pilot only (LDTKB-013). Not the future 30-day curriculum.
  lesson_number smallint not null check (lesson_number between 1 and 7),

  -- Calendar date (Thailand time) this delivery belongs to.
  delivery_date date not null,

  delivered_at timestamptz not null,
  audio_delivered_at timestamptz,

  created_at timestamptz not null default now(),

  unique (learner_id, lesson_number, delivery_date)
);

comment on table lesson_deliveries is
  'Append-only delivery log. Row existence + the unique constraint is the duplicate-send guard, reused from the German Breaks pattern.';
comment on column lesson_deliveries.delivered_at is
  'Set when the lesson text portion is confirmed sent — this is the guard point, not overall lesson completion.';
comment on column lesson_deliveries.audio_delivered_at is
  'Set separately once native audio sends, so an audio failure cannot cause a duplicate text send.';

create index idx_lesson_deliveries_learner_id on lesson_deliveries (learner_id);
create index idx_lesson_deliveries_delivery_date on lesson_deliveries (delivery_date);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Both tables are only ever touched by the server (webhook handler, pg_cron
-- job) using the Supabase service role key, which bypasses RLS. RLS is
-- enabled anyway with no policies, so any future anon/authenticated-key
-- access is denied by default rather than silently allowed.

alter table learners enable row level security;
alter table lesson_deliveries enable row level security;
