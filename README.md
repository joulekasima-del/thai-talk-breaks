# Thai Talk Breaks

This folder is the project-control centre for Joule's low-cost, notification-led spoken-Thai Telegram product for expatriates who already use Telegram.

## Project status

- Product direction: locked
- Product and project name: Thai Talk Breaks
- Repository host: GitHub
- Intended repository name: `thai-talk-breaks`
- Current stage: Stage 2 — interview five European and five Russian Telegram-using expats
- Paid product: not launched
- Company formation: not planned for the validation stage

## Working documents

- [Build Tracker](BUILD_TRACKER.md) — stages, gates, evidence and current action
- [Locked Decisions](LOCKED_DECISIONS.md) — approved product and business decisions
- [Documentation Index](DOCUMENTATION_INDEX.md) — file map, ownership and document status
- [Claude AI Handoff](CLAUDE_AI_HANDOFF.md) — transition context, authority, current state and Claude/Codex working rules
- [Interview Script](research/INTERVIEW_SCRIPT.md) — consistent questions for all 10 discovery interviews
- [Interview Record Template](research/INTERVIEW_RECORD_TEMPLATE.md) — one anonymized record per participant
- [Interview Summary Template](research/INTERVIEW_SUMMARY_TEMPLATE.md) — cross-participant evidence and Stage 2 gate decision

## Governance rule

A decision enters `LOCKED_DECISIONS.md` only when Joule explicitly confirms it. New ideas remain proposals until confirmed. If a locked decision changes, keep the old entry, mark it superseded, and link the replacement decision so the project history remains understandable.

## Repository status

GitHub is the approved host for the project's source code and documentation. The repository has not yet been created or connected from this workspace. Public/private visibility, licence, branch protection, deployment hosting and automation remain open decisions.

## AI working model

- Claude AI is the primary discovery, specification, documentation, review and Codex-prompt partner after the ChatGPT handoff.
- Codex Desktop works separately in the local repository and performs authorized file, code, test and Git operations.
- Claude AI prepares every Codex task as a bounded prompt containing the approved scope, locked constraints, checks, stop conditions and required report.
- Codex must not convert open questions into decisions or move to a later build-tracker stage without Joule's approval.

## Current next action

Use `research/INTERVIEW_SCRIPT.md` for the first two conversations: one European and one Russian Telegram-using expatriate. Create each participant record from `research/INTERVIEW_RECORD_TEMPLATE.md` and do not place names, Telegram usernames, phone numbers or other identifying information in the repository.
