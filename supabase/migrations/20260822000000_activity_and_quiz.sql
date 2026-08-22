-- Thai Talk Breaks — activity-completion tracking + Day 30 quiz-ladder state
-- (Checkpoint 4: Activity Response Handling & Day 30 Quiz-Ladder)
--
-- Two additions, kept separate because they track genuinely different
-- things:
--   1. lesson_deliveries gets two new nullable columns for Lessons 2-7's
--      recognition-tap activity response (Checkpoint 3 built the guard for
--      the LESSON itself; this extends the same row for its ACTIVITY,
--      rather than a new table, since it's 1:1 with an existing delivery).
--   2. A new day30_quiz_progress table, since the quiz-ladder is a
--      fundamentally different shape: 10 sequential questions answered via
--      callback taps (like onboarding_step's progression, not a
--      once-per-day cron delivery), with a running score.

-- ---------------------------------------------------------------------------
-- lesson_deliveries: activity-response columns
-- ---------------------------------------------------------------------------

alter table lesson_deliveries
  add column activity_answered_at timestamptz,
  add column activity_correct boolean;

comment on column lesson_deliveries.activity_answered_at is
  'Set when the learner taps a recognition-tap activity button (Lessons 2-7 only; Lesson 1 has no activity). Null until answered.';
comment on column lesson_deliveries.activity_correct is
  'Whether the tapped button was the correct answer. Null until activity_answered_at is set.';

-- ---------------------------------------------------------------------------
-- day30_quiz_progress
-- ---------------------------------------------------------------------------
-- One row per learner, created when they first reach Day 30 (per the
-- day-window in dueLearners.ts). current_question_index tracks which of the
-- 10 fixed questions (day30-quiz-content.md) is currently awaiting an
-- answer; completed_at is the guard against re-starting or re-delivering
-- the quiz on a later cron tick, same spirit as lesson_deliveries' unique
-- constraint for Lessons 1-7.

create table day30_quiz_progress (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null unique references learners (id) on delete cascade,

  -- 1-10: which question is currently active (sent, awaiting a tap).
  current_question_index smallint not null default 1 check (current_question_index between 1 and 10),
  correct_count smallint not null default 0 check (correct_count between 0 and 10),

  started_at timestamptz not null default now(),
  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table day30_quiz_progress is
  'One row per learner attempting the Day 30 quiz-ladder (LDTKB-042/043). Row existence is the guard against re-starting the quiz on a later cron tick.';
comment on column day30_quiz_progress.current_question_index is
  'Which of the 10 fixed questions (day30-quiz-content.md) is currently awaiting an answer.';
comment on column day30_quiz_progress.completed_at is
  'Set once question 10 is answered and the score+badge completion message is sent. Null while in progress.';

create trigger day30_quiz_progress_set_updated_at
  before update on day30_quiz_progress
  for each row
  execute function set_updated_at();

alter table day30_quiz_progress enable row level security;
