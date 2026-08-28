# Onboarding — Welcome Message

**Status:** Locked (LDTKB-031, superseded by LDTKB-050, formatting fixed LDTKB-053), 19 August 2026 / 23 August 2026 / 24 August 2026
**Sent:** First bot message after /start (does not branch by learner gender — see LDTKB-030)
**Language:** English (per LDTKB-029), with ka as the only Thai flavor
**Voice note (23 August 2026):** this message deliberately uses "we," a departure from the narrator's usual fixed first-person "I" voice used everywhere else (LDTKB-030, and every other locked message in this project — onboarding steps, `/oops`, Day 29/30). Confirmed intentional by Joule, not an inconsistency to fix.
**Formatting note (24 August 2026):** this is the only message in the entire product sent with Telegram's HTML formatting enabled — a real bug was found where the original asterisks (intended as Markdown bold) were never actually rendered, since no `parse_mode` was ever set anywhere in the codebase; every learner has been seeing literal `*asterisks*` instead of bold text. Fixed by converting to real `<b>` tags and enabling HTML parse mode specifically for this one message (LDTKB-053) — every other message in the product remains plain text, unaffected.

---

Exact approved text and spacing below. Implement verbatim, including blank lines — they are part of the approved copy, not incidental formatting.

```
Sawasdee ka! 🙏 <b>Welcome to Thai Talk Breaks</b>.

We're happy to have you here. 🌿

Thai Talk Breaks is a 30-day conversational Thai course designed to help you build useful Thai little by little — without overwhelming study sessions.

Your first 7 days are free.

Each daily break is short and practical:
🖼️ one picture
💬 one useful Thai phrase
🔊 clear native Thai pronunciation
✨ one quick activity to help it stick

No Thai script required. We'll focus first on Thai you can understand, say, and use in everyday life.

If something ever seems confusing or doesn't work properly, just type /oops anytime, ka. We'll take a look.

And if you'd like a little more Thai between lessons, you can join Thai Talk Newsletter. We share useful expressions, everyday language, and small insights into how Thai is actually spoken — and how it changes over time.

👉 https://t.me/thaitalk_newsletter

That's it. No preparation needed.

Ready to begin?
```
