// Day 29 living comic — pure content data. Source of truth for filenames is
// curriculum/day29/day29-audio-map.md (the audio-map table's row order per
// page is exactly the panel/speaker order used here — see that table for
// the Thai/karaoke text this data doesn't repeat). Source of truth for
// locked copy (quest question, options, completion message) is
// curriculum/day29/day29-living-comic-spec.md.

export interface Day29Speech {
  audioFile: string;
  /** Which panel (1-indexed, within the page) this speech belongs to — drives the 2s/3s gap rule in audioSequencer.ts. */
  panel: number;
}

export interface Day29Page {
  pageNumber: number;
  image: string;
  speeches: Day29Speech[];
}

export const DAY29_STORY_PAGES: Day29Page[] = [
  {
    pageNumber: 1,
    image: "day29_page01.png",
    speeches: [
      { audioFile: "day29_page01_panel1.mp3", panel: 1 },
      { audioFile: "day29_page01_panel2.mp3", panel: 2 },
      { audioFile: "day29_page01_panel3.mp3", panel: 3 },
    ],
  },
  {
    pageNumber: 2,
    image: "day29_page02.png",
    speeches: [
      { audioFile: "day29_page02_panel1.mp3", panel: 1 },
      { audioFile: "day29_page02_panel2.mp3", panel: 2 },
    ],
  },
  {
    pageNumber: 3,
    image: "day29_page03.png",
    speeches: [
      { audioFile: "day29_page03_panel1.mp3", panel: 1 },
      { audioFile: "day29_page03_panel2.mp3", panel: 2 },
    ],
  },
  {
    pageNumber: 4,
    image: "day29_page04.png",
    speeches: [
      { audioFile: "day29_page04_panel1.mp3", panel: 1 },
      { audioFile: "day29_page04_panel2.mp3", panel: 2 },
    ],
  },
  {
    // Two speakers alternate within panels 1-3 (westerner asks, Dtôm answers,
    // then it flips) — audio-map.md's table order for page 5 is already the
    // correct spoken order, reused directly here.
    pageNumber: 5,
    image: "day29_page05.png",
    speeches: [
      { audioFile: "day29_page05_panel1_westerner.mp3", panel: 1 },
      { audioFile: "day29_page05_panel1_dtom.mp3", panel: 1 },
      { audioFile: "day29_page05_panel2_dtom.mp3", panel: 2 },
      { audioFile: "day29_page05_panel2_westerner.mp3", panel: 2 },
      { audioFile: "day29_page05_panel3_westerner.mp3", panel: 3 },
      { audioFile: "day29_page05_panel3_dtom.mp3", panel: 3 },
    ],
  },
  {
    pageNumber: 6,
    image: "day29_page06.png",
    speeches: [
      { audioFile: "day29_page06_panel1.mp3", panel: 1 },
      { audioFile: "day29_page06_panel2.mp3", panel: 2 },
    ],
  },
  {
    pageNumber: 7,
    image: "day29_page07.png",
    speeches: [
      { audioFile: "day29_page07_panel1.mp3", panel: 1 },
      { audioFile: "day29_page07_panel2.mp3", panel: 2 },
    ],
  },
  {
    pageNumber: 8,
    image: "day29_page08.png",
    // LDTKB-062 (3 September 2026): new first speech, "ขอโทษค่ะ!" — the
    // existing closing line ("อยากพูดไทยเก่งขึ้นค่ะ") shifts from panel 1 to
    // panel 2 (audio content unchanged, file renamed) — see
    // curriculum/day29/day29-audio-map.md's Page 8 notes.
    speeches: [
      { audioFile: "day29_page08_panel1.mp3", panel: 1 },
      { audioFile: "day29_page08_panel2.mp3", panel: 2 },
    ],
  },
];

// 8 story pages + Page 9 (the Surprise Quest interaction itself) — per
// day29-living-comic-spec.md's "9 pages total" navigation-counter note.
export const DAY29_TOTAL_PAGES = DAY29_STORY_PAGES.length + 1;
export const DAY29_QUEST_PAGE_NUMBER = DAY29_TOTAL_PAGES;

export const DAY29_QUEST_QUESTION = "Do you remember... where does Dtôm like to travel? 🏔️";

export interface Day29QuestOption {
  id: string;
  label: string;
}

// Fixed order, not shuffled — unlike Day 30's quiz buttons (LDTKB-046), this
// isn't a randomized-distractor listening test; the spec lists these four
// destinations in this order and gives no shuffling instruction.
export const DAY29_QUEST_OPTIONS: Day29QuestOption[] = [
  { id: "chiang_dao", label: "Chiang Dao" },
  { id: "mae_kam_pong", label: "Mae Kam Pong" },
  { id: "doi_pui", label: "Doi Pui" },
  { id: "doi_inthanon", label: "Doi Inthanon" },
];

export const DAY29_QUEST_CORRECT_ANSWER_ID = "doi_pui";

// Pronoun revised "I" -> "we" (both instances) 3 September 2026 (LDTKB-061),
// same one-time "we" exception (LDTKB-030) as the entry message
// (deliverDay29Entry.ts's MESSAGE_3) and the welcome message.
export const DAY29_QUEST_COMPLETION_MESSAGE =
  "✨ It's been 29 days since you started the course!\n\n" +
  "We really hope you've gotten to try out some of these phrases with real people along the way — even one small conversation makes it worth it.\n\n" +
  "There's just one more day to go... and we are so looking forward to it. 👀🎉";

/** Public URL for a Day 29 asset — served from public/day29/ (scripts/syncDay29Assets.mjs). */
export function day29AssetUrl(filename: string): string {
  return `/day29/${filename}`;
}
