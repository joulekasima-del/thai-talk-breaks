// Pure audio-timing logic for the living comic — no DOM, no browser APIs, so
// it's unit-testable outside a real browser (see tests/day29.test.ts). The
// actual <audio> playback/scheduling lives in src/app/day29/page.tsx, which
// consumes buildPlaybackPlan()'s output.
//
// Timing rule, per day29-living-comic-spec.md ("Audio timing"):
//   - 2 seconds between individual speeches within the same panel
//   - 3 seconds between panels (and, by the same stated rule, between pages —
//     but a page's sequence never runs into the next page's audio; see the
//     "never plays audio from a different page than what's currently
//     visible" rule, so the 3s pages case never actually applies within a
//     single page's plan).
//
// Note: curriculum/day29/day29-story-draft.md's older "Audio duration
// calculation" section uses a different, superseded 1-second page-transition
// figure from before the living-comic pivot — the spec above is the
// literal, locked source of truth for timing and is what this file uses.

import type { Day29Speech } from "@/lib/day29/comicContent";

export const SPEECH_GAP_MS = 2000;
export const PANEL_GAP_MS = 3000;

export interface Day29PlaybackStep {
  audioFile: string;
  /** Delay, in ms, after this speech's audio finishes before the next one starts. 0 for the last step. */
  gapAfterMs: number;
}

export function buildPlaybackPlan(speeches: Day29Speech[]): Day29PlaybackStep[] {
  return speeches.map((speech, index) => {
    const next = speeches[index + 1];
    const gapAfterMs = !next ? 0 : next.panel === speech.panel ? SPEECH_GAP_MS : PANEL_GAP_MS;
    return { audioFile: speech.audioFile, gapAfterMs };
  });
}
