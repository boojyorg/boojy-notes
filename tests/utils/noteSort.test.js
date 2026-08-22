import { describe, it, expect } from "vitest";
import {
  compareNotes,
  sortNoteIds,
  sortModeLabel,
  isSortMode,
  DEFAULT_SORT_MODE,
  SORT_ALPHA,
  SORT_RECENT,
} from "../../src/utils/noteSort.js";

const noteData = {
  a: { title: "Aardvark" },
  b: { title: "Budget" },
  i: { title: "Ideas" },
  m: { title: "Meeting" },
  w2: { title: "Week 2" },
  w10: { title: "Week 10" },
};

const sort = (ids, mode, lastOpened = {}) =>
  sortNoteIds(ids, compareNotes(mode, noteData, lastOpened));

describe("sort modes", () => {
  it("defaults to recency", () => {
    expect(DEFAULT_SORT_MODE).toBe(SORT_RECENT);
  });

  it("recognises only the two real modes", () => {
    expect(isSortMode(SORT_RECENT)).toBe(true);
    expect(isSortMode(SORT_ALPHA)).toBe(true);
    expect(isSortMode("manual")).toBe(false);
    expect(isSortMode(null)).toBe(false);
  });

  it("labels each mode", () => {
    expect(sortModeLabel(SORT_RECENT)).toBe("Most recent");
    expect(sortModeLabel(SORT_ALPHA)).toBe("Alphabetical");
  });
});

describe("alphabetical", () => {
  it("sorts naturally, so Week 2 precedes Week 10", () => {
    expect(sort(["w10", "w2"], SORT_ALPHA)).toEqual(["w2", "w10"]);
  });

  it("ignores case", () => {
    const data = { x: { title: "apple" }, y: { title: "Banana" }, z: { title: "Cherry" } };
    const ids = sortNoteIds(["z", "y", "x"], compareNotes(SORT_ALPHA, data, {}));
    expect(ids).toEqual(["x", "y", "z"]);
  });

  it("ignores last-opened entirely", () => {
    const opened = { m: 3000, b: 2000 };
    expect(sort(["a", "b", "i", "m"], SORT_ALPHA, opened)).toEqual(["a", "b", "i", "m"]);
  });

  it("survives a note that has no entry in noteData", () => {
    expect(sort(["ghost", "a"], SORT_ALPHA)).toEqual(["ghost", "a"]);
  });
});

describe("recency", () => {
  it("puts the most recently opened first", () => {
    const opened = { b: 1000, i: 2000, m: 3000 };
    expect(sort(["a", "b", "i", "m"], SORT_RECENT, opened)).toEqual(["m", "i", "b", "a"]);
  });

  it("reads alphabetical when nothing has been opened — the day-one list", () => {
    expect(sort(["m", "i", "b", "a"], SORT_RECENT, {})).toEqual(["a", "b", "i", "m"]);
  });

  it("keeps never-opened notes as an alphabetical tail behind the opened ones", () => {
    const opened = { m: 3000 };
    expect(sort(["w10", "a", "m", "w2"], SORT_RECENT, opened)).toEqual(["m", "a", "w2", "w10"]);
  });

  it("breaks equal timestamps on title, not on membership order", () => {
    const opened = { b: 5000, a: 5000 };
    expect(sort(["b", "a"], SORT_RECENT, opened)).toEqual(["a", "b"]);
  });
});

describe("sortNoteIds", () => {
  it("returns the same array reference when the order is already correct", () => {
    const ids = ["a", "b", "i"];
    expect(sort(ids, SORT_ALPHA)).toBe(ids);
  });

  it("returns a new array when the order changes, leaving the input alone", () => {
    const ids = ["i", "a"];
    const out = sort(ids, SORT_ALPHA);
    expect(out).not.toBe(ids);
    expect(out).toEqual(["a", "i"]);
    expect(ids).toEqual(["i", "a"]);
  });

  it("short-circuits lists too short to reorder", () => {
    const one = ["a"];
    expect(sort(one, SORT_ALPHA)).toBe(one);
  });
});
