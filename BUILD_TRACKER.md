# Build Tracker

Status: Active

Version: 1.0

Owner: Product Owner

---

# Purpose

This is the living record of implementation progress referenced by `bootstrap/05_ENGINEERING_CONTRACT.md` and `bootstrap/07_PROJECT_ROADMAP.md`. It tracks what's actually being worked on and in what order. It does not replace specifications, the Decision Log, or the Backlog — it sequences work against them.

---

# Operating Principle — applies to every task added here, not just this pass

Journey Planner is founded solo and is intended to run on a fully AI-driven build process — there is no team to absorb complexity by throwing people at it.

For every backend and frontend choice, from here forward: prefer minimal, precise, and sustainable over feature-rich. A smaller thing that's fully understood and maintained by one person beats a larger thing that isn't. When in doubt, cut scope before adding process.

---

# How to Read This Document

**Now / Next / Later** — grouped by actual dependency, not by how urgent something feels. A task sits in Next only if something in Now genuinely has to finish first. A task sits in Later only if nothing currently depends on it starting sooner.

**Within each group**, tasks are sorted:

- Urgent + Important
- Important, not urgent
- Urgent, not important
- Neither

One line per task. This is a sequencing tool, not a scored matrix — don't over-engineer it.

**Flags** appear only on tasks that genuinely touch legal, cultural, or ethical concerns. Most tasks won't have one. A missing flag means none was found, not that it wasn't considered.

---

# Now

## Urgent + Important

- [x] Add authentication / access control to the live scouting form — right now anyone with the link can view, add, edit, or delete every entry, with no record of who did it. — **Flag:** real people's personal data is exposed with no protection, live, today. — **Done** (commit `c8239c1`).
- [x] Move scouted data off browser-only `localStorage` onto something that actually syncs and backs up — field data currently exists only on the single device it was typed on, with no export path, and is unrecoverable if that device is lost, reset, or cleared. — **Flag:** real field work can be permanently and silently lost. — **Done** (commit `c8239c1`).
- [x] Stop storing entries as plain readable text — anything typed into the form today is retrievable by anyone with a few seconds of access to the device via ordinary browser developer tools. — **Flag:** Thailand PDPA — personal data must be protected, not just collected. — **Done** (commit `c8239c1`).
- [ ] Get the PDPA consent / privacy notice reviewed by a legal or technical advisor — an honest interim notice is live on the form today, but it has not been reviewed by anyone with legal or technical authority on Thailand's PDPA and is not a finished compliance document. — **Flag:** Thailand PDPA — the interim notice reduces but does not close the lawful-basis gap until this review happens.
- [x] Tell hosts what's being recorded about them and why, at the point a Scout records it — there is currently no notice to the host at all. — **Flag:** Thailand PDPA / basic fairness — people are being written about without being told. — **Done** (commit `c8239c1`).
- [x] Scouting form UX refinement round 2 — Description moved to last with a deterministic (non-AI) draft generator, Tags/Best-visit/Languages converted to multi-select chips, Landscape & geographic story converted to three chip-picker groups (kept on the shared Place record, not per-Experience), a general reusable "Other → free text" mechanism applied everywhere Other appears, Fusion options added. — **Done** (commits `f57fe2b`, `a92f27b`) — **live authenticated save/reload test confirmed directly by the founder**, closing the one verification gap no AI session could close itself.

*(Full detail on all five: the Production Readiness Audit, 2026-08-10.)*

## Important, not urgent

- [ ] Hold a dedicated Explorer map / art-direction design session — a map interface is a strong, important direction the founder wants to pursue, but it is no longer tied to the pixel-art Creative Framework (superseded for Journey Planner by JP-013) and no replacement visual language has been decided yet. Not a locked decision to build, and not a coding task until that session happens.

## Urgent, not important

*(none currently)*

## Neither

*(none currently)*

---

# Next

Nothing is queued here yet. Items move into Next only once something in Now genuinely blocks them — not by default, and not just because they feel like they should come "after." Revisit this section as Now items close out.

---

# Later

## Important, not urgent

- [ ] CBT certification — parked, awaiting a founder decision on whether and when to pursue it. Nothing further defined yet.
- [ ] Phase IV (Booking System) Discovery — ~28 unlocked, non-duplicated candidate ideas (availability models, seat holds, booking lifecycle, guest checkout, price snapshots, and similar) are already preserved in `bootstrap/09_BACKLOG.md`, under **"Reference — Phase IV Booking Domain Candidate Ideas"** (commit `96aaa73`). Read them there when Phase IV Discovery actually begins — do not duplicate the list into this file.

## Urgent, not important

*(none currently)*

## Neither

*(none currently)*

---

# Revision History

| Date | Change |
|---|---|
| 2026-08-10 | Created. Seeded with the five Critical findings from the Production Readiness Audit (Now / Urgent+Important), the Explorer map/art-direction session (Now / Important), CBT certification (Later, parked), and a link to the Phase IV booking-domain reference list already in the Backlog (Later). |
