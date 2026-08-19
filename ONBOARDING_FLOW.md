# Thai Talk Breaks — Onboarding Flow (Checkpoint 2)

**Status:** Checkpoint 2 (Telegram Webhook & Onboarding Flow).
**Scope note:** Documents the webhook handler and the six-step onboarding
conversation. No lesson delivery or scheduling (Checkpoint 3) is described
here. Written as a separate document rather than extending `ARCHITECTURE.md`,
since that file's own header scopes it explicitly to Checkpoint 1
("infrastructure only") — keeping it that way avoids blurring what each
checkpoint actually shipped.

## Where the code lives

- `src/lib/telegram.ts` — minimal Telegram Bot API client (`sendMessage`, `answerCallbackQuery`) plus the `TelegramUpdate` types this webhook reads. Raw `fetch`, no SDK — see "Design choices" below.
- `src/lib/supabase.ts` — server-side Supabase client factory (service role key).
- `src/lib/onboarding/content.ts` — the five locked messages, copied verbatim from `onboarding/*.md`, plus button/keyboard definitions.
- `src/lib/onboarding/learnerStore.ts` — `Learner`/`LearnerStore` types and the real Supabase-backed implementation, matching the `learners` table from `supabase/migrations/20260820000000_initial_schema.sql`.
- `src/lib/onboarding/handleUpdate.ts` — all onboarding logic, with I/O behind the `LearnerStore`/`TelegramClient` interfaces so it can be unit-tested without a network or database.
- `src/app/api/webhook/route.ts` — the actual Next.js route: verifies the webhook secret, then delegates to `handleUpdate`.
- `tests/onboarding.test.ts`, `tests/fakes.ts` — the test suite (see "Testing" below).

## State machine

States are exactly the `onboarding_step` enum from Checkpoint 1's schema —
no schema change was needed:

```
                         /start (no existing row)
                                │
                                ▼
                        ┌───────────────┐
                        │ gender_pending│  ← default onboarding_step
                        └───────┬───────┘
                                │ callback: gender:<male|female>
                                ▼
                 ┌─────────────────────────────┐
                 │  schedule_period_pending     │
                 └──────────────┬───────────────┘
                                 │ callback: period:<morning|afternoon|evening>
                                 ▼
                  ┌──────────────────────────┐
                  │  schedule_time_pending    │
                  └─────────────┬─────────────┘
                                 │ callback: time:<HH:MM>
                                 ▼
                          ┌────────────┐
                          │  complete  │
                          └────────────┘
```

On the `schedule_time_pending → complete` transition, three things happen in
one handler call, in this order (matching the checkpoint brief's phrasing
exactly):
1. `schedule_time` is written.
2. The notification test message sends ("immediately after schedule selection").
3. The onboarding-complete message sends ("immediately after the notification test"), and in the same step: `onboarding_step` → `complete`, `onboarding_completed_at` is set, `pilot_start_date` is set to today in Thailand time.

No dedicated state exists for "notification test sent, awaiting completion
message" — both sends are ungated (LDTKB-028) and happen back-to-back within
a single webhook invocation, so a fourth enum value wasn't needed. This
matches Checkpoint 1's own rationale in `ARCHITECTURE.md`.

### /start on a non-fresh learner

Two situations aren't literal states in the diagram above, but do need
defined behavior:

- **Already `complete`:** sends a short "you're all set already" message instead of restarting onboarding.
- **Mid-onboarding (any pending state):** re-sends the current pending question (e.g. if they're `schedule_period_pending`, they get the period question again) instead of restarting from the welcome message.

**These are implementation-level design choices, not locked decisions** —
flagged per the checkpoint brief for Joule's review. The checkpoint prompt
itself treated this as a reasonable judgment call rather than something
requiring a stop. Their exact wording (`ALREADY_ONBOARDED_MESSAGE` in
`content.ts`) is likewise not locked copy — see that file's comments.

### Stale / out-of-order callbacks

Every callback handler checks `learner.onboarding_step` before acting (e.g.
a `gender:*` callback only does anything if the learner is still
`gender_pending`). A replayed or out-of-order button press is acknowledged
(so Telegram clears the loading spinner) but otherwise silently ignored —
no error, no message, no state change. This protects against a learner
double-tapping a button or an old inline keyboard being reused after the
learner has already moved on.

## Design choices — not covered by any locked decision

Flagged explicitly, per the checkpoint brief's instruction not to bury
judgment calls as silent assumptions:

1. **"Already onboarded" behavior and copy** (above).
2. **"Resume mid-onboarding" behavior** (above) — re-asking the current pending question rather than, say, silently doing nothing or erroring.
3. **Webhook error handling:** unexpected exceptions return HTTP 500, so Telegram retries delivery, rather than swallowing the error and returning 200. This trades "no error ever visible to Telegram" for "no silently dropped updates."
4. **No SDK for the Telegram Bot API** — a hand-rolled client using raw `fetch` for just the two operations this checkpoint needs (`sendMessage`, `answerCallbackQuery`). A full SDK wasn't added because nothing here needs its extra surface yet (Checkpoint 3 may well introduce one for cron-triggered sends).

## Testing

No live Telegram bot token or Supabase project exists in this environment,
so nothing here was tested against real Telegram or Supabase traffic. What
*was* tested, via `npm test` (`tsx --test tests/onboarding.test.ts`, Node's
built-in test runner, 8 tests, all passing):

- **Verbatim content regression check** — the test suite reads `onboarding/welcome-message.md`, `gender-question.md`, `schedule-selection.md`, `notification-test.md`, and `onboarding-complete.md` directly off disk, extracts their fenced code blocks, and asserts byte-for-byte equality against the `content.ts` constants actually used by the webhook. This is independent of the manual copy-paste that produced `content.ts` — if the two ever drift, this test fails.
- **Full onboarding flow**, using `FakeLearnerStore` (in-memory) and `FakeTelegramClient` (records sent messages instead of calling Telegram) in place of the real implementations: `/start` → gender → period → time, asserting the learner row's final state (`gender_branch`, `schedule_period`, `schedule_time`, `onboarding_step`, `pilot_start_date`) and the exact sequence of messages sent, including that the notification test and onboarding-complete messages are the last two sent, in that order.
- **`pilot_start_date` correctness**, including a UTC/Bangkok day-boundary edge case (`todayInBangkok` at 16:59 UTC vs. 17:00 UTC).
- **Rejection of an invalid time/period combination** (e.g. an evening time slot submitted while the learner's stored period is morning).
- **Already-onboarded `/start`** and **mid-onboarding-resume `/start`** behaviors.
- **Stale/out-of-order callback** handling (replaying an already-superseded button).

**Not tested, and can't be without live credentials:**
- The actual Supabase-backed `learnerStore.ts` implementation against a real `learners` table (only the interface it implements is exercised, via the fake).
- The real Telegram HTTP client (`telegram.ts`'s `HttpTelegramClient`) actually calling `api.telegram.org`.
- The webhook route's secret-header check and JSON-parsing against a real HTTP request (`route.ts` itself is thin — secret check, JSON parse, delegate to `handleUpdate`, error mapping — and wasn't exercised by an HTTP test, only read/reviewed).
