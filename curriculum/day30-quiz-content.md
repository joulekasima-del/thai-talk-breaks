# Day 30 — Quiz Ladder Content

**Format:** locked (LDTKB-042) — 10-question quiz ladder, recognition-tap mechanic (2–3 audio options, learner taps the correct one), reusing the exact infrastructure Claude Code built in Checkpoint 3.
**Selection method:** locked (LDTKB-043) — fixed curated set of 10, spanning all four weeks, not randomized.
**⚠️ Production dependency:** questions from Days 8–28 (marked below) cannot go live until that week's audio is produced — currently not started for Weeks 2–4. This list is the *content design*, ready for whenever production catches up.

---

## The 10 questions

| # | Day | Week | Karaoke phrase | English meaning | Audio status |
|---|---|---|---|---|---|
| 1 | Day 1 | 1 | sà-wàt-dii kráp/kâ | Hello | ✅ Ready |
| 2 | Day 4 | 1 | tâo-rài kráp/ká | How much? | ✅ Ready |
| 3 | Day 7 | 1 | mâi-kâo-jai kráp/kâ | I don't understand | ✅ Ready |
| 4 | Day 9 | 2 | gìi-mohng-láew kráp/ká | What time is it now? | ⚠️ Needs Week 2 audio |
| 5 | Day 13 | 2 | ao-gaa-fae-yen-nèung-gâew kráp/kâ | I'll take one iced coffee | ⚠️ Needs Week 2 audio |
| 6 | Day 17 | 3 | (phǒm/phîi/nǔu)-chôrp...kráp/kâ | I like... | ⚠️ Needs Week 3 audio |
| 7 | Day 19 | 3 | a-rôi-mâak kráp/kâ | This is very delicious! | ⚠️ Needs Week 3 audio |
| 8 | Day 20 | 3 | khǎaw-thôht kráp/kâ | I'm sorry | ⚠️ Needs Week 3 audio |
| 9 | Day 22 | 4 | (phǒm/phîi/nǔu)-bpùat-hǔa kráp/kâ | I have a headache | ⚠️ Needs Week 4 audio |
| 10 | Day 27 | 4 | khàwp-khun-mâak kráp/kâ | Thank you very much | ⚠️ Needs Week 4 audio |

**Why these 10:** picked for high everyday utility (not the most "interesting" phrases, the most *usable* ones) and even spread — 3 from Week 1, 2 each from Weeks 2–4. Question 6 uses the age-relative pronoun system (LDTKB-040), reflecting a genuinely new skill introduced partway through the course.

## Question format (per question, matching the recognition-tap pattern)

Example — Question 1:
> **Prompt:** Which one means "Hello"?
> **Options:** 3 audio clips — the correct answer (Day 1's phrase) + 2 distractors (drawn from other already-taught phrases, reusing Checkpoint 3's existing distractor-selection logic)
> **On correct tap:** brief positive feedback, advance to Question 2
> **On incorrect tap:** brief gentle feedback (e.g. "Not quite — that was [X]"), still advance to Question 3 (no retry loop, keeps the ladder moving)

## Completion screen (locked format: score + badge, per LDTKB-043)

**Score display:**
> You got **[X]/10**! 🎉

**Badge:**
> 🏅 **Thai Talk Breaks Graduate**

*(Badge name is a draft — happy to workshop this if you want something with more personality or a Thai-language touch.)*

## Closing message (draft, not yet locked)

> That's 30 days down, ka! You've learned real, useful Thai — and this is really just the beginning.
>
> The best way to keep going? Talk to real people. Thai grows and lives in real conversations, not just lessons.
>
> Thank you for learning with me. เก่งมากค่ะ! 🙏

*(This draft references the "learn through the real Thai community" spirit from CLAUDE_AI_HANDOFF.md's future-ideas note. "เก่งมากค่ะ" = "well done/you're skilled!" — a genuine compliment, not just generic praise. Needs your review same as every other piece of Thai content.)*

## Open items
1. Distractor selection for each of the 10 questions — which 2 specific wrong answers per question — not yet detailed, follows the same logic Claude Code already built (random from other already-taught phrases).
2. Badge name/design — draft only, welcomes your input.
3. Closing message — draft only, needs native-speaker review like everything else.
4. Weeks 2–4 audio production remains the real blocker before 7 of these 10 questions can function in the live bot.
