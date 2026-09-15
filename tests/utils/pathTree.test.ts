import { describe, expect, it } from "vitest";
import type { SidebarNode } from "../../src/types/notes";
import {
  crumbScope,
  findFolder,
  parentRowIndex,
  scopeContents,
  visibleRows,
} from "../../src/utils/pathTree";

/**
 * The example vault of the design: University holds Archive (with 2024 and
 * three notes), Semester 1 and a note; Personal is empty; Ideas sits at root.
 */
const folder = (path: string, children: SidebarNode[] = [], notes: string[] = []): SidebarNode => ({
  name: path.split("/").pop() as string,
  _path: path,
  children,
  notes,
});
const tree: SidebarNode[] = [
  folder("Personal"),
  folder(
    "University",
    [
      folder(
        "University/Archive",
        [folder("University/Archive/2024", [], ["exam", "lab"])],
        ["old-plan", "reading", "todd"],
      ),
      folder("University/Semester 1", [], ["week1"]),
    ],
    ["timetable"],
  ),
];
const rootNotes = ["ideas"];

describe("crumbScope", () => {
  const parents = ["University", "Archive"];

  it("a folder crumb opens its parent's contents with the path below it expanded", () => {
    expect(crumbScope(parents, 1)).toEqual({
      scope: "University",
      expanded: ["University/Archive"],
    });
  });

  it("a top-level crumb opens the root, itself and the path below it expanded", () => {
    expect(crumbScope(parents, 0)).toEqual({
      scope: "",
      expanded: ["University", "University/Archive"],
    });
  });

  it("the ellipsis opens the root with the whole path expanded", () => {
    expect(crumbScope(parents, -1)).toEqual({
      scope: "",
      expanded: ["University", "University/Archive"],
    });
  });

  it("a deeper crumb expands only from itself down", () => {
    expect(crumbScope(["A", "B", "C"], 2)).toEqual({ scope: "A/B", expanded: ["A/B/C"] });
  });
});

describe("scopeContents", () => {
  it("the root is the tree and the root notes", () => {
    expect(scopeContents(tree, rootNotes, "")).toEqual({ folders: tree, notes: rootNotes });
  });

  it("a folder is its subfolders and notes, in the tree's own order", () => {
    const c = scopeContents(tree, rootNotes, "University");
    expect(c.folders.map((f) => f.name)).toEqual(["Archive", "Semester 1"]);
    expect(c.notes).toEqual(["timetable"]);
  });

  it("a folder the tree no longer holds is empty rather than a throw", () => {
    expect(scopeContents(tree, rootNotes, "Gone/Folder")).toEqual({ folders: [], notes: [] });
    expect(findFolder(tree, "University/Nope")).toBeNull();
  });
});

describe("visibleRows", () => {
  it("walks folders, then an open folder's children and notes indented, then the scope's notes", () => {
    const rows = visibleRows(
      scopeContents(tree, rootNotes, "University"),
      new Set(["University/Archive"]),
    );
    expect(rows.map((r) => `${r.depth}:${r.kind === "folder" ? r.name : r.id}`)).toEqual([
      "0:Archive",
      "1:2024",
      "1:old-plan",
      "1:reading",
      "1:todd",
      "0:Semester 1",
      "0:timetable",
    ]);
    const archive = rows[0];
    expect(archive.kind === "folder" && archive.open).toBe(true);
    const semester = rows[5];
    expect(semester.kind === "folder" && semester.open).toBe(false);
    expect(semester.kind === "folder" && semester.hasChildren).toBe(true);
  });

  it("a closed folder hides everything under it", () => {
    const rows = visibleRows(scopeContents(tree, rootNotes, ""), new Set());
    expect(rows.map((r) => r.key)).toEqual(["folder:Personal", "folder:University", "note:ideas"]);
    const personal = rows[0];
    expect(personal.kind === "folder" && personal.hasChildren).toBe(false);
  });

  it("nested expansion nests the depth", () => {
    const rows = visibleRows(
      scopeContents(tree, rootNotes, ""),
      new Set(["University", "University/Archive", "University/Archive/2024"]),
    );
    const exam = rows.find((r) => r.key === "note:exam");
    expect(exam?.depth).toBe(3);
  });
});

describe("parentRowIndex", () => {
  it("finds the folder row that holds a row, and -1 at the top level", () => {
    const rows = visibleRows(
      scopeContents(tree, rootNotes, ""),
      new Set(["University", "University/Archive"]),
    );
    const at = (key: string) => rows.findIndex((r) => r.key === key);
    expect(parentRowIndex(rows, at("note:todd"))).toBe(at("folder:University/Archive"));
    expect(parentRowIndex(rows, at("folder:University/Archive"))).toBe(at("folder:University"));
    expect(parentRowIndex(rows, at("folder:University/Semester 1"))).toBe(at("folder:University"));
    expect(parentRowIndex(rows, at("folder:University"))).toBe(-1);
    expect(parentRowIndex(rows, at("note:ideas"))).toBe(-1);
  });
});
