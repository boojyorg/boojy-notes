/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSplitView } from "../../src/hooks/useSplitView.js";

const TABS_ABC = ["n1", "n2", "n3"];

function setup(opts = {}) {
  const { initialTabs = ["n1", "n2"], initialActiveNote = "n1" } = opts;
  return renderHook(() => useSplitView({ initialTabs, initialActiveNote }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("useSplitView", () => {
  // ── 1. Initial flat state ────────────────────────────────────────────

  it("initializes flat state with no localStorage", () => {
    const { result } = setup();

    expect(result.current.splitState.splitMode).toBeNull();
    expect(result.current.splitState.activePaneId).toBe("left");
    expect(result.current.splitState.dividerPosition).toBe(50);
    expect(result.current.tabs).toEqual(["n1", "n2"]);
    expect(result.current.activeNote).toBe("n1");
  });

  // ── 2. Restore persisted split from localStorage ─────────────────────

  it("restores persisted split state from localStorage", () => {
    const persisted = {
      splitMode: "vertical",
      activePaneId: "right",
      dividerPosition: 60,
      panes: {
        left: { tabs: ["n1"], activeNote: "n1" },
        right: { tabs: ["n2"], activeNote: "n2" },
      },
    };
    localStorage.setItem("boojy-ui-state", JSON.stringify({ splitState: persisted }));

    const { result } = setup();

    expect(result.current.splitState.splitMode).toBe("vertical");
    expect(result.current.splitState.activePaneId).toBe("right");
    expect(result.current.splitState.dividerPosition).toBe(60);
    expect(result.current.splitState.panes.left.tabs).toEqual(["n1"]);
    expect(result.current.splitState.panes.right.tabs).toEqual(["n2"]);
  });

  // ── 3. setActiveNote updates active pane ─────────────────────────────

  it("setActiveNote updates activeNote on the active pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n1" });

    act(() => {
      result.current.setActiveNote("n2");
    });

    expect(result.current.activeNote).toBe("n2");
  });

  it("setActiveNote is a no-op when note is already active", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n1" });
    const stateBefore = result.current.splitState;

    act(() => {
      result.current.setActiveNote("n1");
    });

    // Reference equality — state object should not have changed
    expect(result.current.splitState).toBe(stateBefore);
  });

  // ── 4. setTabs updates active pane's tabs ─────────────────────────────

  it("setTabs updates the active pane's tabs with an array", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n1" });

    act(() => {
      result.current.setTabs(["n1", "n2", "n3"]);
    });

    expect(result.current.tabs).toEqual(["n1", "n2", "n3"]);
  });

  it("setTabs accepts a function updater", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n1" });

    act(() => {
      result.current.setTabs((prev) => [...prev, "n3"]);
    });

    expect(result.current.tabs).toContain("n3");
  });

  // ── 5. splitPane("vertical") creates two panes ────────────────────────

  it("splitPane('vertical') enters split mode with two panes", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });

    expect(result.current.splitState.splitMode).toBe("vertical");
    expect(result.current.splitState.panes.left).toBeDefined();
    expect(result.current.splitState.panes.right).toBeDefined();
  });

  it("splitPane places the active note in the right pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });

    expect(result.current.splitState.panes.right.tabs).toContain("n2");
    expect(result.current.splitState.panes.right.activeNote).toBe("n2");
  });

  // ── 6. splitPane no-op with fewer than 2 tabs ─────────────────────────

  it("splitPane is a no-op when there is only 1 tab", () => {
    const { result } = setup({ initialTabs: ["n1"], initialActiveNote: "n1" });

    act(() => {
      result.current.splitPane("vertical");
    });

    expect(result.current.splitState.splitMode).toBeNull();
  });

  it("splitPane is a no-op when there is no active note", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: null });

    act(() => {
      result.current.splitPane("vertical");
    });

    expect(result.current.splitState.splitMode).toBeNull();
  });

  // ── 7. splitPane distributes notes across panes ───────────────────────

  it("splitPane distributes remaining tabs to the left pane", () => {
    const { result } = setup({ initialTabs: TABS_ABC, initialActiveNote: "n3" });

    act(() => {
      result.current.splitPane("vertical");
    });

    const leftTabs = result.current.splitState.panes.left.tabs;
    expect(leftTabs).not.toContain("n3");
    expect(leftTabs).toContain("n1");
    expect(leftTabs).toContain("n2");
  });

  // ── 8. closeSplit merges tabs back ────────────────────────────────────

  it("closeSplit merges both panes into a single left pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    act(() => {
      result.current.closeSplit();
    });

    expect(result.current.splitState.splitMode).toBeNull();
    expect(result.current.splitState.activePaneId).toBe("left");
    expect(result.current.tabs).toContain("n1");
    expect(result.current.tabs).toContain("n2");
  });

  it("closeSplit preserves the active note from the previously active pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // After splitPane, activePaneId is "right" with activeNote "n2"
    act(() => {
      result.current.closeSplit();
    });

    expect(result.current.activeNote).toBe("n2");
  });

  // ── 9. moveTabToPane transfers between panes ──────────────────────────

  it("moveTabToPane moves a note from one pane to another", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // left: ["n1"], right: ["n2"]
    act(() => {
      result.current.moveTabToPane("n1", "left", "right");
    });

    expect(result.current.splitState.panes.right.tabs).toContain("n1");
    expect(result.current.splitState.panes.left.tabs).not.toContain("n1");
  });

  // ── 10. moveTabToPane updates source pane activeNote ──────────────────

  it("moveTabToPane updates source pane activeNote when active tab is moved", () => {
    const { result } = setup({ initialTabs: TABS_ABC, initialActiveNote: "n3" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // left contains ["n1","n2"] with activeNote "n2"; right contains ["n3"]
    act(() => {
      result.current.moveTabToPane("n2", "left", "right");
    });

    const leftPane = result.current.splitState.panes.left;
    // n2 was active in left; after move, active should be updated away from n2
    expect(leftPane.activeNote).not.toBe("n2");
  });

  // ── 11. insertTabInPane places note at index ──────────────────────────

  it("insertTabInPane inserts a note at the specified index within an existing pane", () => {
    // Use 3 tabs so the left pane has 2 notes and we can reorder without collapsing
    const { result } = setup({ initialTabs: TABS_ABC, initialActiveNote: "n3" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // left: ["n1","n2"] activeNote "n2", right: ["n3"] activeNote "n3"
    // Insert n2 at index 0 in left (reorder within the same pane)
    act(() => {
      result.current.insertTabInPane("left", "n2", 0);
    });

    const leftTabs = result.current.splitState.panes.left.tabs;
    expect(leftTabs[0]).toBe("n2");
  });

  it("insertTabInPane enforces tab exclusivity (removes from other panes)", () => {
    // Use 3 tabs: after split left gets ["n1","n2"], right gets ["n3"]
    // Insert n2 into right; left still has n1 so no collapse
    const { result } = setup({ initialTabs: TABS_ABC, initialActiveNote: "n3" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // left: ["n1","n2"], right: ["n3"]; move n2 into right
    act(() => {
      result.current.insertTabInPane("right", "n2", 1);
    });

    expect(result.current.splitState.panes.left.tabs).not.toContain("n2");
    expect(result.current.splitState.panes.right.tabs).toContain("n2");
  });

  // ── 12. splitPaneWithNote opens note in new pane ──────────────────────

  it("splitPaneWithNote creates a split and opens note in the second pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n1" });

    act(() => {
      result.current.splitPaneWithNote("vertical", "n2");
    });

    expect(result.current.splitState.splitMode).toBe("vertical");
    expect(result.current.splitState.panes.right.tabs).toContain("n2");
    expect(result.current.splitState.panes.right.activeNote).toBe("n2");
  });

  it("splitPaneWithNote when already split opens note in other pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // activePaneId is now "right"; splitPaneWithNote should go to "left"
    act(() => {
      result.current.splitPaneWithNote("vertical", "n1");
    });

    // n1 should be in the other pane (left) and active there
    expect(result.current.splitState.panes.left.activeNote).toBe("n1");
  });

  // ── 13. closePaneIfEmpty triggers single mode ─────────────────────────

  it("closePaneIfEmpty collapses split when target pane is empty", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // Manually empty the right pane by moving its tab away
    act(() => {
      result.current.moveTabToPane("n2", "right", "left");
    });
    // right pane is now empty; call closePaneIfEmpty
    act(() => {
      result.current.closePaneIfEmpty("right");
    });

    expect(result.current.splitState.splitMode).toBeNull();
  });

  it("closePaneIfEmpty is a no-op when pane still has tabs", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    const modeBefore = result.current.splitState.splitMode;
    act(() => {
      result.current.closePaneIfEmpty("right");
    });

    // right still has n2, so split mode should remain
    expect(result.current.splitState.splitMode).toBe(modeBefore);
  });

  // ── 14. openNoteInPane enforces exclusivity ────────────────────────────

  it("openNoteInPane adds note to target pane and removes from others", () => {
    // Use 3 tabs so left retains at least one note after the move (no collapse)
    const { result } = setup({ initialTabs: TABS_ABC, initialActiveNote: "n3" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // After split: left: ["n1","n2"] activeNote "n2", right: ["n3"] activeNote "n3"
    // Open n2 in right — left still has n1, so no collapse
    act(() => {
      result.current.openNoteInPane("n2", "right");
    });

    expect(result.current.splitState.panes.right.tabs).toContain("n2");
    expect(result.current.splitState.panes.right.activeNote).toBe("n2");
    expect(result.current.splitState.panes.left.tabs).not.toContain("n2");
  });

  // ── 15. removeNoteFromAllPanes cleans up ──────────────────────────────

  it("removeNoteFromAllPanes removes note from every pane", () => {
    const { result } = setup({ initialTabs: ["n1", "n2"], initialActiveNote: "n2" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // left: ["n1"], right: ["n2"]
    act(() => {
      result.current.removeNoteFromAllPanes("n1");
    });

    expect(result.current.splitState.panes.left.tabs).not.toContain("n1");
    expect(result.current.splitState.panes.right.tabs).not.toContain("n1");
  });

  it("removeNoteFromAllPanes updates activeNote when removed note was active", () => {
    const { result } = setup({ initialTabs: TABS_ABC, initialActiveNote: "n3" });

    act(() => {
      result.current.splitPane("vertical");
    });
    // right has ["n3"] as activeNote; remove n3
    act(() => {
      result.current.removeNoteFromAllPanes("n3");
    });

    // After removal, activeNote in right pane should not be "n3"
    expect(result.current.splitState.panes.right.activeNote).not.toBe("n3");
  });
});
