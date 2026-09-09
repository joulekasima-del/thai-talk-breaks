-- Stage 8 groundwork (LDTKB-016): the Day 8 paywall gate.
--
-- Days 1-7 stay a free preview, delivered exactly as before. Day 8 onward
-- requires a paid purchase (purchases.status = 'paid', from the Stage 5
-- checkout flow — 20260903000000_star_payments.sql). This migration adds the
-- two learner-row fields the gate needs; all behaviour lives in the
-- application (cron/deliver/route.ts, onboarding/handleUpdate.ts,
-- delivery/duePaidLearners.ts).
--
-- Built ahead of Stages 6-7 (commercial registration, published policies) as
-- a conscious, already-discussed choice — the mechanism is live for anyone
-- who reaches Day 8 once this ships, but nothing changes for the current
-- single pilot learner until a real second learner exists.

alter table learners
  add column paid_course_start_date date,
  add column paywall_prompt_sent_at timestamptz;

comment on column learners.paid_course_start_date is
  'Thailand calendar date the learner''s paid content (Day 8) actually started. Null until they cross the paywall. Days 8-30 count from this anchor (delivery/duePaidLearners.ts), NOT pilot_start_date — so a long gap waiting for payment never skips days once they resume. Days 1-7 keep using pilot_start_date, untouched. Cleared back to null by /refund (handleUpdate.ts) so a refunded learner falls back behind the gate.';
comment on column learners.paywall_prompt_sent_at is
  'Set the first time the one-time check-in message is sent when a learner becomes due for Day 8 unpaid. Null otherwise. A permanent "have they ever seen this" marker — NOT a transient pending flag: unlike awaiting_oops_report_since / awaiting_paysupport_request_since it is never cleared on /start. The cron route never re-sends once this is set; only a learner message re-triggers the check-in (handleUpdate.ts maybeCapturePendingReport), which is a read-only check against this + paid_course_start_date + purchases, not a state change.';
