# Thai Talk Breaks — Build Tracker

**Tracker version:** 1.5  
**Last updated:** 18 August 2026  
**Project owner:** Joule  
**Current stage:** Stage 3 — Create seven sample lessons  
**Overall status:** Lesson production (Stage 2 interviews deferred — see LDTKB-022)

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
| 3 | Create seven sample lessons | 🟡 In progress | Seven reviewed lessons follow the locked content structure; Thai Karaoke is consistent; native audio and image rights are recorded | To be created: `curriculum/pilot/` |
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

**Status:** 🟡 In progress — active as of 18 August 2026.  
Lesson production no longer requires Stage 2 closure (LDTKB-022). Since interview evidence isn't available to choose situations, lesson topics/situations should be chosen deliberately using best available judgment (e.g. Joule's own lived experience, the German Breaks precedent, or other informal input) and documented as such rather than presented as customer-validated. Every lesson still needs a pronunciation/curriculum review and documented image/audio usage rights.

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
