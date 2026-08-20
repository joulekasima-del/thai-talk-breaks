# Day 29 — Living Comic: Interaction Spec & Prototype Analysis

**Status:** Full interaction spec confirmed by Joule, 20 August 2026 — all open questions resolved. Technical design and build not yet started; drafted copy (entry message, question wording, monkey's line) still needs review.

## What changed
Day 29 was originally planned as a single rendered video file (Joule edits together the 8 illustrated pages + narration in a video editor, bot sends one `.mp4`). **This is now replaced** with a "living comic" — an interactive experience where the learner scrolls through the 8 pages themselves, with speech-bubble audio playing in sync as they go.

## The interaction spec, exactly as given
- **Format:** slidable/scrollable sequence of the 8 existing page images — not a video file.
- **Audio timing:**
  - 2 seconds between individual speeches (i.e. between consecutive speech-bubble audio clips within or across the sequence)
  - 3 seconds between panels/pages
- **Sound toggle:** on/off control, default **on**.
- **Toggle re-enable behavior:** when sound is turned back on, audio restarts from the **first speech of the page the learner is currently viewing** — not the first speech of the whole 8-page sequence. If they're on page 6 with sound off and then re-enable it, page 6's audio starts from its own beginning. Never plays audio from a different page than what's currently visible.

## Reference prototype: the Kiki Protocol
Joule shared a report on a prior, already-working project: a Telegram bot ("Kiki") that performs a short scripted greeting in chat, then opens a hosted interactive pixel-art scene via Telegram's native **Web App** button — the scene runs entirely inside Telegram's own webview, no external browser, no app install.

### Architecture (from the report)
```
Learner taps Start → bot sends scripted messages → bot sends a button
→ tapping the button opens a hosted page (GitHub Pages) as a Telegram Web App
→ that page is plain HTML/CSS/JS, fully client-side, no server
```

### What's directly reusable for Day 29
- **The bot → button → Web App → hosted page pattern itself.** This is the right mechanism for anything requiring real interactivity beyond what Telegram messages alone can do — exactly the case here (scroll + synced audio + toggle).
- **Static hosting, no server** (GitHub Pages in Kiki's case) — keeps this cheap and maintainable, consistent with Joule's own "functional and easy to make and maintain" goal.
- **Plain HTML/CSS/JS, no framework** — Kiki's entire interactive scene is three files (`index.html`, `style.css`, `script.js`). Reasonable to aim for similar simplicity here.

### What does NOT exist in Kiki and is genuinely new build work
- Kiki's interactivity is **click-to-advance** (tap a sleeping dog, tap an envelope) — nothing in it auto-plays audio on a timer, tracks "current position in a sequence," or has a toggle that changes replay behavior on re-enable. The entire audio-timing engine (2s/3s gaps, restart-on-toggle logic) needs to be designed and built from scratch — there's no equivalent to adapt.
- Kiki's scene is a single fixed sequence, not a scrollable/slidable multi-page carousel. The scroll/slide navigation itself is new.
- Kiki has no sound toggle concept at all.

## Navigation mechanic (confirmed 20 August 2026)
- Two circular buttons with triangle/arrow shapes, positioned left and right in the middle of the screen — previous/next page.
- Page indicator (dots or numbers showing current position, e.g. "3 of 9" — see Surprise Quest section below for why it's 9, not 8) shown at the bottom center.
- Precise, deliberate spacing throughout — this should read as a genuinely high-end, polished interface, not a rough prototype feel.

## Sound toggle re-enable behavior (corrected 20 August 2026 — ambiguity resolved)
**Confirmed:** audio restarts from the first speech of whatever page the learner is currently on — scoped per-page, not global. If they're viewing page 6 when they re-enable sound, page 6's own first speech plays from the start. This means audio and the visible page are always matched — there's no scenario where one page's dialogue plays while a different page is on screen.

## Bot trigger sequence (confirmed 20 August 2026)
Day 29 is triggered by the same scheduler as every other lesson (pg_cron + delivery route from Checkpoint 3) — no special scheduling logic needed. The difference is only in *what gets sent*: instead of the normal picture → text → audio → activity message sequence, Day 29 sends a short Kiki-style buildup (see below), ending in a button that opens the living comic as a Telegram Web App.

## Entry message sequence (Kiki-style buildup, draft)
Matching the anticipation-building pattern from the Kiki reference — a few short messages before the button, framing this as a quest:

> 🗺️ *knock knock*
>
> Hey, ka! Remember everything you've learned this month?
>
> I put together something special — a little story, a little journey, a few surprises along the way...
>
> Ready for your Day 29 quest? 🎒
>
> [🎁 Start the quest] *(button — opens the living comic Web App)*

*(Draft only, same review status as all other Thai/English copy — needs your read before locking.)*

## Surprise Quest — Page 9 (new, 20 August 2026)
A hidden 9th "page" appears after the 8 story pages — not part of the narrative, a bonus mini-quiz tying Day 29 directly into Day 30's quiz format as a preview/teaser.

**Question (draft, needs refinement):** references ต้อม, the Thai boy from Page 5's motorbike shop scene, and his answer earlier in the story ("ดอยปุยครับ" — Doi Pui).
> Draft: "🎁 Surprise! Do you remember... where does Dtôm like to travel? 🏔️"

**Answer:** Doi Pui (matches Page 5's established story content directly — not new information, a genuine recall check).

**Answer mechanic (confirmed 20 August 2026):**
- Multiple choice, 4 options total (not the usual 3): **Chiang Dao, Mae Kam Pong, Doi Pui (correct), Doi Inthanon** — all real Northern Thailand travel destinations, no fictional/wrong-sounding options.
- **Unlimited wrong attempts** — the learner can keep answering incorrectly with no penalty or lockout.
- **Once answered correctly, the question locks permanently** — it cannot be answered again after the first correct answer.

**Completion reward (confirmed 20 August 2026):** upon the correct answer, the question locks and shows a 2-panel congratulations comic — silent, **no audio attached**:
- **Panel 1:** a Thai monkey mascot character, celebrating, saying something congratulatory (English, draft: "You did it! 🎉") — a new character introduced specifically for this celebratory moment, distinct from the story's human cast.
- **Panel 2:** same monkey, speech bubble showing the Karaoke text "**gèng-mâak**" (เก่งมาก — "you're doing great / well done!") — teaching one small bonus phrase as part of the celebration itself, consistent with the product never missing a chance to teach something real, even in a reward moment.

This means the page count and indicator become **9 pages total**, not 8 — worth reflecting in the navigation UI's page counter from the start rather than bolting it on later.


## Resolved (previously open, now confirmed 20 August 2026)
- ~~Exact navigation mechanic~~ — circular triangle prev/next buttons, page indicator at bottom center, high-end polished spacing.
- ~~What "restart from first speech" means for current view~~ — resolved: scoped per-current-page, not global. Audio always matches whatever page is visible.
- ~~How Day 29 integrates with existing bot architecture~~ — same scheduler trigger as any lesson; only the message content differs (buildup + Web App button instead of the normal picture/text/audio/activity sequence).
- ~~Surprise Quest lock-state display~~ — 2-panel silent congratulations comic featuring a new Thai monkey mascot character, teaching "เก่งมาก" (gèng-mâak) as a bonus phrase.
- ~~Hosting~~ — alongside the existing Vercel app from Checkpoints 1–3, not a separate GitHub Pages site (simpler: one hosting stack, reusing what's already built).
- ~~Distractor place names~~ — Chiang Dao, Mae Kam Pong, Doi Pui (correct), Doi Inthanon.

## Open questions for the next design pass (remaining)
None currently outstanding — this spec is now fully specified pending your review of the drafted copy (entry message, Surprise Quest question wording, monkey's Panel 1 line) and the actual technical build, which hasn't started.

## Explicitly not decided yet
This document captures the *style spec* and *prototype analysis* only. No locked decision has been made about exact technical implementation, hosting, or how this integrates with the existing Checkpoint 1–3 architecture. That's the next real conversation, once Joule is ready for it.
