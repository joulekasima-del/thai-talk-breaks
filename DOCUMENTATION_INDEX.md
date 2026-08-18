# Thai Talk Breaks — Documentation Index

**Version:** 1.4  
**Last updated:** 18 August 2026  
**Document owner:** Joule

## Purpose

This index explains what each project document controls. It prevents research notes, proposals and approved decisions from being confused with one another.

## Current documents

| File | Authority | Status | Purpose |
|---|---|---|---|
| `README.md` | Informational | Active | Entry point and current project status |
| `BUILD_TRACKER.md` | Programme control | Active | Tracks the eight approved stages, gates, evidence and next action |
| `LOCKED_DECISIONS.md` | Joule-approved decisions | Active | Records only decisions explicitly confirmed by Joule |
| `DOCUMENTATION_INDEX.md` | Documentation control | Active | Maps project documents and their authority |
| `CLAUDE_AI_HANDOFF.md` | Transition context | Active | Transfers planning coordination to Claude AI without changing Joule's decision authority or the programme stage |
| `research/INTERVIEW_SCRIPT.md` | Discovery method | Ready for use | Provides consistent, non-leading questions for Stage 2 |
| `research/INTERVIEW_RECORD_TEMPLATE.md` | Research evidence | Ready for use | Creates one anonymized evidence record per participant |
| `research/INTERVIEW_SUMMARY_TEMPLATE.md` | Research synthesis | Waiting for interviews | Compares all interviews and determines whether the Stage 2 gate passes |

## Planned document areas

These paths are planned by the build tracker but do not become requirements beyond their approved stage purpose.

| Stage | Planned path | Intended contents |
|---:|---|---|
| 2 | `research/interview-records/` | Ten anonymized interview records |
| 2 | `research/interview-summary.md` | Completed synthesis and gate assessment |
| 3 | `curriculum/pilot/` | Seven pilot lessons and review evidence |
| 4 | `pilot/` | Pilot plan, participant instructions, results and notification evidence |
| 5 | `payments/` | Checkout, buyer-visible pricing, support, refund and withdrawal verification |
| 6 | `operations/` | Registration and tax-recording checklist |
| 7 | `policies/` | Privacy, payment-support and refund documents |
| 8 | `launch/` | Launch checklist, monitoring and results |

## Document authority rules

1. `LOCKED_DECISIONS.md` is the source of truth for approved product and business decisions.
2. `BUILD_TRACKER.md` is the source of truth for project status and stage gates.
3. Interview records are evidence, not decisions.
4. The interview summary may recommend changes but cannot lock them.
5. Only Joule can approve a new decision or change a locked decision.
6. Claude AI prepares complete, standards-checked implementation prompts for Codex Desktop after the ChatGPT handoff.
7. Codex Desktop may implement and document approved work in the local repository but must not silently redesign it.
8. Each Codex prompt must state scope, locked constraints, required checks, stop conditions and report format.
9. Personal participant information must not be committed to the repository.

## Naming conventions

- Locked decisions: `LDTKB-###`
- Interview participants: `EU-01` through `EU-05` and `RU-01` through `RU-05`
- Dates: `YYYY-MM-DD`
- Participant records: `EU-01.md`, `RU-01.md`, and so on
- Document status: Draft, Ready for review, Approved, Superseded or Archived

## Repository safety

GitHub is the approved repository host and will become the canonical version-controlled location for these project documents and the eventual source code. GitHub repository hosting is separate from production deployment hosting.

Do not commit:

- names or Telegram usernames of interview participants;
- phone numbers or email addresses;
- Telegram bot tokens or payment credentials;
- raw payment identifiers;
- private recordings without written permission;
- identity documents, registration scans or tax credentials;
- `.env` files or downloaded local AI/audio tooling.

An optional private contact list may be maintained outside the repository. Participant IDs are used to connect a private contact record to an anonymized project record.
