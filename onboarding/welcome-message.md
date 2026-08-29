# Onboarding — Welcome Message

**Status:** Locked (LDTKB-031, superseded by LDTKB-050, formatting fixed and content revised LDTKB-053/054, ka-tic reduced LDTKB-055), 19 August 2026 / 23 August 2026 / 24 August 2026
**Sent:** First bot message after /start (does not branch by learner gender — see LDTKB-030)
**Language:** English (per LDTKB-029). Prior to LDTKB-055, "ka" was used as a recurring narrator tic across nearly every message in the product; as of LDTKB-055, this message's very first "Sawasdee ka!" is now the *only* remaining instance of that tic anywhere in the product — everywhere else it's been removed as a deliberate product decision.
**Voice note (23 August 2026):** this message deliberately uses "we," a departure from the narrator's usual fixed first-person "I" voice used everywhere else (LDTKB-030, and every other locked message in this project — onboarding steps, `/oops`, Day 29/30). Confirmed intentional by Joule, not an inconsistency to fix.
**Formatting note (24 August 2026, LDTKB-053/054):** this is the only message in the entire product sent with Telegram's HTML formatting enabled — a real bug was found where the original asterisks (intended as Markdown bold) were never actually rendered, since no `parse_mode` was ever set anywhere in the codebase. LDTKB-054 then further revised the message to use multiple, sometimes-nested `<b>`/`<i>` tags. Confirmed correct against Telegram's actual supported HTML tag set (`<b>`, `<i>`, not `<italic>`; every tag needs a proper `</tag>` close, not a repeated opening tag) before locking. Every other message in the product remains plain text, unaffected.
**Content note (LDTKB-054):** the community-channel section was substantially revised — new name ("Thai Talk: Jot It Down," replacing "Thai Talk Newsletter"), new link, a named host ("Chaa-yen"), and reframed from a passive newsletter to a weekly Saturday practice exercise. Also fixed a stale reference to the removed testing activity ("one quick activity to help it stick" → "explanation for daily use").
**Ka-tic note (LDTKB-055):** this message's second "ka" (in the /oops line) has been removed — only the very first "Sawasdee ka!" remains, as the sole surviving instance of this tic anywhere in the product.

---

Exact approved text and spacing below. Implement verbatim, including blank lines — they are part of the approved copy, not incidental formatting.

```
Sawasdee ka! 🙏 

Welcome to <b>Thai Talk Breaks</b>.

We're happy to have you here. 🌿

Thai Talk Breaks is a <b><i>30-day conversational Thai course</i></b> designed to help you build useful Thai little by little — without overwhelming study sessions.

<i>Your first 7 days are free.</i>

Each daily break is short and practical:
🖼️ one picture
💬 one useful Thai phrase
🔊 clear native Thai pronunciation
✨ explanation for daily use

No Thai script required. We'll focus first on Thai you can understand, say, and use in everyday life.

<i>If something ever seems confusing or doesn't work properly, just type <b>/oops</b> anytime. We'll take a look.</i>


And if you'd like to put your Thai into practice, join our <b>Thai Talk: Jot It Down</b> community. Every Saturday morning, <i>Chaa-yen</i> brings you a new little exercise to practise everyday Thai, improve your sentences, and learn together with the community.
👉 https://t.me/thaitalk_jot_it_down

That's it. No preparation needed.

Ready to begin?
```
