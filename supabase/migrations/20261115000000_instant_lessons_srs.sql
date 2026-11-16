-- Instant-gratification redesign (proposed 15 November 2026, see
-- LOCKED_DECISIONS.md "Proposed — instant lessons and spaced repetition").
--
-- 1. Lean, interactive onboarding: the learner's name and a four-question
--    survey are asked before Lesson 1, which then starts immediately. The
--    reminder time is asked after Lesson 1, not before it.
-- 2. Progress-based lessons: a learner can tap "Next lesson" at any time, so
--    the lesson a learner is on is a counter (next_lesson_number), not a day
--    count from pilot_start_date. The scheduled time becomes a daily reminder.
-- 3. Spaced repetition: every word or phrase taught becomes a card. A card is
--    asked again in each of the next 4 sessions (learning), then on an
--    Anki-style (SM-2) growing day interval (review). See src/lib/srs/.
--
-- Additive only, per this repo's migration convention.

-- New onboarding steps. Not used anywhere in this migration (a new enum value
-- can't be used in the same transaction that adds it); the app's create()
-- inserts 'name_pending' explicitly.
alter type onboarding_step add value if not exists 'name_pending';
alter type onboarding_step add value if not exists 'survey_location_pending';
alter type onboarding_step add value if not exists 'survey_level_pending';
alter type onboarding_step add value if not exists 'survey_reason_pending';
alter type onboarding_step add value if not exists 'survey_source_pending';
alter type onboarding_step add value if not exists 'first_lesson';

alter table learners
  add column display_name text,
  add column survey_location text,
  add column survey_level text,
  add column survey_reason text,
  add column survey_source text,
  add column next_lesson_number smallint not null default 1,
  add column last_session_date date;

comment on column learners.display_name is 'What the learner asked to be called (typed, or their Telegram first name). Max 40 chars.';
comment on column learners.next_lesson_number is 'The lesson the learner''s next session teaches (1-30; 31 = course finished). Advanced when a session that taught a lesson finishes.';
comment on column learners.last_session_date is 'Thailand calendar date the learner last started a session. The daily reminder skips learners who already had one today.';

-- Learners who were already mid-course under the old date-based schedule
-- carry on from the lesson after the last one they received.
update learners l
set next_lesson_number = least(31, coalesce((select max(d.lesson_number) from lesson_deliveries d where d.learner_id = l.id), 0) + 1);

-- One card per (learner, word/phrase).
create table srs_cards (
  learner_id uuid not null references learners (id) on delete cascade,
  item_key text not null,
  lesson_number smallint not null,
  phase text not null default 'learning' check (phase in ('learning', 'review')),
  -- Consecutive correct answers in a row while learning; 4 graduates the card.
  streak smallint not null default 0,
  ease real not null default 2.5,
  interval_days integer not null default 0,
  due_date date,
  reps integer not null default 0,
  lapses integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (learner_id, item_key)
);

-- One row per session: optional reviews, then (optionally) one new lesson.
create table learning_sessions (
  id bigserial primary key,
  learner_id uuid not null references learners (id) on delete cascade,
  lesson_number smallint,
  lesson_delivered boolean not null default false,
  status text not null default 'active' check (status in ('active', 'done')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- At most one session in progress per learner (a double tap on "Next lesson"
-- can't start two).
create unique index learning_sessions_one_active on learning_sessions (learner_id) where status = 'active';

-- Every multiple-choice question asked, with the learner's answer.
create table quiz_prompts (
  id bigserial primary key,
  session_id bigint not null references learning_sessions (id) on delete cascade,
  learner_id uuid not null references learners (id) on delete cascade,
  seq smallint not null,
  item_key text not null,
  kind text not null check (kind in ('review', 'new')),
  direction text not null check (direction in ('th_en', 'en_th')),
  question text not null,
  options jsonb not null,
  correct_index smallint not null,
  sent_at timestamptz,
  answered_at timestamptz,
  chosen_index smallint,
  correct boolean,
  unique (session_id, seq)
);

alter table srs_cards enable row level security;
alter table learning_sessions enable row level security;
alter table quiz_prompts enable row level security;
