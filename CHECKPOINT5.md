# Thai Talk Breaks — Checkpoint 5: Weeks 2–4 Activity Handling (Days 8–28)

**Status:** Checkpoint 5.
**Scope note:** Extends recognition-tap delivery/response handling to Days
8–28. No changes to Lessons 1–7, Day 29 (still unbuilt), or Day 30 (own
module). No new locked-decision gaps found — LDTKB-047/048 already covered
everything this checkpoint needed.

## Content-module extension

`src/lib/curriculum/content.ts` gained a third `Lesson` kind:

```ts
export interface WordSetLesson {
  kind: "wordset";
  lessonNumber: 8 | 10 | 16 | 26;
  words: { index: number; karaoke: string; meaning: string }[];
}
```

`GenderBranchedLesson.lessonNumber` was widened from the tight
`1 | 3 | 4 | 5 | 6 | 7` union to plain `number` — a 23-member literal union
across the pilot + 3 weeks was judged not worth the churn; `getLesson()`
still validates at runtime (throws for anything undefined), so nothing
previously guaranteed at compile time is silently permitted through. All 21
days (8–28, excluding 29/30) are now in the `LESSONS` record.

## Word-set activity implementation (Days 8, 16, 26 — and 10, see below)

Same hear-one-tap-the-meaning pattern as the pilot's Lesson 2, but **not**
reusing `deliverNumbersLesson`/`pickNumberDistractors` directly — a new
`deliverWordSetLesson` and `pickWordSetDistractors` were written instead,
because the actual `week{2,3,4}-images/` files confirmed each word-set day
has exactly **one shared image**, not one image per word like Lesson 2.
Sending per-word images (Lesson 2's pattern) would have been wrong.
`pickWordSetDistractors` also takes the set size as a parameter (3 or 4
words), since `pickNumberDistractors` is hardcoded to a fixed set of 10.

Response handling reuses Checkpoint 4's `lessonActivity.ts` handler
additively — a new `"wordset"` callback-data branch
(`activity:wordset:<lessonNumber>:<correctIndex>:<0|1>`) alongside the
existing `"phrase"`/`"num"` branches, not a separate handler module.

## Days 15, 17, 21, 22 — younger form only, confirmed

Per LDTKB-047, only ผม/หนู (younger-speaker forms) are in `content.ts` for
these four days — no พี่ (older form) anywhere in the code, and no
age-input parameter exists on `getLesson()` or anywhere else. Verified by a
test that asserts every one of these four days' Karaoke starts with
`phǒm`/`nǔu`, never `phîi`, and that the script text contains no พี่
character at all.

## Day 25 — example #1 confirmed

`content.ts`'s `DAY_25` is exactly LDTKB-048's named canonical example:
`"khǎw jòrt rót dtrong-níi dâai mǎi kráp"` / `"May I park here?"`. Unlike
Days 15/17/21, this is a fully-filled phrase, not a template — LDTKB-048
gives the complete text directly, so there was no blank-filling judgment
call to make here.

## Section 5E — "main, not extended" assumption: CANNOT be fully confirmed, flagged

Days 9, 13, and 24 each have a supplementary audio variant (`_ext` for 9 and
24, distinct sweetness-level clips for 13) beyond the main phrase. This
checkpoint used the **main** (non-extended) phrase as the tested content for
all three — but this is a judgment call, not a verified fact. There is no
document in the repo that states which variant is "the tested one" versus
"reference only" for these three specific days (unlike Day 25, where
LDTKB-048 explicitly names example #1). The pattern was inferred from how
Day 13's sweetness levels and Day 12's "opposite/smaller" variant are
described in prose as clearly supplementary, and applied by extension to 9
and 24. **Flagging explicitly, per the checkpoint brief's own instruction,
rather than presenting this as certain.**

## `pickCrossLessonDistractors` — confirmed unmodified

Not touched. It already took a plain `lessonNumber`/`deliveredLessonNumbers`
pair with no hardcoded range, so Days 8–28 pass through it exactly like
Lessons 1–7 always did. A test confirms a Day 20 distractor pool spanning
both pilot lessons and earlier Weeks 2–4 days works correctly with zero
changes to the function itself.

## Media loading

`loadPhraseLessonAudio`/`loadPhraseLessonImage` (existing function names,
unchanged signatures) now branch internally: `lessonNumber <= 7` routes to
`curriculum/pilot/`, `8+` routes to `curriculum/week{2,3,4}-audio|images/`
with the `week{N}_day{DD}_<gender>` naming confirmed against the actual
files. Because the routing is internal, **`deliverPhraseLesson` in
`deliverLesson.ts` needed zero changes** — it already worked generically by
`lessonNumber`. New: `loadWordSetAudio(dayNumber, wordIndex)`,
`loadWordSetImage(dayNumber)`. `loadRepresentativeClip` was extended with a
third branch (word-set days use a fixed representative word, index 1 — same
"arbitrary, clearly-flagged" pattern as Lesson 2's fixed "5").

**Real-file verification**: unlike Checkpoints 1–4's tests (which used fake
media loaders exclusively), this checkpoint's test suite also calls the
*real* `loadPhraseLessonAudio`/`loadWordSetAudio`/`loadWordSetImage`
functions directly and confirms actual non-empty file reads across the
pilot/Weeks-2-4 boundary and all 4 word-set days — not just that the
routing logic looks right on paper.

## Integration point not explicitly listed in the checkpoint steps, done anyway

The cron route (`src/app/api/cron/deliver/route.ts`) previously routed only
days 1–`PILOT_LESSON_COUNT` (7) to `deliverLesson`, skipping 8–29 entirely
as "no content yet." Without updating this, none of Checkpoint 5's new
content would ever actually be delivered in practice — so the route's
branch was updated to route 1–`WEEKS234_LAST_DAY` (28) to `deliverLesson`,
leaving only Day 29 in the graceful-skip branch. This wasn't explicitly one
of section 9's numbered steps, but seemed like a necessary consequence of
the goal ("extend... activity handling to Days 8–28") rather than an
out-of-scope addition — flagged here rather than done silently.

## Testing

`npm test` — **61 tests total, all passing** (46 unchanged from Checkpoints
2–4 + the button-audio follow-up, + 15 new). New coverage: all 21 days have
content; word-set days are exactly {8, 10, 16, 26}; Days 15/17/21/22 use
only the younger form; Day 25 uses example #1; `pickCrossLessonDistractors`
generalizes with a mixed pilot/Weeks-2-4 pool; `pickWordSetDistractors`'
set-size parameterization; word-set delivery sends exactly one image;
word-set activity distractors stay within the same day's word set;
word-set and standard-phrase activity response handling (both via the
Checkpoint 4 handler, additively extended); the Days 9/13/24
main-vs-extended assumption stated as test-documented (not proof of
correctness); real file reads across the pilot/Weeks-2-4 boundary and all
word-set days; and a re-confirmation that Lesson 1 still has no activity.

**Not tested, and can't be without live credentials:** the real
Supabase-backed stores, real Telegram calls, and the cron/webhook routes'
HTTP-level wiring — same as every prior checkpoint.
