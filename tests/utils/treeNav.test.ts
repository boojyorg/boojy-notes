import { describe, it, expect } from "vitest";
import {
  ATTACHMENTS_KEY,
  visibleTreeRows,
  treeMove,
  folderKey,
  fileKey,
  noteKey,
} from "../../src/utils/treeNav";

// Work/ (open)
//   Plans/ (closed) → p1
//   w1, w2
// Home/ (closed) → h1
// r1, draft
const tree = [
  {
    name: "Work",
    _path: "Work",
    children: [{ name: "Plans", _path: "Work/Plans", children: [], notes: ["p1"] }],
    notes: ["w1", "w2"],
  },
  { name: "Home", _path: "Home", children: [], notes: ["h1"] },
];
const titles: Record<string, string> = {
  p1: "Plan",
  w1: "Alpha",
  w2: "Beta",
  h1: "Hob",
  r1: "Root",
};
const label = (id: string) => titles[id] ?? null;
const rows = visibleTreeRows(tree, ["r1", "draft"], { Work: true }, label);
const keys = rows.map((r) => r.key);

describe("visibleTreeRows", () => {
  it("lists what is showing, folders before notes, closed folders' contents left out", () => {
    expect(keys).toEqual([
      folderKey("Work"),
      folderKey("Work/Plans"),
      noteKey("w1"),
      noteKey("w2"),
      folderKey("Home"),
      noteKey("r1"),
    ]);
  });

  it("gives each row its level and its place among its siblings", () => {
    const at = (k: string) => rows.find((r) => r.key === k)!;
    expect(at(folderKey("Work"))).toMatchObject({
      level: 1,
      posinset: 1,
      setsize: 3,
      expanded: true,
    });
    expect(at(noteKey("r1"))).toMatchObject({ level: 1, posinset: 3, setsize: 3 });
    expect(at(noteKey("w2"))).toMatchObject({
      level: 2,
      posinset: 3,
      setsize: 3,
      parentKey: folderKey("Work"),
    });
    expect(at(folderKey("Home")).expanded).toBe(false);
  });

  it("counts only notes that are rows (a draft is not)", () => {
    expect(rows.find((r) => r.key === noteKey("r1"))!.setsize).toBe(3);
  });
});

describe("treeMove", () => {
  it("steps up and down and stops at the ends", () => {
    expect(treeMove(rows, noteKey("w1"), "ArrowDown")).toEqual({ focus: noteKey("w2") });
    expect(treeMove(rows, noteKey("w1"), "ArrowUp")).toEqual({ focus: folderKey("Work/Plans") });
    expect(treeMove(rows, folderKey("Work"), "ArrowUp")).toBeNull();
    expect(treeMove(rows, noteKey("r1"), "ArrowDown")).toBeNull();
  });

  it("goes to the first and last row", () => {
    expect(treeMove(rows, noteKey("w2"), "Home")).toEqual({ focus: folderKey("Work") });
    expect(treeMove(rows, noteKey("w2"), "End")).toEqual({ focus: noteKey("r1") });
  });

  it("Right opens a closed folder, then enters it", () => {
    expect(treeMove(rows, folderKey("Home"), "ArrowRight")).toEqual({ expand: folderKey("Home") });
    expect(treeMove(rows, folderKey("Work"), "ArrowRight")).toEqual({
      focus: folderKey("Work/Plans"),
    });
    expect(treeMove(rows, noteKey("w1"), "ArrowRight")).toBeNull();
  });

  it("Right on an open empty folder stays put", () => {
    const empty = visibleTreeRows(
      [{ name: "E", children: [], notes: [] }, ...tree],
      [],
      { E: true },
      label,
    );
    expect(treeMove(empty, folderKey("E"), "ArrowRight")).toBeNull();
  });

  it("Left closes an open folder, otherwise goes to the parent", () => {
    expect(treeMove(rows, folderKey("Work"), "ArrowLeft")).toEqual({ collapse: folderKey("Work") });
    expect(treeMove(rows, noteKey("w2"), "ArrowLeft")).toEqual({ focus: folderKey("Work") });
    expect(treeMove(rows, noteKey("r1"), "ArrowLeft")).toBeNull();
  });

  it("a letter jumps to the next row starting with it, wrapping", () => {
    expect(treeMove(rows, folderKey("Work"), "b")).toEqual({ focus: noteKey("w2") });
    expect(treeMove(rows, noteKey("r1"), "W")).toEqual({ focus: folderKey("Work") });
    expect(treeMove(rows, noteKey("r1"), "z")).toBeNull();
    expect(treeMove(rows, noteKey("r1"), " ")).toBeNull();
  });

  it("from a row that has gone, lands on the first", () => {
    expect(treeMove(rows, noteKey("gone"), "ArrowDown")).toEqual({ focus: folderKey("Work") });
  });
});

describe("visibleTreeRows with files that are not notes", () => {
  const withFiles = visibleTreeRows(tree, ["r1"], { Work: true, attachments: true }, label, {
    inFolder: (p) => (p === "Work" ? ["Work/brief.pdf"] : p === "" ? ["list.pdf"] : []),
    attachments: ["attachments/a.png"],
    attachmentLabel: (p) => p.replace("attachments/", ""),
  });

  it("lists a folder's files after its notes, and the attachment store last at the root", () => {
    expect(withFiles.map((r) => r.key)).toEqual([
      folderKey("Work"),
      folderKey("Work/Plans"),
      noteKey("w1"),
      noteKey("w2"),
      fileKey("Work/brief.pdf"),
      folderKey("Home"),
      noteKey("r1"),
      fileKey("list.pdf"),
      ATTACHMENTS_KEY,
      fileKey("attachments/a.png"),
    ]);
  });

  it("counts files and the store among their siblings", () => {
    const store = withFiles.find((r) => r.key === ATTACHMENTS_KEY);
    expect(store).toMatchObject({ kind: "attachments", level: 1, posinset: 5, setsize: 5 });
    expect(withFiles.find((r) => r.key === fileKey("attachments/a.png"))).toMatchObject({
      level: 2,
      parentKey: ATTACHMENTS_KEY,
      label: "a.png",
    });
  });

  it("opens and closes the store with the arrows, as a folder", () => {
    const closed = visibleTreeRows([], [], {}, label, { attachments: ["attachments/a.png"] });
    expect(treeMove(closed, ATTACHMENTS_KEY, "ArrowRight")).toEqual({ expand: ATTACHMENTS_KEY });
    expect(treeMove(withFiles, ATTACHMENTS_KEY, "ArrowLeft")).toEqual({
      collapse: ATTACHMENTS_KEY,
    });
  });
});
