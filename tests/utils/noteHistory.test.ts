/**
 * Back and Forward through the notes opened: opening drops what was ahead,
 * a step only moves the place, a note gone is stepped over.
 */
import { describe, expect, it } from "vitest";
import {
  emptyHistory,
  HISTORY_LIMIT,
  historyOpen,
  historyTarget,
} from "../../src/utils/noteHistory";

const opened = (...ids: string[]) => ids.reduce(historyOpen, emptyHistory());
const all = () => true;

describe("noteHistory", () => {
  it("records each note opened, once for the same note twice", () => {
    expect(opened("a", "b", "b", "c")).toEqual({ ids: ["a", "b", "c"], at: 2 });
  });

  it("steps back and forward, with nowhere to go at either end", () => {
    const h = opened("a", "b", "c");
    expect(historyTarget(h, -1, all)).toBe(1);
    expect(historyTarget(h, 1, all)).toBe(-1);
    expect(historyTarget({ ...h, at: 0 }, -1, all)).toBe(-1);
    expect(historyTarget({ ...h, at: 0 }, 1, all)).toBe(1);
  });

  it("drops what was ahead when a note is opened after going back", () => {
    const h = historyOpen({ ...opened("a", "b", "c"), at: 1 }, "d");
    expect(h).toEqual({ ids: ["a", "b", "d"], at: 2 });
    expect(historyTarget(h, 1, all)).toBe(-1);
  });

  it("steps over a note that is gone, and over the open one met again", () => {
    const h = opened("a", "b", "a", "c");
    expect(historyTarget(h, -1, (id) => id !== "a")).toBe(1);
    expect(historyTarget(opened("a", "b", "c"), -1, (id) => id !== "b")).toBe(0);
    expect(historyTarget(opened("a", "c", "b", "c"), -1, (id) => id !== "b")).toBe(0);
  });

  it("keeps the last fifty", () => {
    const ids = Array.from({ length: HISTORY_LIMIT + 5 }, (_, i) => `n${i}`);
    const h = opened(...ids);
    expect(h.ids).toHaveLength(HISTORY_LIMIT);
    expect(h.ids[0]).toBe("n5");
    expect(h.at).toBe(HISTORY_LIMIT - 1);
  });
});
