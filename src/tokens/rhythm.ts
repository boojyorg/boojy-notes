// The editor's vertical rhythm: body type and the space each kind of block
// keeps around itself. One blank line between blocks is structure, not a row
// (utils/markdown.js), so every gap on screen comes from here, never from how
// many blank lines a file happens to hold.
//
// A few levers, the rest derived, so one change moves every level together.
// The dev spacing panel (dev/RhythmTweaker.jsx, `?tweak`) lays live values
// over these through `setRhythm`; a judged value comes back here.
import { useSyncExternalStore } from "react";

export interface Rhythm {
  /** Body text size in px, for every text block. */
  bodySize: number;
  /** Line height of a paragraph, list row and quote. */
  lineHeight: number;
  /** Space between two paragraphs: Enter. A soft break is line height alone. */
  paragraphGap: number;
  /** Space above an H2; the other levels are scaled from it. */
  headingAbove: number;
  /** Space below an H2, before the text it heads. */
  headingBelow: number;
  /** Space above and below a code block, table or callout. */
  blockGap: number;
}

/** v3, judged live against Obsidian and Notion on 2026-09-24 (v1 32/8/10 had
 *  too much above a heading, v2 24/6/8 put a heading on its own text). */
export const DEFAULT_RHYTHM: Rhythm = {
  bodySize: 15,
  lineHeight: 1.7,
  paragraphGap: 9,
  headingAbove: 28,
  headingBelow: 8,
  blockGap: 16,
};

/** Heading type at a 15px body: size, weight, line height, tracking. */
const HEADING_TYPE = {
  h1: { fontSize: 28, fontWeight: 700, lineHeight: 1.3, letterSpacing: "-0.4px" },
  h2: { fontSize: 22, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.2px" },
  h3: { fontSize: 20, fontWeight: 600, lineHeight: 1.35 },
  h4: { fontSize: 18, fontWeight: 600, lineHeight: 1.35 },
  h5: { fontSize: 16.5, fontWeight: 600, lineHeight: 1.35 },
  h6: { fontSize: 15, fontWeight: 700, lineHeight: 1.4 },
} as const;

export type HeadingType = keyof typeof HEADING_TYPE;

export const isHeadingType = (type: string): type is HeadingType => type in HEADING_TYPE;

/**
 * A heading's type and margins. Much more space above than below, so a heading
 * reads as the start of what follows it. H1 takes a step more than H2, H3 a
 * quarter less, H4–H6 a little less again; sizes follow the body size.
 */
export function headingStyle(type: HeadingType, r: Rhythm) {
  const base = HEADING_TYPE[type];
  const above =
    type === "h1"
      ? r.headingAbove + 8
      : type === "h2"
        ? r.headingAbove
        : type === "h3"
          ? Math.round(r.headingAbove * 0.75)
          : Math.round(r.headingAbove * 0.625);
  const below =
    type === "h1"
      ? r.headingBelow + 4
      : type === "h2"
        ? r.headingBelow
        : Math.max(2, Math.round(r.headingBelow * 0.75));
  return {
    ...base,
    fontSize: Math.round(((base.fontSize * r.bodySize) / 15) * 2) / 2,
    margin: `${above}px 0 ${below}px`,
  };
}

let current: Rhythm = DEFAULT_RHYTHM;
const listeners = new Set<() => void>();

/** Lay values over the defaults (the dev panel); null restores them. */
export function setRhythm(next: Partial<Rhythm> | null): void {
  current = next ? { ...DEFAULT_RHYTHM, ...next } : DEFAULT_RHYTHM;
  for (const listener of listeners) listener();
}

export const getRhythm = (): Rhythm => current;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The rhythm in force; re-renders when the dev panel changes it. */
export function useRhythm(): Rhythm {
  return useSyncExternalStore(subscribe, getRhythm, getRhythm);
}
