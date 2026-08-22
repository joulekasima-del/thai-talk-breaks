# Day 29 — Audio Source Map (per panel)

**Complete as of 22 August 2026.** All 20 dialogue lines across the 8 pages now have their own dedicated recording, per LDTKB-045 (no reuse — every line gets its own file, even where the text is identical to something recorded elsewhere in the project). **All assets (8 images + 20 audio files) now live together in `curriculum/day29/assets/`**, consolidated from the previous separate `images/`/`audio/` folders for easier maintenance ahead of the living comic Web App build.

| Page | Panel | Thai / Karaoke | Audio file | Voice |
|---|---|---|---|---|
| 1 | 1 | สวัสดีค่ะ (sà-wàt-dii-kâ) | `day29_page01_panel1.mp3` | Female |
| 1 | 2 | ขอโทษนะคะ กี่โมงแล้วคะ (khǎaw-thôht-ná-ká, gìi-mohng-láew-ká) | `day29_page01_panel2.mp3` | Female |
| 1 | 3 | แปดโมงค่ะ (bpàet-mohng-kâ) | `day29_page01_panel3.mp3` | Female |
| 2 | 1 | เอากาแฟเย็นหนึ่งแก้วค่ะ หวานน้อยนะคะ (ao-gaa-fae-yen-nèung-gâew-kâ, wǎan-nói-ná-ká) | `day29_page02_panel1.mp3` | Female |
| 2 | 2 | ได้ครับ (dâi-kráp) | `day29_page02_panel2.mp3` | Male |
| 3 | 1 | มีใหญ่กว่านี้ไหมคะ (mii-yài-gwàa-níi-mǎi-ká) | `day29_page03_panel1.mp3` | Female |
| 3 | 2 | จ่ายผ่านบัตรได้ไหมคะ (jàai-pàan-bàt-dâai-mǎi-ká) | `day29_page03_panel2.mp3` | Female |
| 4 | 1 | วันนี้ร้อนมากค่ะ (wan-níi-rórn-mâak-kâ) | `day29_page04_panel1.mp3` | Female |
| 4 | 2 | หนูรู้สึกตัวร้อนค่ะ (nǔu-rúu-sèuk-dtua-rórn-kâ) | `day29_page04_panel2.mp3` | Female |
| 5 | 1 | คุณชื่ออะไรครับ (khun-chêu-à-rai-kráp) | `day29_page05_panel1_westerner.mp3` | Male (westerner) |
| 5 | 1 | ผมชื่อต้อมครับ (phǒm-chêu-dtôm-kráp) | `day29_page05_panel1_dtom.mp3` | Male (Dtôm) |
| 5 | 2 | เป็นคนที่ไหนครับ (bpen-kon-tîi-nǎi-kráp) | `day29_page05_panel2_dtom.mp3` | Male (Dtôm) |
| 5 | 2 | เป็นคนเยอรมันครับ (bpen-kon-yer-rá-man-kráp) | `day29_page05_panel2_westerner.mp3` | Male (westerner) |
| 5 | 3 | ชอบไปเที่ยวที่ไหนครับ (chôrp-bpai-tîeow-tîi-nǎi-kráp) | `day29_page05_panel3_westerner.mp3` | Male (westerner) |
| 5 | 3 | ดอยปุยครับ (doi-bpuy-kráp) | `day29_page05_panel3_dtom.mp3` | Male (Dtôm) |
| 6 | 1 | ไม่เข้าใจค่ะ (mâi-kâo-jai-kâ) | `day29_page06_panel1.mp3` | Female |
| 6 | 2 | พูดช้าๆได้ไหมคะ (phûut-cháa-cháa-dâai-mǎi-ká) | `day29_page06_panel2.mp3` | Female |
| 7 | 1 | ขอบคุณมากค่ะ (khàwp-khun-mâak-kâ) | `day29_page07_panel1.mp3` | Female |
| 7 | 2 | เจอกันใหม่ค่ะ (jer-gan-mài-kâ) | `day29_page07_panel2.mp3` | Female |
| 8 | 1 | อยากพูดไทยเก่งขึ้นค่ะ (yàak-phûut-thai-gèng-khûen-kâ) | `day29_page08_panel1.mp3` | Female |

## What changed on 22 August 2026

- **12 new recordings added**, completing every previously-missing line.
- **Page 2 Panel 1 is now a single combined audio file** (`day29_page02_panel1.mp3`, covering both "เอากาแฟเย็นหนึ่งแก้วค่ะ" and "หวานน้อยนะคะ" as one continuous line) — this replaces the earlier two-file design (`_bubble1`/`_bubble2`). The previously-existing `day29_page02_panel1_bubble2.mp3` is now superseded and has been removed from the repo. The image (`day29_page02.png`) still shows two separate speech bubbles visually — that's unaffected; one audio file can play continuously under two visual bubbles.
- **`day29_page08_panel2.mp3` renamed to `day29_page08_panel1.mp3`** — a naming fix noted earlier in the session that had not actually been completed; caught and fixed now during this consolidation.
- **All assets moved into one consolidated folder**, `curriculum/day29/assets/`, replacing the previous separate `curriculum/day29/images/` and `curriculum/day29/audio/` folders. Images and audio are distinguished by extension and by the consistent `day29_pageXX[_panelY[_speaker]]` naming convention already in use — every file for a given page shares the same page-number prefix, making it straightforward to see everything belonging to one page at a glance.

## For whoever builds the Day 29 living comic Web App

This table is the authoritative source for which audio file plays for each speech bubble. All files (images and audio) live in the single `curriculum/day29/assets/` folder — no cross-referencing into other lessons' folders is needed anymore (unlike the reuse-based approach originally considered and superseded by LDTKB-045). The app's asset-loading logic can assume everything it needs for Day 29 is in one place.
