# AGENTS.md — Repository Rules for AI Agents

This repository is the canonical source-code and documentation home for **Thai Talk Breaks**, Joule's low-cost, notification-led spoken-Thai learning product delivered through Telegram (LDTKB-019). Any AI agent working here — Claude Code, Codex, or otherwise — must read the project documents completely before making changes, and follow this authority order when documents appear to conflict (per `CLAUDE_AI_HANDOFF.md` section 2):

1. `LOCKED_DECISIONS.md` — decisions explicitly approved by Joule
2. `BUILD_TRACKER.md` — programme stages, gates, current status and next action
3. `DOCUMENTATION_INDEX.md` — document authority, safety and repository rules
4. `README.md` — project overview
5. `CLAUDE_AI_HANDOFF.md` — transition context and Claude operating instructions
6. Research records and summaries — evidence, not decisions

## Repository safety — must never commit

Per `DOCUMENTATION_INDEX.md`, "Repository safety":

- names or Telegram usernames of interview participants;
- phone numbers or email addresses;
- Telegram bot tokens or payment credentials;
- raw payment identifiers;
- private recordings without written permission;
- identity documents, registration scans or tax credentials;
- `.env` files or downloaded local AI/audio tooling.

## Decision authority

Only Joule can approve a new locked decision or change an existing one. A decision enters `LOCKED_DECISIONS.md` only when Joule explicitly confirms it; until then it remains a proposal, not a requirement.

## Agent conduct

Any AI agent working in this repository must not:

- silently redesign the product;
- reopen locked decisions without a concrete conflict or new evidence;
- move the project to a later `BUILD_TRACKER.md` stage than the one currently marked active.

## Before making any change

Verify the actual working directory (`pwd`) matches the intended repository path — do not assume it. Stop and report rather than proceeding if the workspace, remote, or expected state does not match what a task describes.
