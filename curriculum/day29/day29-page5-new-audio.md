# Day 29 — Page 5 New Audio List
Phrases from Page 5 ("At the Motorbike Shop") that need fresh audio generation — either genuinely new content, or close-but-not-identical to something already locked/produced. One phrase in this scene can reuse existing audio and is excluded below.

**Reminder for illustration:** speech bubble text in the final comic uses the **Karaoke (romanized) version**, not Thai script — matching how every other lesson works (Thai script stays decorative per LDTKB-006/007).

---

## Needs fresh audio (paste Thai script into ElevenLabs)

| # | Category | Thai script | Karaoke | Speaker |
|---|---|---|---|---|
| 1 | 🟡 Genuinely new | คุณชื่ออะไรครับ | khun-chêu-à-rai-kráp | Westerner (male) |
| 2 | ⚠️ Similar, not exact | ผมชื่อต้อมครับ | phǒm-chêu-dtôm-kráp | Thai boy (male) |
| 3 | 🟡 Genuinely new | เป็นคนเยอรมันครับ | bpen-kon-yer-rá-man-kráp | Westerner (male) |
| 4 | 🟡 Genuinely new | ชอบไปเที่ยวที่ไหนครับ | chôrp-bpai-tîeow-tîi-nǎi-kráp | Westerner (male) |
| 5 | New (specific content) | ดอยปุยครับ | doi-bpuy-kráp | Thai boy (male) |

**Why #2 is flagged "similar, not exact":** Day 15's locked content is the *template* "ผมชื่อ...ครับ" (My name is ___) — a blank, not a specific instance. "ผมชื่อต้อมครับ" (My name is Tom) has never actually been generated as real audio, since Day 15 itself doesn't have audio yet (Week 3 production hasn't started). This is close enough to feel like it should already exist, but it genuinely doesn't — needs its own generation.

## Can reuse existing audio — do NOT regenerate

| Thai script | Existing file | Why it's an exact match |
|---|---|---|
| เป็นคนที่ไหนครับ | `curriculum/pilot/audio/lesson06_male.mp3` | Byte-for-byte the same phrase already locked and produced for Day 6 (Week 1 pilot) |

---

## Notes
- Two speakers in this scene need distinct voices: the Westerner (male, presumably your existing male voice clone/branch) and the Thai boy (also male, but should probably sound distinctly younger/different from the Westerner's voice — worth deciding whether that needs a second male voice, or if the same voice works fine for a comic where the art itself distinguishes the speakers).
- **⚠️ Flagged for extra scrutiny:** เยอรมัน (German) is a transliterated loanword — its tone pattern is conventional rather than cleanly rule-derived, so it's a good one to double-check by ear even more carefully than usual.
- This list covers Page 5 only, since that's what's been finalized so far. The other 7 pages will need their own audio lists once each is confirmed — most of their content reuses exact phrases already locked and produced in Week 1, but this should be checked page by page, not assumed.

---

## Ready to generate — organized by voice clone

### Westerner man — paste these 3 lines
```
คุณชื่ออะไรครับ
```
```
เป็นคนเยอรมันครับ
```
```
ชอบไปเที่ยวที่ไหนครับ
```

### Thai boy — paste these 2 lines
```
ผมชื่อต้อมครับ
```
```
ดอยปุยครับ
```

### Not needed — already exists
`เป็นคนที่ไหนครับ` → reuse `curriculum/pilot/audio/lesson06_male.mp3`, no generation needed.
