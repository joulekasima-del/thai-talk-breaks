-- Stage 5 (LDTKB-014): Telegram Stars checkout + /paysupport + admin refund.
--
-- Two new tables, plus one new pending-flag column on learners, mirroring
-- /oops's existing shape (20260826000000_oops_reports.sql) as closely as
-- this feature's actual differences allow:
--   - purchases: one row per successful Stars payment (permanent, append-only
--     — a payment is never deleted, only marked refunded). telegram_payment_
--     charge_id is unique and is what refundStarPayment (and /refund) key
--     off of; Telegram's own docs say to store it for exactly that reason.
--   - payment_support_requests: one row per /paysupport request, same
--     "every one kept permanently" shape as oops_reports — a learner can
--     submit more than one over time. purchase_id is nullable: a learner
--     might send /paysupport with no purchase on record at all (e.g. before
--     ever buying, or if the charge id can't be matched).
--   - learners.awaiting_paysupport_request_since: single nullable timestamp,
--     exactly the same "pending" pattern as awaiting_oops_report_since —
--     ephemeral per-learner state with no history worth keeping, so a column
--     rather than a table, same reasoning as that one.
--
-- No lesson-delivery/paywall gating here — this is Stage 5's standalone
-- checkout-verification flow only (LDTKB-014), not the final paywall
-- (Stage 8's job, out of scope for this migration and this stage).

alter table learners
  add column awaiting_paysupport_request_since timestamptz;

comment on column learners.awaiting_paysupport_request_since is
  'Set when the learner sends /paysupport and we are waiting for their next message to be captured as the payment-support request. Null the rest of the time. Cleared (never stacked) on a repeated /paysupport, on /start, or once a request is captured.';

create table purchases (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners (id) on delete cascade,

  -- Telegram's own charge id for this payment — unique, and what
  -- refundStarPayment (and this project's /refund admin command) key off
  -- of. Telegram's docs say to store this: "it may be needed to issue a
  -- refund in the future."
  telegram_payment_charge_id text not null unique,
  -- The payment provider's own charge id, if Telegram sends one. Stars
  -- payments may not always carry a distinct provider-side id, hence nullable.
  provider_payment_charge_id text,

  currency text not null default 'XTR',
  total_amount integer not null,
  invoice_payload text not null,

  status text not null default 'paid' check (status in ('paid', 'refunded')),

  created_at timestamptz not null default now(),
  refunded_at timestamptz
);

comment on table purchases is
  'One row per successful Telegram Stars payment. Append-only — a refund updates status/refunded_at in place, the row is never deleted, matching lesson_deliveries'' append-only style.';
comment on column purchases.telegram_payment_charge_id is
  'Telegram''s own charge id for this payment (from successful_payment). Unique — this is the key /refund and refundStarPayment operate on.';
comment on column purchases.status is
  'paid or refunded. Refund eligibility (LDTKB-063: genuine delivery failure only) is a human judgment call made via /paysupport + /refund, not an automatic determination — see handleUpdate.ts.';

create index idx_purchases_learner_id on purchases (learner_id);

create table payment_support_requests (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners (id) on delete cascade,
  -- Nullable: a learner may send /paysupport with no purchase on record at
  -- all (e.g. before ever buying, or the charge id can't be matched).
  purchase_id uuid references purchases (id),

  request_text text not null,

  created_at timestamptz not null default now()
);

comment on table payment_support_requests is
  'One row per /paysupport request a learner submits. NOT a single-row-per-learner guard (same as oops_reports) — a learner can submit multiple over time and every one is kept permanently.';

create index idx_payment_support_requests_learner_id on payment_support_requests (learner_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Both tables are only ever touched by the server (webhook handler) using
-- the Supabase service role key, which bypasses RLS. RLS is enabled anyway
-- with no policies, so any future anon/authenticated-key access is denied
-- by default rather than silently allowed — same convention as every other
-- table in this project.

alter table purchases enable row level security;
alter table payment_support_requests enable row level security;
