# Thai Talk Breaks — Build Tracker

**Tracker version:** 2.0  
**Last updated:** 22 August 2026  
**Project owner:** Joule  
**Current stage:** Stage 3 — Complete (Week 1 only). Full 30-day delivery tracked via new checklist below.  
**Overall status:** See Full 30-Day Delivery Checklist for real progress across all 4 categories

## Status key

| Status | Meaning |
|---|---|
| ✅ Complete | Exit criteria met and evidence recorded |
| 🟡 In progress | This is active work |
| ⬜ Not started | Waiting for an earlier gate |
| ⛔ Blocked | Cannot continue until the blocker is resolved |
| ⏸ Deferred | Not required as a gate for later stages; may resume at owner's discretion |

## Programme tracker

| # | Stage | Status | Gate required to complete | Evidence location |
|---:|---|---|---|---|
| 1 | Lock the revised product direction | ✅ Complete | Product, audience, format, price intention, delivery behavior and founder role explicitly confirmed by Joule | `LOCKED_DECISIONS.md` |
| 2 | Interview five European and five Russian Telegram-using expats | ⏸ Deferred (LDTKB-022) | No longer required before Stage 3; may resume at Joule's discretion | Method/templates remain ready in `research/` if resumed |
| 3 | Create seven sample lessons | ✅ Complete | Seven reviewed lessons follow the locked content structure; Thai Karaoke is consistent; native audio and images complete | `curriculum/pilot/` (lesson files, `audio/`, `images/`) |
| 4 | Run a free pilot with notification testing | ⬜ Not started | Pilot learners onboarded; notification test completed; seven-day delivery measured; learner feedback and completion data summarized | To be created: `pilot/` |
| 5 | Verify the 500-Star checkout and withdrawal process | ⬜ Not started | Test purchase checked on relevant Telegram clients; buyer-visible cost recorded; refund/support path tested; withdrawal availability and net receipt documented | To be created: `payments/500-star-test.md` |
| 6 | Complete individual commercial registration | ⬜ Not started | Local authority confirms the correct registration; registration completed before regular public paid sales; tax-recording method established | To be created: `operations/registration-checklist.md` |
| 7 | Publish privacy, payment-support and refund information | ⬜ Not started | Public policies reviewed, accessible from the bot and consistent with actual data/payment behavior | To be created: `policies/` |
| 8 | Launch the 30-day paid product | ⬜ Not started | Paid curriculum approved; onboarding and delivery verified; monitoring/support ready; launch checklist passed | To be created: `launch/` |

## Stage 1 — Lock the revised product direction

**Status:** ✅ Complete  
**Completed:** 18 August 2026

### Completion record

- [x] Product is a spoken-Thai Telegram learning product, not a Thai reading course.
- [x] First audience is Telegram-using expatriates, with European and Russian communities as initial research groups.
- [x] Learner-facing lesson order is picture → Thai Karaoke → English meaning → Thai script as decorative/reference text → native Thai audio → small activity.
- [x] Learners choose their lesson times.
- [x] Onboarding includes a notification-sound test.
- [x] Low-friction price intention is approximately US$6.50, initially explored as 500 Telegram Stars.
- [x] Joule is the main producer and uses AI assistants and coding agents as production support.
- [x] The project begins without forming a company.
- [x] A free seven-day pilot comes before the paid 30-day product.

## Stage 2 — Interview five European and five Russian Telegram-using expats

**Status:** ⏸ Deferred (LDTKB-022, 18 August 2026)  
**Purpose:** Determine whether the intended customers understand, want and will pay for this exact product. Originally scoped as a required gate before lesson production; Joule has deferred it, proceeding directly to Stage 3 based on the locked multi-modal lesson structure (LDTKB-006) and direct product judgment. Pricing, notification tolerance, and Karaoke/tone-cue comprehension with the EU/RU audience remain untested by this method. This stage may be resumed at any time — the method, script and templates below remain ready for use.

### Required participants

- [ ] Five European Telegram-using expatriates
- [ ] Five Russian Telegram-using expatriates
- [ ] All participants are adults
- [ ] Participants live in Thailand, visit Thailand repeatedly, or are preparing to stay in Thailand

### Information to collect

- [ ] Their current Thai speaking ability
- [ ] Real-life situations where they most need Thai
- [ ] Whether they already use Telegram every day
- [ ] Preferred notification times and frequency
- [ ] Reaction to picture → Thai Karaoke → English → Thai-script reference → audio
- [ ] Whether tone cues would help or confuse them
- [ ] Reaction to a seven-day free trial and 30-day paid course
- [ ] Buyer-visible comfort with an approximately US$6.50 one-time price
- [ ] Objections, trust concerns and reasons they might stop using it
- [ ] Permission status for anonymous quotations

### Exit criteria

- [ ] Ten interview records completed
- [ ] At least five participants say the product solves a real problem for them
- [ ] At least three participants express credible willingness to pay approximately US$6.50
- [ ] The three most important daily-life lesson situations are identified
- [ ] The preferred number and timing of daily notifications are identified
- [ ] Major Russian-language onboarding needs are identified
- [ ] Findings are summarized without upgrading opinions into locked decisions

### Current next action

Deferred. If resumed, use `research/INTERVIEW_SCRIPT.md`, create records from `research/INTERVIEW_RECORD_TEMPLATE.md`, and keep identifying/contact information outside the repository. No action required to unblock later stages.

## Stages 3–8 — Gate notes

### Stage 3: Seven sample lessons

**Status:** ✅ Complete — content, native-speaker review, audio, and images all done for all 7 lessons (19 August 2026).  
All seven lessons drafted, reviewed by Joule (native Thai speaker), fully voiced (22 audio clips), and fully illustrated (22 images: 12 two-character interaction scenes for lessons 1, 3–7, gender-matched; 10 standalone numeral images for lesson 2). Grammar corrected during review: female question forms use คะ, not ค่ะ (statement form) — affects lessons 4, 5, 6. Lesson 6's phrase was also replaced (มาจากไหน → เป็นคนที่ไหน) during review. All content lives in `curriculum/pilot/` (lesson files, `audio/`, `images/`). One design detail remains open, not a Stage 3 blocker: confirming distractor-clip content for each recognition-tap activity — see individual lesson files.

## Full 30-Day Delivery Checklist

**Added 20 August 2026.** This checklist tracks what "fully delivered" actually means across four categories — deliberately more granular than the 8-stage programme above, since Stage 3 being "complete" only covers Week 1 and the design work, not the full 30-day product. Use this to track real progress; the 8-stage table above remains the authoritative high-level gate structure.

### Category 1 — Learner-facing materials

| Item | Status |
|---|---|
| Onboarding (6 messages) | ✅ Done |
| Week 1 content, audio, images (Days 1–7) | ✅ Done |
| Weeks 2–4 content (Days 8–28) | ✅ Done, content-QA reviewed (tone-mark accuracy, staleness/consistency — see `curriculum-review-log.md`). **Native-speaker pronunciation/tone review has NOT happened yet** (each week file's own "Open items" confirms this) — do not read "reviewed" as equivalent to the pilot's Stage 3 native-speaker review |
| Weeks 2–4 audio | ✅ Done (79 files: Week 2 = 25, Week 3 = 21, Week 4 = 33) — female voice recordings updated 21 Aug 2026 |
| Weeks 2–4 images | ✅ Done (38 images: Week 2 = 12, Week 3 = 13, Week 4 = 13) |
| Day 29 story + 8-page illustration | ✅ 8 of 8 pages confirmed correct — Page 2 regenerated 22 Aug 2026 with corrected "dâi-kráp" text, vertical layout, no invented Thai script/title |
| Day 29 narration audio | 🟡 **8 of 18 lines have a dedicated recording; 10 need fresh recording under LDTKB-045** (no more cross-lesson audio reuse — even the 9 lines with text identical to existing pilot/Week 2/4 audio need their own Day 29-specific file). See `day29-audio-map.md` for the full per-panel list of what's needed. Page 8's audio file was also renamed from `panel2` to `panel1` (naming fix — the story only ever specified one panel for that page). |
| Day 30 quiz content (10 questions) | ✅ Complete — all 30 audio files recorded (10 correct + 20 distractors, LDTKB-045), distractor pairing fixed, button wording (English text, LDTKB-046) locked. See `day30-quiz-content.md` and `day30-button-wording.md` |
| Day 30 completion badge (text/emoji) | ✅ Drafted ("🏅 Thai Talk Breaks Graduate") — draft only, not yet finalized/reviewed |
| Day 29 monkey mascot celebration image | ⬜ Not generated — part of the unbuilt Day 29 living comic Web App, not Day 30; see `day29-living-comic-spec.md` |
| Day 30 quiz functionality | ✅ Complete 22 Aug 2026 — implemented and tested in Checkpoint 4 (46/46 tests passing), pushed |

### Category 2 — Technical/operational systems (code)

| Item | Status |
|---|---|
| Checkpoint 1 (foundation) | ✅ Done |
| Checkpoint 2 (onboarding webhook) | ✅ Done |
| Checkpoint 3 (scheduler + delivery) | ✅ Done |
| Checkpoint 4 (activity handling, Lessons 2–7 + Day 30 quiz-ladder) | ✅ Done 22 Aug 2026 — 46/46 tests passing, pushed (`5cb1129`) |
| Checkpoint 5 (Weeks 2–4 activities, Days 8–28) | ✅ Done 22 Aug 2026 — 62/62 tests passing, pushed (`e144b5f`). Word-set activity pattern for Days 8/10/16/26 (Day 10 corrected into scope after being missed in original planning); Day 25 uses example #1; Days 15/17/21/22 use younger form only (LDTKB-047), with representative examples (Dtôm/Nók/ดูหนัง/รถติด) now documented in `week3-lessons-15-21.md` and correctly delivered in code |
| Day 29 living comic Web App | 🟡 Spec done, zero code written |

### Category 3 — Deployment & real-world verification

Every checkpoint so far has explicitly avoided deploying live. None of this has run against a real bot yet.

| Item | Status |
|---|---|
| Real Supabase project connected | ⬜ Not done |
| Real Telegram bot token + webhook set | ⬜ Not done |
| Real Vercel deployment (live) | ⬜ Not done |
| End-to-end test with an actual Telegram account | ⬜ Not done |

### Category 4 — Business/legal/commercial readiness (Stages 5–7 below, tracked in detail here)

| Stage | Item | Status |
|---|---|---|
| 5 | 500-Star checkout/withdrawal verification | ⬜ Not started |
| 6 | Individual commercial registration | ⬜ Not started |
| 7 | Privacy/payment-support/refund policy pages | ⬜ Not started |

### Stage 4: Free pilot

The bot can guarantee scheduled sending, not that every phone makes a sound. The onboarding test must confirm the user’s Telegram and phone settings before the first scheduled lesson.

### Stage 5: 500-Star verification

Do not advertise “US$6.50” until the customer-visible checkout has been observed. Five hundred Stars represent approximately US$6.50 in stated developer reward, but the customer’s acquisition cost may differ by platform, country, tax and app-store charges.

### Stage 6: Individual commercial registration

This is not company formation. Complete the appropriate individual commercial registration and establish income/expense records before regular paid public sales. Recheck the correct local process and current legal requirements at execution time.

### Stage 7: Policies

Policies must describe the real product behavior. At minimum: privacy, data deletion/contact, course access, payment support, refund conditions, technical notification limitation and educational-results disclaimer.

### Stage 8: Paid launch

Launch only after the preceding gates pass. The initial commercial objective is five paid learners, not scale. Record delivery success, completion, support time, refund requests, net Stars received and learner outcomes.

## Programme success test

The first commercial validation succeeds when:

- at least five real learners purchase the 30-day product;
- the scheduled lessons deliver reliably;
- the notification setup prevents avoidable sound failures;
- learners understand the Thai Karaoke presentation;
- curriculum review finds no serious pronunciation or beginner-comprehension problems;
- all required registration, tax-recording, privacy, payment-support and refund preparations are active;
- actual revenue, platform deductions and operating/support time are recorded.

## Change log

| Date | Change | Approved by |
|---|---|---|
| 18 Aug 2026 | Tracker created with the eight approved stages; Stage 1 completed and Stage 2 activated | Joule |
| 18 Aug 2026 | Stage 2 interview script, record template and summary template documented; next action advanced to first two interviews | Within approved Stage 2 scope |
| 18 Aug 2026 | Thai Talk Breaks locked as the product, project and repository name | Joule |
| 18 Aug 2026 | GitHub locked as the source-code and documentation repository host; repository creation remains pending explicit authorization | Joule |
| 18 Aug 2026 | ChatGPT → Codex Desktop working model locked; Codex receives bounded, standards-checked prompts and works separately in the local repository | Joule |
| 18 Aug 2026 | Coordination handed from ChatGPT to Claude AI; Codex Desktop remains the implementation agent | Joule |
| 18 Aug 2026 | Stage 2 (interviews) deferred per LDTKB-022; Stage 3 (seven sample lessons) activated as current stage without an interview prerequisite | Joule |
| 18 Aug 2026 | Implementation agent changed from Codex Desktop to Claude Code (LDTKB-023) after Codex reached a usage limit; no stage change | Joule |
| 19 Aug 2026 | Stage 3 complete: all 7 lessons content-reviewed (native speaker), voiced (22 audio clips), and illustrated (22 images) | Joule |
| 20 Aug 2026 | Added Full 30-Day Delivery Checklist (4 categories: materials, technical systems, deployment/verification, business/legal readiness) to track real progress beyond the 8-stage gate structure | Joule |
