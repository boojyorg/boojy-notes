/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  RECENT_KEY,
  RECENT_MAX,
  readRecents,
  recentRows,
  recordRecent,
} from "../../src/utils/recentNotes";
import type { NoteData } from "../../src/types/notes";

beforeEach(() => localStorage.clear());

describe("recentNotes", () => {
  it("records the newest first, once, capped, per vault", () => {
    recordRecent("/v1", "a");
    recordRecent("/v1", "b");
    recordRecent("/v1", "a");
    recordRecent("/v2", "z");
    expect(readRecents("/v1")).toEqual(["a", "b"]);
    expect(readRecents("/v2")).toEqual(["z"]);
    for (let i = 0; i < RECENT_MAX + 5; i++) recordRecent("/v1", `n${i}`);
    expect(readRecents("/v1")).toHaveLength(RECENT_MAX);
  });

  it("survives a broken store", () => {
    localStorage.setItem(RECENT_KEY, "{not json");
    expect(readRecents("/v1")).toEqual([]);
    localStorage.setItem(RECENT_KEY, JSON.stringify(["a"]));
    expect(readRecents("/v1")).toEqual([]);
  });

  it("rows leave out the open note, drafts and notes that are gone, up to the max", () => {
    const noteData = {
      a: { title: "A", content: { blocks: [] } },
      b: { title: "B", content: { blocks: [] }, _draft: true },
      c: { title: "C", content: { blocks: [] } },
      d: { title: "D", content: { blocks: [] } },
    } as unknown as NoteData;
    expect(recentRows(["a", "b", "gone", "c", "d"], noteData, "a", 8)).toEqual(["c", "d"]);
    expect(recentRows(["a", "c", "d"], noteData, null, 2)).toEqual(["a", "c"]);
  });
});
