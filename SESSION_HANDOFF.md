# Thai Talk Breaks — Session Handoff
**Prepared:** 21 August 2026, for continuation in a new chat session.
**Read this first**, then `LOCKED_DECISIONS.md`, `BUILD_TRACKER.md`, and `CLAUDE_AI_HANDOFF.md` for full detail — this document is an orientation map, not a replacement for those.

---

## What this project is

A Telegram-delivered spoken-Thai learning bot for expats (European/Russian audience), built by **Joule**, a native Thai speaker. Notification-led, learner-configured schedule, Thai Karaoke (romanized) as the primary teaching surface — Thai script is deliberately decorative only, never the tested skill. Low-friction pricing (~$6.50), 7-day free pilot, then a 30-day paid curriculum.

**Repo:** `github.com/joulekasima-del/thai-talk-breaks`
**Local path:** `/Users/mac/Documents/GitHub/thai-talk-breaks`
**Stack:** Next.js + Vercel + Supabase Postgres + pg_cron

## How Joule works with Claude — critical process notes

- **Joule has no direct terminal/GitHub fluency beyond copy-pasting commands.** Every file Claude produces must be explicitly downloaded, then Claude gives the *exact* terminal command sequence (cd, cp, git add/commit/push) for Joule to paste in one block. Never assume Joule will improvise commands.
- **Large zips can fail to download/unzip reliably** (this happened once with a 52MB single zip) — split into smaller zips by logical grouping (e.g., per week) when packaging many files (images/audio) as a defensive default.
- **Before any push, verify with a `grep -c` check** against a known marker (e.g., latest LDTKB number) so Joule confirms the downloaded file is actually current before copying it into the repo — this caught a real stale-download problem once.
- **Claude Code (the implementation agent) works from bounded, written prompts** — Claude (this chat) drafts a full checkpoint prompt (goal, inputs, outputs, locked decisions, permitted/prohibited changes, steps, stop conditions, required final report), Joule pastes it into Claude Code, Claude Code implements and reports back, Joule pastes the report back into this chat for review. Claude Code **never pushes** — commits locally only, Joule reviews then pushes manually via the same terminal pattern.
- **Content files (lesson files, `day30-quiz-content.md`, etc.) are the literal source of truth for Claude Code** — checkpoints are instructed to use exact content from these files, never paraphrase or invent.

## Repo structure (as of this handoff)

```
thai-talk-breaks/
├── LOCKED_DECISIONS.md          (v3.8+, LDTKB-001 through LDTKB-044)
├── BUILD_TRACKER.md              (v1.9+, 8-stage programme + Full 30-Day Delivery Checklist)
├── CLAUDE_AI_HANDOFF.md          (older handoff doc — read alongside this one)
├── AGENTS.md, ARCHITECTURE.md, ONBOARDING_FLOW.md, SCHEDULER.md
├── curriculum/
│   ├── pilot/                    (Week 1, Days 1–7 — fully complete)
│   │   ├── lesson-01 through lesson-07.md
│   │   ├── audio/ (22 files), images/ (22 files, Firefly)
│   │   └── pilot-image-prompt-list.md, pilot-audio-script-list.md
│   ├── week2-lessons-08-14.md    (content complete, reviewed)
│   ├── week3-lessons-15-21.md    (content complete, reviewed)
│   ├── week4-lessons-22-30.md    (content complete, reviewed — Day 29/30 sections point to their own files)
│   ├── week2-audio/, week3-audio/, week4-audio/  (79 files total, complete)
│   ├── week2-images/, week3-images/, week4-images/  (38 images total, complete)
│   ├── weeks234-audio-script-list.md, weeks234-illustration-prompts.md
│   ├── day30-quiz-content.md     (10 fixed questions, locked, complete)
│   ├── curriculum-review-log.md  (tracks every formal review pass — READ THIS for what's been checked)
│   └── day29/
│       ├── day29-story-draft.md          (8-page story, locked)
│       ├── day29-illustration-prompts.md (18 panels, all fixes applied)
│       ├── day29-living-comic-spec.md    (full interaction spec, fully resolved)
│       ├── images/ (8 pages, complete, Page 8 corrected)
│       └── audio/ (narration audio, complete)
└── potential-bots/
    └── thai-alphabet-vowels-course.md    (future idea, not in current scope)
```

## Current state — the Full 30-Day Delivery Checklist (4 categories)

This lives in `BUILD_TRACKER.md` and is the authoritative real-progress tracker (more granular than the 8-stage programme). Status as of this handoff:

### 1. Learner-facing materials — ✅ essentially complete
- Onboarding, Week 1 (content/audio/images), Weeks 2–4 (content/audio/images), Day 29 (story/illustration/audio), Day 30 (quiz content) — **all done**.

### 2. Technical/operational systems — 🟡 partial
- Checkpoints 1–3 (foundation, onboarding webhook, scheduler+delivery) — **done, pushed**.
- **Checkpoint 4 (activity response handling + Day 30 quiz-ladder) — prompt written, NOT yet run by Joule.** This is the next concrete implementation task.
- **Day 29 living comic Web App — spec fully done, ZERO code written.** Genuinely new architecture (Telegram Web App button → hosted interactive page), not an extension of existing bot-message code.

### 3. Deployment & real-world verification — ❌ not started at all
Nothing has ever run against a real Telegram bot, real Supabase project, or real Vercel deployment. Every checkpoint has explicitly avoided live deployment so far.

### 4. Business/legal/commercial readiness — ❌ not started
Stages 5–7: payment verification, commercial registration, privacy/refund policy pages. None begun.

## Key locked decisions from this session (LDTKB-039 through LDTKB-044)

- **LDTKB-039:** 30-day curriculum arc (4 weeks, topics), building on the 7-day pilot as Week 1.
- **LDTKB-040:** Age-relative "I" pronoun system (ผม/พี่ male, หนู/พี่ female) — applies wherever self-reference occurs across all 30 days.
- **LDTKB-041:** นะคะ is always spelled นะคะ (never นะค่ะ) whenever นะ combines with a female ending, overriding the general question/statement คะ/ค่ะ rule for this specific case.
- **LDTKB-042:** Day 30 format = 10-question quiz ladder, reusing the recognition-tap mechanic.
- **LDTKB-043:** Day 30 question selection = fixed curated set (not random), spanning all 4 weeks; completion shows both score and badge.
- **LDTKB-044:** Scheduler's day-window temporarily extended to 30 for **testing only** — explicitly NOT a change to the real 7-day pilot's commercial scope. Must be clearly marked in code as a testing bypass.
- **LDTKB-027 (heavily revised this session):** Image tool went ChatGPT → briefly considered ElevenLabs → final decision **Adobe Firefly**, specifically because ElevenLabs' Image & Video product was found (via direct research) to explicitly exclude IP-infringement indemnification, while Firefly explicitly includes it. Full research trail preserved in the decision itself.

## Important lessons learned / gotchas (don't rediscover these)

1. **Tone-marking bugs come in two flavors**, and both have occurred: (a) the *label* text ("Tone pattern" column) disagreeing with an already-correct diacritic mark, and (b) genuine diacritic errors. The systematic fix is a Python script comparing every diacritic character against its stated label — this caught real bugs a manual read had missed, multiple times. See `curriculum-review-log.md` for the full history.
2. **Documentation drift is real and has happened multiple times** — files describing superseded decisions (Lesson 1's activity, Day 29/30's original vision) that never got updated after the actual decision changed. When reviewing, always check for staleness/contradiction with what was actually built, not just completeness.
3. **Firefly-specific failure modes discovered and now defended against in all prompts:**
   - Phrases like "suitable for a mobile chat app" or "suitable for video" get misread as instructions to render actual phone/video-player UI chrome — always use neutral dimensional language ("vertical portrait orientation, tall aspect ratio") plus an explicit "no phone or app UI chrome" instruction.
   - Firefly will sometimes add **unplanned, garbled Thai text** to a scene even when not asked (a pedestal in one image got real-looking-but-wrong Thai script). Every prompt now explicitly states "no Thai script anywhere except the specified bubble text" (or "no Thai text at all" for the pilot's numeral images).
   - Ambiguous speaker/listener staging causes bubble misattribution — every prompt now explicitly states left/right position, mouth-open (speaking) vs. mouth-closed (listening), and confirms the non-speaker has NO bubble.
4. **Fill-in-the-blank lessons (Days 15, 17, 21) can't use pure pre-rendered audio** the way fixed-phrase lessons can. Resolved by using representative examples (matching the precedent already set by Day 13's "swap the word" teaching) — "Dtôm" (male) and "Nók" (female) for names, "ดูหนัง" for hobbies, "รถติด" for dislikes.
5. **When a phrase gets corrected in one file, check every other file that independently uses the same phrase** — the "mài→mâi" (ใหม่, "new") tone bug was found and fixed three separate times in three different files (Week 2's Day 14, Day 29's story draft, Day 29's illustration prompts) because each had typed it independently rather than referencing a shared source.

## Immediate next steps (pick up here)

1. **Run Checkpoint 4** (the prompt is already written — activity response handling + Day 30 quiz-ladder + the testing-only scheduler extension). Paste into Claude Code, review the report, then push.
2. **Design and build the Day 29 living comic Web App.** The full spec exists (`day29-living-comic-spec.md`) but zero code has been written. This is genuinely new architecture — treat it as its own dedicated technical planning conversation, following the Kiki Protocol reference pattern (bot button → Telegram Web App → hosted static page) but building the actual timed-audio/scroll/toggle logic from scratch, since nothing in Kiki does that.
3. **Eventually:** real deployment (live Supabase, live bot token, live Vercel), then business/legal readiness (Stages 5–7).

## Where to find everything else

- **Every locked product/content decision:** `LOCKED_DECISIONS.md` (LDTKB-001 through LDTKB-044) — always check this before assuming something is undecided.
- **Every review pass and what it found:** `curriculum/curriculum-review-log.md`.
- **High-level progress:** `BUILD_TRACKER.md`'s Full 30-Day Delivery Checklist.
- **Founding product philosophy, tone, non-goals:** `CLAUDE_AI_HANDOFF.md` (older doc, still authoritative for the "why" behind the product).
