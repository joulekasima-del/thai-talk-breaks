# Thai Talk Breaks — Architecture

**Status:** Checkpoint 1 (Technical Foundation) — infrastructure only.
**Scope note:** This document describes the application scaffold and database
schema built in this checkpoint. It does not describe Telegram webhook/bot
logic (Checkpoint 2) or the pg_cron delivery scheduler (Checkpoint 3) —
neither exists yet.

## Stack

Vercel (hosting) + Next.js (App Router, TypeScript) + Supabase Postgres
(database) + pg_cron (scheduling), per LDTKB-037. Fresh build, not a fork of
the German Breaks codebase; designed multi-learner from day one, unlike
German Breaks' single-user design.

## Database schema

Defined in [`supabase/migrations/20260820000000_initial_schema.sql`](supabase/migrations/20260820000000_initial_schema.sql).

### `learners`

One row per Telegram user who has sent `/start`. Tracks onboarding progress
and the resulting configuration once onboarding is complete.

| Column | Purpose |
|---|---|
| `id` | Internal primary key (UUID). |
| `telegram_user_id` | Telegram's user id. For a private bot chat, `chat_id == user_id`, so this one column is enough to both identify a learner and address messages to them. |
| `gender_branch` | `male` / `female` — the krap/kha branch for the learner's *own* practice content (LDTKB-024). Null until the gender question (onboarding step 2, `onboarding/gender-question.md`, LDTKB-033) is answered. Distinct from the bot's own narrator voice, which is fixed female (LDTKB-030) and not learner-specific, so it isn't stored here. |
| `schedule_period` / `schedule_time` | Both the period (`morning`/`afternoon`/`evening`) and the specific time chosen in the two-step schedule flow (`onboarding/schedule-selection.md`, LDTKB-034) are stored, in Thailand local time (UTC+7). `schedule_time` alone is sufficient to schedule delivery; `schedule_period` is kept because the checkpoint brief asked for both, and it's cheap onboarding-analytics/debugging value. |
| `onboarding_step` | Where the learner is in the six-step onboarding flow (`onboarding/onboarding-complete.md`). Only the three learner-input steps get a state: `gender_pending` → `schedule_period_pending` → `schedule_time_pending` → `complete`. The welcome message, notification test, and onboarding-complete message are all sent automatically with no gate (LDTKB-028), so they don't need their own state. |
| `onboarding_completed_at` | Set when `onboarding_step` reaches `complete`. |
| `pilot_start_date` | Calendar date (Thailand time) of the learner's first scheduled lesson. Null until onboarding completes. Checkpoint 3's scheduler will use this plus `schedule_time` to compute which of the 7 pilot lessons (LDTKB-013) a learner is due for on a given day (`lesson_number = today − pilot_start_date + 1`, capped at 7). |
| `created_at` / `updated_at` | Standard timestamps; `updated_at` is kept current by a trigger. |

An intentionally minimal set of Telegram fields: no name, username, or other
personal Telegram profile data is stored, since none of it is needed to
operate the bot (sending only requires `telegram_user_id`) and storing it
would sit close to — though is not the same as — the participant-PII
categories `DOCUMENTATION_INDEX.md`'s "Repository safety" section warns
against committing to the *repository*. This is runtime database data, not a
git commit, but the minimal-collection instinct still applies.

**Deliberately excluded from this checkpoint's schema:** any payment,
checkout, or Star-transaction fields (LDTKB-014, Stage 5) — those belong to a
later stage and would be guessing at a schema for a decision that hasn't been
designed yet. If Stage 5 needs learner-linked payment records, that's a
future migration.

### `lesson_deliveries`

Append-only log, one row per lesson actually delivered to a learner on a
given day.

| Column | Purpose |
|---|---|
| `learner_id` | FK to `learners`, cascades on delete. |
| `lesson_number` | 1–7 only, enforced by a `check` constraint — this is the 7-day pilot (LDTKB-013), not the future 30-day curriculum. |
| `delivery_date` | Calendar date (Thailand time) this delivery belongs to. |
| `delivered_at` | Set when the lesson **text** portion is confirmed sent. |
| `audio_delivered_at` | Set separately, once native audio sends. Nullable and independent of `delivered_at`. |
| `unique (learner_id, lesson_number, delivery_date)` | The duplicate-send guard. |

**Why text and audio are tracked separately:** `CLAUDE_AI_HANDOFF.md` Section 4
documents a specific lesson from German Breaks: *"Text should be recorded as
successfully sent before optional audio is attempted, preventing duplicate
lessons after an audio failure. Delivery must be idempotent and observable."*
The checkpoint brief explicitly asked to reuse this pattern rather than
reinvent it. Concretely: Checkpoint 3's scheduler will insert the
`lesson_deliveries` row (setting `delivered_at`) immediately after the text
message send succeeds — before attempting the audio send. If the audio send
then fails and the scheduler retries, the row (and hence the unique
constraint) already exists, so the retry can update `audio_delivered_at`
without re-sending the text and without violating the unique constraint by
inserting a second row.

### Indexes

- `learners.telegram_user_id` — unique index (from the `unique` constraint), for looking up a learner by their Telegram id on every incoming update.
- `idx_learners_due_for_delivery` — partial index on `learners (schedule_time)` where `onboarding_step = 'complete'`, for the cron job's "who is due right now" query, without scanning learners still mid-onboarding.
- `idx_lesson_deliveries_learner_id` — a learner's delivery history.
- `idx_lesson_deliveries_delivery_date` — today's deliveries across all learners.

### Row Level Security

Both tables have RLS enabled with no policies defined. In practice, only the
server (webhook handler, cron job) ever touches these tables, using the
Supabase service role key, which bypasses RLS entirely — so this doesn't
change current behavior. It does mean that if an anon or authenticated
Supabase key is ever introduced later (e.g. a future learner-facing web
view), it's denied by default rather than silently allowed.

## Application scaffold

Next.js (App Router, TypeScript, ESLint), no CSS framework. `npm` was used as
the package manager — no other choice (pnpm/yarn) is implied by any locked
decision, and npm avoids adding a tool the project doesn't otherwise need.

The scaffold currently contains no Telegram webhook route, no bot command
logic, and no scheduler/cron code — all three are explicitly out of scope for
this checkpoint (Checkpoints 2 and 3). `src/app/page.tsx` is a placeholder
page, not a learner-facing product surface.

## Environment variables

See [`.env.example`](.env.example) for the full list with descriptions.
Deliberately absent: any AI-provider key (e.g. `OPENAI_API_KEY`) — audio and
images are pre-produced and already committed under `curriculum/pilot/`, so
this application does no runtime AI generation.
