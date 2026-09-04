import { describe, it, expect } from "vitest";
import {
  compareNotes,
  recencyOf,
  sortNoteIds,
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

const sort = (ids, mode, editedAt = {}) => sortNoteIds(ids, compareNotes(mode, noteData, editedAt));

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

  it("ignores in-session edits entirely", () => {
    const opened = { m: 3000, b: 2000 };
    expect(sort(["a", "b", "i", "m"], SORT_ALPHA, opened)).toEqual(["a", "b", "i", "m"]);
  });

  it("survives a note that has no entry in noteData", () => {
    expect(sort(["ghost", "a"], SORT_ALPHA)).toEqual(["ghost", "a"]);
  });
});

describe("recency", () => {
  it("puts the most recently edited first", () => {
    const opened = { b: 1000, i: 2000, m: 3000 };
    expect(sort(["a", "b", "i", "m"], SORT_RECENT, opened)).toEqual(["m", "i", "b", "a"]);
  });

  it("reads alphabetical when nothing carries a timestamp", () => {
    expect(sort(["m", "i", "b", "a"], SORT_RECENT, {})).toEqual(["a", "b", "i", "m"]);
  });

  it("keeps notes without a timestamp as an alphabetical tail behind the edited ones", () => {
    const opened = { m: 3000 };
    expect(sort(["w10", "a", "m", "w2"], SORT_RECENT, opened)).toEqual(["m", "a", "w2", "w10"]);
  });

  it("breaks equal timestamps on title, not on membership order", () => {
    const opened = { b: 5000, a: 5000 };
    expect(sort(["b", "a"], SORT_RECENT, opened)).toEqual(["a", "b"]);
  });
});

describe("recency = most recently modified (edited here, or on disk)", () => {
  // File mtime is the durable truth: it orders an existing vault from the first
  // launch, and it is the only signal that sees an edit made in another app.
  it("orders by file mtime when nothing has been edited here", () => {
    const data = {
      old: { title: "Old", lastModified: 1000 },
      mid: { title: "Mid", lastModified: 2000 },
      new: { title: "New", lastModified: 3000 },
    };
    const ids = sortNoteIds(["old", "new", "mid"], compareNotes(SORT_RECENT, data, {}));
    expect(ids).toEqual(["new", "mid", "old"]);
  });

  it("takes the later of the two clocks", () => {
    // Edited here earlier, then written on disk since (a save, or another app).
    const data = { a: { title: "A", lastModified: 9000 }, b: { title: "B", lastModified: 0 } };
    expect(recencyOf("a", data, { a: 1000 })).toBe(9000);
    expect(recencyOf("b", data, { b: 5000 })).toBe(5000);
  });

  it("lets an edit made here outrank an older mtime, until the save refreshes it", () => {
    const data = { a: { title: "A", lastModified: 5000 }, b: { title: "B", lastModified: 6000 } };
    const ids = sortNoteIds(["a", "b"], compareNotes(SORT_RECENT, data, { a: 7000 }));
    expect(ids).toEqual(["a", "b"]);
  });

  it("lets an edit made outside Boojy outrank one made here earlier", () => {
    const data = { a: { title: "A", lastModified: 0 }, b: { title: "B", lastModified: 9000 } };
    const ids = sortNoteIds(["a", "b"], compareNotes(SORT_RECENT, data, { a: 8000 }));
    expect(ids).toEqual(["b", "a"]);
  });

  // Web has no filesystem, so those notes keep the alphabetical tail.
  it("keeps notes with neither timestamp alphabetically at the back", () => {
    const data = {
      z: { title: "Zebra", lastModified: 4000 },
      a: { title: "Aardvark" },
      m: { title: "Meeting" },
    };
    const ids = sortNoteIds(["m", "a", "z"], compareNotes(SORT_RECENT, data, {}));
    expect(ids).toEqual(["z", "a", "m"]);
  });

  it("ignores mtime entirely in alphabetical mode", () => {
    const data = {
      z: { title: "Zebra", lastModified: 9000 },
      a: { title: "Aardvark", lastModified: 1 },
    };
    const ids = sortNoteIds(["z", "a"], compareNotes(SORT_ALPHA, data, {}));
    expect(ids).toEqual(["a", "z"]);
  });

  it("reports 0 for a note the app knows nothing about", () => {
    expect(recencyOf("ghost", {}, {})).toBe(0);
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
