/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEARCH_HIT_HOLD_MS,
  SEARCH_HIT_STEPS,
  SEARCH_HIT_STEP_MS,
  clearTint,
  matchRanges,
  tintRanges,
} from "../../src/utils/searchHighlight";

const block = (html: string) => {
  const el = document.createElement("p");
  el.innerHTML = html;
  return el;
};
const texts = (ranges: Range[]) => ranges.map((r) => r.toString());

describe("matchRanges", () => {
  it("finds every occurrence, folded for case and accents, across inline elements", () => {
    const el = block("The <strong>Café</strong> and the cafe, <em>CAFÉ</em> too");
    expect(texts(matchRanges(el, ["cafe"]))).toEqual(["Café", "cafe", "CAFÉ"]);
  });

  it("finds a phrase that crosses elements and a soft break, the text as drawn", () => {
    const el = block("my <em>exam</em><br>notes and exam  notes");
    expect(texts(matchRanges(el, ["exam notes"]))).toEqual([
      "exam​notes".replace("​", ""),
      "exam  notes",
    ]);
  });

  it("finds nothing for a word that isn't there, and never writes into the block", () => {
    const el = block("plain <em>text</em>");
    const before = el.innerHTML;
    expect(matchRanges(el, ["zzz", ""])).toEqual([]);
    expect(el.innerHTML).toBe(before);
  });
});

describe("tintRanges", () => {
  afterEach(() => {
    clearTint();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("answers false where the browser has no highlights, so the caller can flash instead", () => {
    const el = block("exam");
    expect(tintRanges(matchRanges(el, ["exam"]))).toBe(false);
  });

  const stubHighlights = () => {
    const shown = new Map<string, unknown>();
    vi.stubGlobal("CSS", {
      highlights: {
        set: (n: string, h: unknown) => shown.set(n, h),
        delete: (n: string) => shown.delete(n),
      },
    });
    vi.stubGlobal(
      "Highlight",
      class {
        ranges: Range[];
        constructor(...r: Range[]) {
          this.ranges = r;
        }
      },
    );
    return shown;
  };
  const reducedMotion = (on: boolean) =>
    vi
      .spyOn(window, "matchMedia")
      .mockImplementation(
        (q: string) => ({ matches: on && q.includes("reduce"), media: q }) as MediaQueryList,
      );

  it("holds, then fades by stepping through the names, then is gone", () => {
    vi.useFakeTimers();
    reducedMotion(false);
    const shown = stubHighlights();
    expect(tintRanges(matchRanges(block("an exam"), ["exam"]))).toBe(true);
    expect([...shown.keys()]).toEqual([SEARCH_HIT_STEPS[0]]);
    vi.advanceTimersByTime(SEARCH_HIT_HOLD_MS - 1);
    expect([...shown.keys()]).toEqual([SEARCH_HIT_STEPS[0]]);
    vi.advanceTimersByTime(1);
    expect([...shown.keys()]).toEqual([SEARCH_HIT_STEPS[1]]);
    vi.advanceTimersByTime(SEARCH_HIT_STEP_MS * SEARCH_HIT_STEPS.length);
    expect(shown.size).toBe(0);
  });

  it("with reduced motion, holds and then goes at once", () => {
    vi.useFakeTimers();
    reducedMotion(true);
    const shown = stubHighlights();
    tintRanges(matchRanges(block("an exam"), ["exam"]));
    vi.advanceTimersByTime(SEARCH_HIT_HOLD_MS);
    expect(shown.size).toBe(0);
  });
});
