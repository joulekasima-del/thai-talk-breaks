# Thai Talk Breaks — Checkpoint 4: Activity Response Handling & Day 30 Quiz-Ladder

**Status:** Checkpoint 4.
**Scope note:** Two response-handling pieces (Lessons 2–7's recognition-tap
taps, and the Day 30 quiz-ladder) plus a temporary, clearly-marked scheduler
day-window extension for testing. No Weeks 2–4 lesson activities
(Checkpoint 5), no Day 29 living comic (separate, unbuilt), no changes to
onboarding (`handleUpdate.ts`) or curriculum content files.

## Part A — Recognition-tap response handling (Lessons 2–7)

### Schema

Extended `lesson_deliveries` (not a new table — it's 1:1 with an existing
delivery row) with two nullable columns, in
`supabase/migrations/20260822000000_activity_and_quiz.sql`:
- `activity_answered_at timestamptz`
- `activity_correct boolean`

### callback_data format — changed from Checkpoint 3

Checkpoint 3's activity buttons used bare `activity:<true|false>` —
functionally fine for *presenting* the activity, but not enough to *process*
a tap: there was no way to know which lesson/learner delivery a reply
belonged to without extra state. Checkpoint 4 changes this to self-describing
callback data (`deliverLesson.ts`, my own Checkpoint 3 file — not
governance-locked, so free to adjust):
- `activity:phrase:<lessonNumber>:<0|1>` — Lessons 1, 3–7 (only 3–7 ever fire; Lesson 1 has no activity)
- `activity:num:<correctNumber>:<0|1>` — Lesson 2 (numbers)

### Handler structure

`src/lib/activities/lessonActivity.ts`, `handleLessonActivityCallback`:
1. Answers the callback query immediately (clears the Telegram spinner).
2. Parses the callback data; looks up the learner by Telegram id.
3. Finds the matching *unanswered* `lesson_deliveries` row (`findUnansweredActivity` — guards against double-recording a reply, or acting on a stale/replayed tap for an already-answered activity).
4. Records `activity_answered_at`/`activity_correct`, then sends brief feedback.

Wired into `src/app/api/webhook/route.ts`: callback data starting with
`"activity:"` routes here, before falling through to `handleUpdate`
(onboarding, untouched).

### Feedback wording — judgment call, flagged for review

- Correct: *"That's right, ka! 🎉"*
- Incorrect: *"Not quite, ka — that was '\<correct answer\>.'"*

Exact wording is not locked by any LDTKB entry (the checkpoint brief says
"exact wording is your call"). Kept short and in the fixed narrator voice
(LDTKB-030). For Lesson 2, "\<correct answer\>" is the number itself (e.g.
`"7."`); for Lessons 3–7, it's the lesson's English meaning.

## Part B — Day 30 quiz-ladder

### Why this is a different mechanism from Part A

Lessons 2–7's activities are one-per-day, cron-triggered. Day 30's 10
questions are **not** one-per-day — they progress entirely through callback
taps, all within whatever single visit first reaches Day 30, the same way
onboarding's `onboarding_step` progresses through taps rather than daily
cron ticks. So the quiz has two entry points:
- **Cron-triggered start**: when a learner's day-number reaches 30, `startDay30Quiz` creates a progress row (if none exists) and sends Question 1.
- **Callback-triggered progression**: each tap is processed, scored, and immediately followed by either the next question or the completion message — no waiting for tomorrow's cron tick.

### State tracking

New table `day30_quiz_progress` (same migration as Part A):
- `learner_id` (unique — one attempt per learner)
- `current_question_index` (1–10, which question is awaiting an answer)
- `correct_count`
- `completed_at` (null while in progress; the guard against a later cron tick re-starting the quiz)

### Content source

`src/lib/curriculum/day30Content.ts` encodes all 10 questions verbatim from
`day30-button-wording.md` — cross-checked by a test that re-reads that file
directly off disk and asserts equality (same verbatim-content pattern as
Checkpoints 2/3). `day30ScoreMessage`/`DAY30_BADGE_MESSAGE` match
`day30-quiz-content.md`'s completion screen exactly.

### Delivery mechanics

Per question: play `Q{n}_correct_answer.mp3`, then send one message with 3
buttons (correct + 2 distractor English meanings), shuffled via an
injectable RNG (`Math.random` in production). callback_data:
`quiz:<questionIndex>:<0|1>`.

**LDTKB-045 confirmed NOT violated:** `day30Quiz.ts` has no import of
`@/lib/delivery/distractors` at all — not even the `Rng` type, which is
redefined locally specifically to avoid any coupling to Checkpoint 3's
distractor-selection module. A test (`checkpoint4.test.ts`) asserts this by
reading the file's source and checking for the absence of that import
statement, not just trusting the design description.

### Judgment call, flagged: distractor audio files are never played

`curriculum/day30-audio/` has 20 `Q{n}_distractor-{1,2}.mp3` files, but this
implementation **only ever loads and plays the correct-answer audio** —
matching `day30-quiz-content.md`'s own worked example literally ("Prompt:
Play `Q1_correct_answer.mp3`... Options shown as 3 buttons"), which shows a
single audio play, not three. If the actual intent was for each of the 3
buttons to trigger its own audio clip (making it a closer cousin of Part A's
mechanic), that's a different build — flagged here explicitly rather than
guessed at, since the content docs' own example reads unambiguously as
"one clip, then three text buttons" to me, but the existence of 20 unused
files is worth a second look from you.

### Judgment call, flagged: closing message not sent

The checkpoint brief says "send the completion message: the score (X/10)
and the badge" — that's exactly what's implemented (two messages: score
line, badge line). `day30-quiz-content.md` also has a separate "Closing
message," explicitly marked **"draft, not yet locked."** I did not send it —
the brief didn't ask for it, and it isn't locked copy. Easy to add once
you've reviewed/locked that text.

## Part C — Temporary testing day-window extension (LDTKB-044)

**Exact code**, `src/lib/delivery/dueLearners.ts`:

```ts
// -----------------------------------------------------------------------
// TEMPORARY TESTING BYPASS — see LDTKB-044. Real pilot scope is 7 days
// (LDTKB-013). Do NOT treat this as the production day-window. Gated behind
// an environment variable that defaults OFF, so a deployment without it
// explicitly set behaves exactly like the real 7-day pilot.
// -----------------------------------------------------------------------
export const TESTING_EXTENDED_DAY_WINDOW = process.env.TESTING_EXTENDED_WINDOW === "true";
export const DAY_WINDOW_MAX_DAY = TESTING_EXTENDED_DAY_WINDOW ? 30 : PILOT_LESSON_COUNT;
```

`dayNumberForLearner(pilotStartDate, today, maxDay)` takes `maxDay` as an
explicit parameter (no default baked in beyond the old `lessonNumberForDay`
wrapper, kept for Checkpoint 3's existing tests) — the cron route
(`src/app/api/cron/deliver/route.ts`) is the only caller that decides which
`maxDay` to use, via `DAY_WINDOW_MAX_DAY`. An env var default of "off"
means a deployment that never sets `TESTING_EXTENDED_WINDOW=true` runs the
real 7-day pilot, unchanged from Checkpoint 3.

### Days 8–29 skip gracefully — how, and evidence

The cron route's per-learner branch:
```ts
if (dayNumber >= 1 && dayNumber <= PILOT_LESSON_COUNT) {
  /* existing Lessons 1-7 delivery */
} else if (dayNumber === DAY30_QUIZ_DAY_NUMBER) {
  /* start Day 30 quiz */
} else {
  /* Days 8-29: graceful no-op, status "skipped_no_content_yet" */
}
```
No lesson/media lookup is ever attempted for days 8–29 — `getLesson()`
(which throws for an unknown lesson number) is never called with anything
outside 1–7, because the branch structure itself prevents it, not a
try/catch around a would-be crash.

**Evidence:** `dayNumberForLearner`/`findDueLearners` are directly
unit-tested with `maxDay: 30` at day 8, day 15, day 29, day 30, and day 31 —
confirming the day-number math is correct at every relevant boundary
(`checkpoint4.test.ts`, `delivery.test.ts`). The route's branch itself
(a plain three-way `if`/`else if`/`else` with no I/O of its own beyond
calling already-tested functions) was verified by direct code reading
rather than an HTTP-level test — consistent with how `route.ts` files have
been treated in every prior checkpoint (thin wiring, not unit-tested
directly; the logic they call is).

## Testing

`npm test` — **39 tests total, all passing** (26 from Checkpoints 2–3
unchanged + 13 new). No live Telegram bot token or Supabase project exists
in this environment — same as every prior checkpoint. New coverage:

- Day 30 content verbatim-match against `day30-button-wording.md`, read directly off disk at test time.
- Correct and incorrect lesson-activity taps (Lessons 2–7), including the numbers-lesson feedback wording and that a second tap on an already-answered activity is ignored, not double-recorded.
- Quiz start (question 1 sent, guarded against a second `startDay30Quiz` call re-sending it).
- A full 10-question quiz run, asserting the exact sequence of correct-answer audio files played, the final score, and the verbatim completion messages.
- An out-of-order quiz answer (wrong question index) is ignored.
- The LDTKB-045 no-distractor-reuse guarantee, verified structurally (no import), not just by inspection.
- `dayNumberForLearner`/`findDueLearners` at the extended-window boundaries (day 8, 29, 30, 31).

**Not tested, and can't be without live credentials:** the real Supabase-backed `deliveryStore`/`day30QuizStore` against actual tables, the real Telegram calls, the cron/webhook routes' HTTP-level wiring, and the pg_cron job itself.
