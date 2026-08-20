# Thai Talk Breaks — Scheduler & Lesson Delivery (Checkpoint 3)

**Status:** Checkpoint 3 (Scheduler & Lesson Delivery).
**Scope note:** Documents the pg_cron job and the delivery logic that sends
the 7 pilot lessons. Does not describe onboarding (`ONBOARDING_FLOW.md`,
Checkpoint 2) or the infrastructure scaffold (`ARCHITECTURE.md`,
Checkpoint 1). No payment, 30-day curriculum, or refund logic is described
or implemented here — that's Stage 5+, out of scope.

## Where the code lives

- `supabase/migrations/20260821000000_delivery_cron.sql` — the pg_cron + pg_net job. Uses placeholder URL/secret values, clearly marked — see the file's own header comment.
- `src/lib/curriculum/content.ts` — the seven lessons' English/Karaoke/script text, encoded from `curriculum/pilot/lesson-*.md`.
- `src/lib/curriculum/mediaFiles.ts` — reads the actual `curriculum/pilot/audio/` and `images/` files off the deployment filesystem and uploads them to Telegram as multipart bytes (no separate public URL/CDN needed, since the files already ship inside the Vercel deployment's checkout).
- `src/lib/delivery/dueLearners.ts` — pure day-math (`lessonNumberForDay`) and "who's due right now" filtering (`findDueLearners`). No I/O.
- `src/lib/delivery/distractors.ts` — recognition-tap distractor selection. Explicitly a design choice, not a locked rule — see below.
- `src/lib/delivery/deliveryStore.ts` — `lesson_deliveries` access; this **is** the duplicate-send guard (Checkpoint 1's unique constraint) plus the text-before-audio sequencing.
- `src/lib/delivery/deliverLesson.ts` — orchestrates one delivery: guard check → picture → text → native audio → recognition-tap activity (LDTKB-006 order).
- `src/app/api/cron/deliver/route.ts` — the actual route: auth, fetch due learners, deliver, report. Thin — the real logic lives in the modules above.
- `src/lib/telegram.ts` — extended (additively) with `sendPhoto`/`sendAudio` (multipart upload), on top of Checkpoint 2's `sendMessage`/`answerCallbackQuery`.
- `src/lib/onboarding/learnerStore.ts` — extended (additively) with `listOnboarded()`. See "Touching Checkpoint 2 code" below.
- `tests/delivery.test.ts`, `tests/deliveryFakes.ts` — the test suite.

## Day-to-lesson-number mapping

```
lessonNumber = (today − pilot_start_date, in whole days) + 1
```

- **Day 1** (today = `pilot_start_date` itself, 0 elapsed days) → **lesson 1**.
- **Day 7** (6 elapsed days) → **lesson 7**, the last pilot lesson.
- **Day 8+** (7+ elapsed days) → **no lesson** — past the pilot window. Not an error, not Stage 5 payment logic — the learner is simply excluded from `findDueLearners`'s results for that run, silently, every run, forever (until some later stage handles what happens next).
- **Negative** (today before `pilot_start_date`) → also **no lesson**, defensively. This shouldn't occur — `pilot_start_date` is only ever set to "today" at the moment onboarding completes (`handleUpdate.ts`) — but a clock skew or retry is handled the same as "not due" rather than thrown, so one bad row can't crash an entire delivery run.

Both boundaries and the negative case are unit-tested in `tests/delivery.test.ts`.

### The null `pilot_start_date` edge case

A learner whose `pilot_start_date` is null must never receive a lesson.
This is guaranteed structurally, not by a runtime check on that specific
field: `route.ts` only ever calls `learnerStore.listOnboarded()`, which
filters to `onboarding_step = 'complete'` — and in the onboarding flow
(`handleUpdate.ts`, Checkpoint 2), `pilot_start_date` is set in the exact
same database write that sets `onboarding_step = 'complete'`. A learner
still mid-onboarding (any `*_pending` step) is excluded before
`pilot_start_date` is ever inspected. `route.ts` additionally filters with a
type guard requiring `pilot_start_date !== null` before constructing an
`OnboardedLearner`, as a second, defensive layer — belt and suspenders, not
the primary mechanism.

## Cron interval and window — timing is NOT exact

**Every 15 minutes** (`*/15 * * * *`). Reasoning: every valid `schedule_time`
(LDTKB-034's button set) is exactly on the hour — `08:00`, `09:00`, ...,
`21:00`, never a non-zero minute. A 15-minute interval means:

**A learner can wait up to 15 minutes past their exact chosen time before
their lesson arrives.** This is stated plainly, not hidden — delivery is
"within 15 minutes," not "at the minute." Supabase Postgres runs in UTC, and
pg_cron's schedule is evaluated in the database's timezone, so
`*/15 * * * *` ticks at UTC `:00/:15/:30/:45` — which are also exactly
Bangkok (UTC+7) `:00/:15/:30/:45`, since a whole-hour offset never shifts
the minute component. No fractional-minute drift to worry about.

The application-side query (`dueLearners.ts`) uses a **30-minute lookback
window**, not exact-minute matching: a learner is "due" if their
`schedule_time` falls within the last 30 minutes. This is wider than the
15-minute cron interval on purpose — it gives one full tick of tolerance if
a single cron run is delayed or fails, without needing separate retry
infrastructure. Over-matching this way is safe specifically *because* the
`lesson_deliveries` unique constraint is the actual guard against a
duplicate send — the window's job is just "don't miss someone," not "be
exact," and a learner matched twice by an overlapping window still only
gets one message.

## Duplicate-send guard and text-before-audio — reused, not redesigned

Both reuse Checkpoint 1's schema exactly as documented in `ARCHITECTURE.md`:

1. `deliveryStore.findExisting(learnerId, lessonNumber, deliveryDate)` is checked **before anything is sent**. If a row exists, `deliverLesson` returns `"already_delivered"` immediately — no picture, text, or audio call is made.
2. Picture and text (Karaoke/English/script) are sent first.
3. `deliveryStore.insertTextSent(...)` — this insert **is** the guard, enforced by the table's `unique (learner_id, lesson_number, delivery_date)` constraint. This happens **before** the native audio is attempted.
4. Native audio is sent.
5. `deliveryStore.markAudioSent(...)` records `audio_delivered_at` — a second, distinct column and a second, distinct write, not folded into step 3's timestamp.

Test evidence (`tests/delivery.test.ts`):
- *"duplicate-send guard: a second delivery attempt... is blocked"* — calls `deliverLesson` twice with identical input; asserts the second call returns `"already_delivered"` and that `sentPhotos`/`sentAudio` counts don't increase.
- *"text-before-audio: delivered_at is recorded before the lesson's native audio is sent, audio_delivered_at after"* — uses a shared `EventLog` across the fake `TelegramClient` and `DeliveryStore` to assert the actual call order: `delivered_at` write → `sendAudio` call → `audio_delivered_at` write. Also asserts `delivered_at` and `audio_delivered_at` are two distinct, independently-readable fields on the stored record, not one combined timestamp.

## Recognition-tap activity and distractor selection — a design choice, not a locked rule

**LDTKB-026 locks the activity *type*** (2-3 audio clips, learner taps the
correct one). It does **not** lock *which* clips are used as distractors —
`BUILD_TRACKER.md` Stage 3 says so explicitly: *"One design detail remains
open, not a Stage 3 blocker: confirming distractor-clip content for each
recognition-tap activity."* What follows is this checkpoint's default,
flagged for Joule's review, not a requirement:

- **Lessons 3–7** (and, symmetrically, lesson 1 as a source for later lessons): distractors are **randomly chosen from lessons already delivered to this learner** (via `deliveryStore.listDeliveredLessonNumbers`), so a distractor is always taught material — never something the learner hasn't seen yet ("teach before testing", `CLAUDE_AI_HANDOFF.md` §4). Up to 2 distractors; if only one prior lesson exists (lesson 2's activity), just one distractor is used, giving 2 total clips — still within LDTKB-026's "2-3" range.
- **Lesson 2** (numbers) uses its **own** 10 numbers as the distractor pool — all ten are taught together in one delivery, matching `lesson-02-numbers.md`'s own step 6 description exactly. This doesn't go through the cross-lesson algorithm at all.
- **Lesson 1 has no eligible pool of any kind** — it's the very first lesson, and has only one phrase (nothing internal to draw from either). Rather than violate "teach before testing" by reaching into not-yet-taught lesson 2+ content, or send a broken 1-clip "activity," **lesson 1's recognition-tap is skipped**, replaced with a short acknowledgement message. This is a structural gap, not an oversight — flagged prominently here and in the code (`deliverLesson.ts`) for your decision: options include leaving it as designed, or recording 1-2 dedicated generic "wrong" clips for lesson 1 specifically.
- The representative clip used when lesson 2 is picked as a distractor source for a *later* lesson's activity is a fixed, arbitrary choice — **the number 5** (`hâa`). Also flagged, also not locked.

## Known gap: activity responses aren't recorded

The checkpoint's required output is *"presents 2-3 audio clip options as
inline buttons, one correct"* — that's implemented. **Recording which button
the learner actually taps is not implemented.** LDTKB-026's own rationale is
about producing real completion/accuracy data, so this is a real, load-bearing
gap, not a nice-to-have — but wiring it up means the webhook
(`handleUpdate.ts`, Checkpoint 2) would need to recognize a new
`activity:*` callback pattern, and that wasn't justified as "strictly
necessary for integration" for a feature outside this checkpoint's stated
outputs. Today, tapping an activity button does nothing — it's acknowledged
by Telegram (the callback is answered, same as any unrecognized callback in
Checkpoint 2's design) but silently ignored by the app. This is the natural
next piece of scheduler/delivery work, not implemented here.

## Testing

No live Telegram bot token or Supabase project exists in this environment —
same as Checkpoints 1 and 2. What *was* tested, via `npm test` (26 tests
total, 18 new in `tests/delivery.test.ts`, all passing):

- Day-to-lesson-number boundaries: day 1, day 7, day 8+, and the defensive negative case.
- The delivery time window (exact match, within-lookback, past-lookback, before-scheduled-time).
- `findDueLearners` end-to-end: excludes a learner past their pilot window even when their time matches; returns the correct lesson number for an in-window, in-pilot learner.
- Distractor selection: lesson 1's empty pool, the "at most 2, no duplicates, always earlier" property, the single-prior-lesson case, and the numbers-lesson case (never returns the correct number).
- Gender-branch file selection: asserts the exact filenames requested from a fake `MediaLoader` for a male learner, a female learner, and lesson 2 (confirms no gender suffix is ever requested for numbers).
- The duplicate-send guard, actually exercised: two calls with identical input, second one blocked, message counts unchanged; a same-lesson-different-date call is correctly allowed.
- Text-before-audio sequencing, via a shared event log proving actual call order across the fake `TelegramClient` and `DeliveryStore`, and confirming `delivered_at`/`audio_delivered_at` are two distinct fields.

**Not tested, and can't be without live credentials:**
- The real Supabase-backed `deliveryStore.ts`/`learnerStore.listOnboarded()` against actual tables.
- The real Telegram multipart upload (`sendPhoto`/`sendAudio` HTTP calls).
- Actually reading the real files from `curriculum/pilot/audio/`/`images/` off a deployed filesystem (`mediaFiles.ts` itself wasn't exercised — only the `MediaLoader` interface it implements, via the fake).
- The pg_cron/pg_net job actually firing (no Supabase project exists to schedule it against).
- The route's HTTP-level secret check (reviewed, not exercised by an HTTP test — same as Checkpoint 2's webhook route).

## Touching Checkpoint 2 code

Two files from Checkpoint 2 were touched, both **additively only** — no
existing method, type, or behavior was changed:

- `src/lib/telegram.ts`: added `sendPhoto`/`sendAudio` to the `TelegramClient` interface and implementation. `sendMessage`/`answerCallbackQuery` are unchanged.
- `src/lib/onboarding/learnerStore.ts`: added `listOnboarded()` to the `LearnerStore` interface and implementation. `findByTelegramId`/`create`/`update` are unchanged, and `handleUpdate.ts` (the actual onboarding logic) was not touched at all.

Justification: the cron route needs to query learners and send media, and
duplicating a second, parallel learner-fetching or Telegram-client
implementation just to avoid touching these two files would risk drift
between the two copies for no real safety benefit — extending the existing,
already-tested interfaces was the minimal-necessary change. All 8 of
Checkpoint 2's original onboarding tests still pass unmodified, confirming
nothing about onboarding behavior changed.
