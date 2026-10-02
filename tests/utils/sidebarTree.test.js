import { describe, it, expect } from "vitest";
import { buildTree, collectPaths } from "../../src/utils/sidebarTree.js";

// --- buildTree ---

describe("buildTree", () => {
  it("builds flat tree", () => {
    const nodes = [{ name: "Work" }, { name: "Personal" }];
    const folderNoteMap = { Work: ["n1", "n2"], Personal: ["n3"] };
    const tree = buildTree(nodes, folderNoteMap);
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe("Work");
    expect(tree[0].notes).toEqual(["n1", "n2"]);
    expect(tree[1].notes).toEqual(["n3"]);
  });

  it("builds nested tree", () => {
    const nodes = [{ name: "Work", children: [{ name: "Projects" }] }];
    const folderNoteMap = { Work: ["n1"], "Work/Projects": ["n2"] };
    const tree = buildTree(nodes, folderNoteMap);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].name).toBe("Projects");
    expect(tree[0].children[0].notes).toEqual(["n2"]);
  });

  it("returns empty notes for missing folder", () => {
    const tree = buildTree([{ name: "Empty" }], {});
    expect(tree[0].notes).toEqual([]);
  });

  it("leaves note order to the caller — there is no manual ordering", () => {
    const nodes = [{ name: "Work" }];
    const tree = buildTree(nodes, { Work: ["n2", "n1", "n3"] });
    expect(tree[0].notes).toEqual(["n2", "n1", "n3"]);
  });

  it("applies the caller's sort to every folder's notes, at any depth", () => {
    const nodes = [{ name: "Work", children: [{ name: "Projects" }] }];
    const map = { Work: ["n2", "n1"], "Work/Projects": ["n4", "n3"] };
    const tree = buildTree(nodes, map, (ids) => [...ids].sort());
    expect(tree[0].notes).toEqual(["n1", "n2"]);
    expect(tree[0].children[0].notes).toEqual(["n3", "n4"]);
  });

  it("sorts child folders natural-alphabetically, always", () => {
    const nodes = [
      { name: "Work", children: [{ name: "Week 10" }, { name: "Week 2" }, { name: "alpha" }] },
    ];
    const tree = buildTree(nodes, {});
    expect(tree[0].children.map((c) => c.name)).toEqual(["alpha", "Week 2", "Week 10"]);
  });
});

// --- collectPaths ---

describe("collectPaths", () => {
  it("collects flat paths", () => {
    const nodes = [
      { name: "Work", children: [] },
      { name: "Personal", children: [] },
    ];
    expect(collectPaths(nodes)).toEqual(["Work", "Personal"]);
  });

  it("collects nested paths", () => {
    const nodes = [{ name: "Work", children: [{ name: "Projects", children: [] }] }];
    expect(collectPaths(nodes)).toEqual(["Work", "Work/Projects"]);
  });

  it("returns empty for empty input", () => {
    expect(collectPaths([])).toEqual([]);
  });
});
