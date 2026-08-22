# Day 30 — Quiz Ladder Content

**Format:** locked (LDTKB-042) — 10-question quiz ladder, recognition-tap mechanic, reusing the exact infrastructure Claude Code built in Checkpoint 3.
**Selection method:** locked (LDTKB-043) — fixed curated set of 10, spanning all four weeks, not randomized.
**Audio/text design:** locked (LDTKB-046) — unlike every other lesson, Day 30's spoken audio drops the ครับ/ค่ะ/คะ particle and any gendered pronoun, and the on-screen button shows the **English meaning**, not Thai text — a deliberate mismatch so the learner is tested on listening comprehension, not text matching.
**No audio reuse:** locked (LDTKB-045) — every one of the 30 audio clips (10 correct answers + 20 distractors) is its own dedicated recording, even where the same phrase/meaning appears in more than one question slot.
**Production status:** ✅ Complete 22 August 2026 — all 30 audio files recorded and in `curriculum/day30-audio/`. See `day30-button-wording.md` for the full audio-file-to-button-text mapping.

---

## The 10 questions

| # | Day | Week | Karaoke phrase (as originally taught) | English meaning | Correct-answer audio |
|---|---|---|---|---|---|
| 1 | Day 1 | 1 | sà-wàt-dii kráp/kâ | Hello | `Q1_correct_answer.mp3` |
| 2 | Day 4 | 1 | tâo-rài kráp/ká | How much? | `Q2_correct_answer.mp3` |
| 3 | Day 7 | 1 | mâi-kâo-jai kráp/kâ | I don't understand | `Q3_correct_answer.mp3` |
| 4 | Day 9 | 2 | gìi-mohng-láew kráp/ká | What time is it now? | `Q4_correct_answer.mp3` |
| 5 | Day 13 | 2 | ao-gaa-fae-yen-nèung-gâew kráp/kâ | I'll take one iced coffee | `Q5_correct_answer.mp3` |
| 6 | Day 17 | 3 | (phǒm/phîi/nǔu)-chôrp...kráp/kâ | I like watching movies | `Q6_correct_answer.mp3` |
| 7 | Day 19 | 3 | a-rôi-mâak kráp/kâ | This is very delicious! | `Q7_correct_answer.mp3` |
| 8 | Day 20 | 3 | khǎaw-thôht kráp/kâ | Sorry | `Q8_correct_answer.mp3` |
| 9 | Day 22 | 4 | (phǒm/phîi/nǔu)-bpùat-hǔa kráp/kâ | I have a headache | `Q9_correct_answer.mp3` |
| 10 | Day 27 | 4 | khàwp-khun-mâak kráp/kâ | Thank you very much | `Q10_correct_answer.mp3` |

**Note:** the "Karaoke phrase" column shows how each phrase was originally taught (with particle/pronoun). The actual Day 30 audio (`Q1_correct_answer.mp3` etc.) drops the particle and pronoun per LDTKB-046 — see `day30-button-wording.md` for exactly what's spoken in each file.

**Why these 10:** picked for high everyday utility (not the most "interesting" phrases, the most *usable* ones) and even spread — 3 from Week 1, 2 each from Weeks 2–4. Question 6 uses the age-relative pronoun system (LDTKB-040) in its original teaching context, though the quiz audio itself has the pronoun stripped per LDTKB-046.

## Question format (per question)

Example — Question 1:
> **Prompt:** Play `Q1_correct_answer.mp3` (the learner hears "สวัสดี," no particle).
> **Options shown as 3 buttons, English text only** (per LDTKB-046): "Hello" / "Sorry" / "See you again" — order randomized per LDTKB-043's spirit of not telegraphing the answer position.
> **On correct tap:** brief positive feedback, advance to Question 2.
> **On incorrect tap:** brief gentle feedback (e.g. "Not quite — that was 'Hello'"), still advance (no retry loop, keeps the ladder moving).

**Full distractor pairing (fixed set, resolved 22 August 2026 — see Open Items):**

| # | Correct answer | Distractor 1 | Distractor 2 |
|---|---|---|---|
| 1 | Hello | Sorry | See you again |
| 2 | How much? | Can I pay by card? | Book one night |
| 3 | I don't understand | Help! | Sorry |
| 4 | What time is it? | See you tomorrow | See you again |
| 5 | I'll take one iced coffee | I'll take this one | This is very delicious! |
| 6 | I like watching movies | I don't like traffic | My name is Dtom |
| 7 | This is very delicious! | It's very hot today | Thailand is beautiful |
| 8 | Sorry | I don't understand | Help! |
| 9 | I have a headache | I have a stomach ache | I feel feverish |
| 10 | Thank you very much | Hello | Sorry |

Every audio/button combination for all 30 slots (10 correct + 20 distractors) is documented file-by-file in `day30-button-wording.md`.

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
1. ~~Distractor selection for each of the 10 questions...~~ **Resolved 22 August 2026** — fixed curated pairing (not random), see the table above. This also supersedes the "reuses Checkpoint 3's random distractor-selection logic" line from the original design — Day 30 no longer uses that runtime logic, since every distractor now needs a specific pre-recorded audio file.
2. Badge name/design — draft only, welcomes your input.
3. Closing message — draft only, needs native-speaker review like everything else.
4. ~~Weeks 2–4 audio production remains the real blocker...~~ **Superseded 22 August 2026 by LDTKB-045** — Day 30 no longer uses Weeks 2–4 lesson audio at all; every question now has its own dedicated Day-30-specific recording (see production status above).
