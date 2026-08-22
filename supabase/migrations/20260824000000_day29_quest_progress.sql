-- Day 29 living comic — Surprise Quest (page 9) persistence (Checkpoint 6,
-- LDTKB-049). Server-side, tied to learner_id, per LDTKB-049's rejection of
-- client-side-only (e.g. localStorage) state.
--
-- Row existence is the entire guard: a row is created only on the first
-- correct answer. Unlimited wrong attempts (per day29-living-comic-spec.md)
-- need no persistence at all, so no "attempts" column exists.

create table day29_quest_progress (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null unique references learners (id) on delete cascade,

  answered_correctly_at timestamptz not null default now(),

  created_at timestamptz not null default now()
);

comment on table day29_quest_progress is
  'One row per learner who has answered Day 29''s Surprise Quest correctly (LDTKB-049). Row existence alone is the "already answered, show completion message" guard — no row is ever created for a wrong attempt.';

alter table day29_quest_progress enable row level security;
