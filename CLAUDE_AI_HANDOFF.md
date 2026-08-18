# Thai Talk Breaks — Handoff from ChatGPT to Claude AI

**Handoff version:** 1.0  
**Date:** 18 August 2026  
**Prepared by:** ChatGPT  
**For:** Claude AI  
**Product owner and decision authority:** Joule

## 1. Purpose of this handoff

Joule is moving the primary planning conversation for Thai Talk Breaks from ChatGPT to Claude AI while continuing to use Codex Desktop as the implementation agent.

Claude AI is asked to become the project's:

- discovery and product-thinking partner;
- specification author;
- documentation coordinator;
- curriculum-structure reviewer;
- business and risk-analysis partner;
- quality-assurance reviewer;
- author of complete, bounded prompts for Codex Desktop.

Codex Desktop remains responsible for authorized work in the local repository, including files, code, tests and Git operations. Claude AI should not claim that Codex has performed an action until Joule returns Codex's actual report.

The authoritative project documents accompany this handoff. Read all of them completely before recommending or authorizing work.

## 2. Authority order

If documents appear to conflict, use this order:

1. `LOCKED_DECISIONS.md` — decisions explicitly approved by Joule
2. `BUILD_TRACKER.md` — programme stages, gates, current status and next action
3. `DOCUMENTATION_INDEX.md` — document authority, safety and repository rules
4. `README.md` — project overview
5. `CLAUDE_AI_HANDOFF.md` — transition context and Claude operating instructions
6. Research records and summaries — evidence, not decisions

Do not upgrade a recommendation, assumption, interview comment or research finding into a locked decision. Only Joule can lock, change or supersede a decision.

## 3. Project at a glance

**Approved name:** Thai Talk Breaks  
**Intended repository name:** `thai-talk-breaks`  
**Repository host:** GitHub  
**Current project stage:** Stage 2 — customer interviews  
**Current product state:** Documentation and research preparation; no Thai Talk Breaks application has been built  
**Founder:** Joule  
**Initial audience:** Adult expatriates who already use Telegram; European and Russian Telegram communities are the first research groups

### Product idea

Thai Talk Breaks is a very inexpensive, notification-led spoken-Thai learning product delivered through Telegram. It is designed for expatriates who already use Telegram and want practical Thai without first learning to read Thai.

The intended experience is simple:

1. The learner starts the Telegram bot.
2. The learner selects their preferred lesson times.
3. The bot sends a notification test.
4. The learner confirms that the Telegram message arrived and made an audible sound on their device.
5. Short lessons arrive automatically at the selected times.
6. The learner sees, listens, repeats and completes one small activity.

### Locked lesson presentation

The core learner-facing sequence is:

1. picture;
2. Thai Karaoke pronunciation written with Roman/English letters;
3. English meaning;
4. Thai script as a small decorative/reference element;
5. native Thai audio;
6. one small completion, speaking, recognition or recall activity.

Thai script is not the tested skill. “Thai Karaoke” describes the lesson method but is not the brand name.

## 4. Origin of the product

The idea came from Joule's personal use of a Telegram learning bot called Joule's German Breaks. That bot demonstrated the value of scheduled micro-lessons delivered inside Telegram, but it also revealed important product lessons.

### Useful foundation proven by German Breaks

- Telegram can deliver scheduled lessons at Thailand times.
- Short text and audio lessons are convenient.
- A learner benefits from seeing, hearing, repeating, handwriting and recall.
- Offline generated audio avoids paid runtime speech-API costs.
- Text should be recorded as successfully sent before optional audio is attempted, preventing duplicate lessons after an audio failure.
- Delivery must be idempotent and observable.

### Problems Thai Talk Breaks must not repeat

- A beginner was tested with language they had not yet been taught.
- An ambiguous English/German `man`/`Mann` item created confusion.
- A scheduled message can be sent successfully without the learner hearing a sound because Telegram, mute state, Focus/Do Not Disturb, device volume and operating-system permissions control notifications.
- Technical success is not the same as educational success.

Therefore Thai Talk Breaks must enforce:

- teach before testing;
- beginner instructions in a language the learner understands;
- no ambiguous prompts without context;
- native-speaker pronunciation review;
- a notification-sound test during onboarding;
- an honest promise that the bot sends on time but cannot itself force the phone to make sound.

## 5. Locked commercial direction

- The intended price is deliberately low-friction, close to US$6.50.
- The initial Telegram test price is 500 Stars.
- Five hundred Stars represent approximately US$6.50 of Telegram's stated developer reward, not necessarily the buyer's exact checkout cost.
- Customer-visible pricing must be tested on relevant Telegram clients and countries before advertising a dollar amount.
- The initial paid product is a 30-day experience.
- The full paid product follows a free seven-day pilot.
- Joule is the main creator and operator, supported by AI assistants and AI coding agents.
- The strategy does not use a high price to signal value. Value comes from usefulness, convenience, pronunciation quality, understandable lessons and reliable delivery.
- The first commercial validation goal is five real paying learners, not scale.

## 6. Business and legal context

The following summarizes research and planning context. It does not replace current professional legal or tax advice.

- Joule can begin as a Thai individual and does not need to form a limited company during validation.
- The free pilot should come before regular paid public sales.
- Before regular paid public sales, Joule intends to verify and complete the appropriate individual commercial registration and establish income/expense records.
- Personal income remains reportable even without a company.
- Thai VAT registration generally becomes compulsory after annual revenue exceeds 1.8 million THB, subject to current law and exemptions.
- OCPB direct-marketing registration has an individual-income exemption around the same threshold according to the official research reviewed, but requirements must be rechecked at execution time.
- Telegram requires digital goods and services sold inside bots to use Telegram Stars, with payment support and refund handling.
- The product needs accessible privacy, payment-support and refund information before paid launch.
- Learner personal information must be minimized and protected.
- Begin with adult learners to avoid additional child-consent and safeguarding complexity.

Claude should use current official Thai and Telegram primary sources whenever giving legal, tax, payment or platform guidance.

## 7. Approved eight-stage programme

| # | Stage | Current status |
|---:|---|---|
| 1 | Lock the revised product direction | Complete |
| 2 | Interview five European and five Russian Telegram-using expats | In progress |
| 3 | Create seven sample lessons | Not started |
| 4 | Run a free pilot with notification testing | Not started |
| 5 | Verify the 500-Star customer checkout and withdrawal process | Not started |
| 6 | Complete the inexpensive individual commercial registration | Not started |
| 7 | Publish privacy, payment-support and refund information | Not started |
| 8 | Launch the 30-day paid product | Not started |

Do not move to a later stage merely because it is technically possible. The gate and evidence requirements are defined in `BUILD_TRACKER.md`.

## 8. Current Stage 2 work

The research documentation is ready:

- `research/INTERVIEW_SCRIPT.md`
- `research/INTERVIEW_RECORD_TEMPLATE.md`
- `research/INTERVIEW_SUMMARY_TEMPLATE.md`

Stage 2 requires:

- five European Telegram-using expatriates;
- five Russian Telegram-using expatriates;
- adult participants who live in Thailand, visit repeatedly or are preparing to stay;
- anonymized repository records using `EU-01`–`EU-05` and `RU-01`–`RU-05`;
- contact details stored outside Git;
- evidence about real Thai-speaking problems, Telegram behavior, notification tolerance, lesson-format comprehension and willingness to pay.

### Current product action

Recruit and interview the first two participants: one European and one Russian Telegram user.

Claude should help Joule conduct and synthesize the interviews without leading participants or turning a sample of five people into cultural generalizations.

## 9. Repository status and next Codex checkpoint

GitHub is locked as the canonical repository host, but the repository has not yet been created or connected from the ChatGPT workspace.

The intended local path is:

```text
/Users/mac/Documents/GitHub/thai-talk-breaks
```

### Next Codex Desktop work package

The next technical action is a documentation-only Repository Foundation Checkpoint:

1. Confirm the exact local workspace and required documents.
2. Stop if the workspace is wrong, files are missing or an unrelated repository exists.
3. Read all project documents completely.
4. Initialize a local Git repository on `main` if needed.
5. Add a conservative `.gitignore`.
6. Add `AGENTS.md` containing repository rules derived from approved documents.
7. Validate Markdown links, whitespace, secret safety, participant privacy and tracker/decision integrity.
8. Create one local commit: `docs: establish Thai Talk Breaks project foundation`.
9. Stop without creating a GitHub remote, pushing, deploying, installing dependencies or creating application code.

Repository visibility, licence, remote creation and first push remain open decisions. Claude must not ask Codex to choose them.

## 10. Claude AI → Codex Desktop prompt standard

Every Codex prompt must include:

1. **Goal** — one bounded outcome.
2. **User** — who the work serves.
3. **Required workspace** — exact path and checks before modification.
4. **Inputs** — source files and authority order.
5. **Outputs** — exact expected files or behavior.
6. **Locked decisions** — relevant constraints copied accurately.
7. **Permitted changes** — explicit authorization boundary.
8. **Prohibited changes** — actions Codex must not take.
9. **Steps** — inspect, implement, validate and report.
10. **Edge cases and stop conditions** — when Codex must stop rather than assume.
11. **Success tests** — commands and behavioral checks.
12. **Git instructions** — whether staging, committing, pushing or deploying is allowed.
13. **Required final report** — workspace, changed files, checks, Git status, commit and blockers.

Codex prompts should be ready to paste without asking Joule to translate product decisions into technical language.

## 11. Claude operating rules

Claude AI should:

- communicate with Joule in plain English;
- explain business and technical terms without assuming expertise;
- lead with the recommended next action;
- ask only questions that materially affect the result;
- distinguish discovery, locked decisions, production specifications and implementation;
- document decisions only after Joule explicitly confirms them;
- challenge unsafe, legally uncertain, educationally weak or technically misleading assumptions with evidence;
- preserve the eight-stage programme unless Joule explicitly changes it;
- use current primary sources for unstable factual claims;
- give named-application instructions whenever Joule must work in Finder, Browser, GitHub or Codex Desktop;
- provide complete Codex prompts rather than fragments;
- review Codex's returned evidence before authorizing the next checkpoint.

Claude AI should not:

- silently redesign the product;
- reopen locked decisions without a concrete conflict or new evidence;
- treat Thai script as a reading curriculum;
- describe Thai Karaoke as singing;
- promise that the bot can force notification sound;
- advertise 500 Stars as exactly US$6.50 to every buyer;
- build the full curriculum before Stage 2 passes;
- place personal interview data in Git;
- authorize pushes, deployments, payments or external mutations without Joule's explicit scope.

## 12. Relevant open decisions

These are not locked:

- final Telegram bot username;
- exact Thai Karaoke transliteration and tone-cue standard;
- number of daily notifications;
- lesson times or scheduling choices offered;
- Russian-language interface and translation scope;
- exact 30-day curriculum and outcome;
- visual style and image-production method;
- final Star amount if buyer-visible pricing makes 500 Stars unsuitable;
- refund window and eligibility rules;
- data-retention period;
- repository public/private visibility;
- repository licence;
- branch protection and contribution rules;
- production runtime, database, scheduler and media hosting;
- whether the German Breaks engine is forked, generalized or rebuilt.

Claude may help Joule discover and evaluate these questions, but must not decide them autonomously.

## 13. Required first response from Claude AI

After receiving this handoff and the project package, Claude should:

1. Confirm that it has read every included Markdown file completely.
2. State the authority order it will follow.
3. Confirm that Stage 1 is complete, Stage 2 is in progress and Stages 3–8 are not started.
4. Confirm that it will prepare bounded prompts for Codex Desktop and will not claim Codex actions without returned evidence.
5. Identify the immediate technical checkpoint: local documentation repository foundation.
6. Identify the immediate product checkpoint: first European and Russian interviews.
7. Report any actual conflict found in the documents.
8. Stop and wait for Joule to choose whether to run the repository checkpoint or begin interview recruitment first.

Claude should not produce application architecture, curriculum lessons or a new strategic plan in its first response.

## 14. Handoff completion statement

This handoff transfers conversational project coordination from ChatGPT to Claude AI. It does not transfer Joule's decision authority, change any product stage, authorize implementation beyond the described repository checkpoint or represent that a GitHub repository already exists.

Claude AI should preserve the project history and continue from the current checkpoint rather than restarting discovery from zero.

