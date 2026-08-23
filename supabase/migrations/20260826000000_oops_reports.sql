-- /oops issue reporting: pending-report tracking + permanent report storage.
--
-- Deliberately decoupled from onboarding_step — a learner can report an
-- issue whether onboarding is complete, in progress, or hasn't started.
-- The "pending" state is a single nullable timestamp on learners (mirrors
-- the existing single-flag-column style already used there for
-- onboarding), not a table, since it's ephemeral per-learner state with no
-- history worth keeping — once a report is captured (or /oops/​/start
-- clears it), the column just goes back to null. Actual report content
-- lives in its own table below, since — unlike day29_quest_progress's
-- single-row-per-learner guard — a learner can submit multiple reports
-- over time, and every one of them is kept permanently.

alter table learners
  add column awaiting_oops_report_since timestamptz;

comment on column learners.awaiting_oops_report_since is
  'Set when the learner sends /oops and we are waiting for their next message to be captured as the report. Null the rest of the time. Cleared (never stacked) on a repeated /oops, on /start, or once a report is captured.';

create table oops_reports (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners (id) on delete cascade,

  report_text text not null,

  created_at timestamptz not null default now()
);

comment on table oops_reports is
  'One row per /oops report a learner submits. NOT a single-row-per-learner guard (unlike day29_quest_progress) — a learner can submit multiple reports over time and every one is kept permanently.';

create index idx_oops_reports_learner_id on oops_reports (learner_id);

alter table oops_reports enable row level security;
