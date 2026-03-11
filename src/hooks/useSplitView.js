import { useState, useCallback, useRef } from "react";

const PANE_IDS = { vertical: ["left", "right"], horizontal: ["top", "bottom"] };

function createPane(tabs = [], activeNote = null) {
  return { tabs, activeNote };
}

function migrateFromFlat(tabs, activeNote) {
  return {
    splitMode: null,
    activePaneId: "left",
    dividerPosition: 50,
    panes: {
      left: createPane(tabs, activeNote),
      right: createPane(),
    },
  };
}

export function useSplitView({ initialTabs, initialActiveNote }) {
  const [splitState, setSplitState] = useState(() => {
    // Try loading persisted split state
    try {
      const ui = JSON.parse(localStorage.getItem("boojy-ui-state"));
      if (ui?.splitState) {
        // Validate structure
        const s = ui.splitState;
        if (s.splitMode === null && s.panes?.left) return s;
        if (s.splitMode && s.panes) {
          const [first, second] = PANE_IDS[s.splitMode];
          if (s.panes[first] && s.panes[second]) return s;
        }
        // Legacy: left/right always present
        if (s.panes?.left && s.panes?.right) {
          return s;
        }
      }
    } catch {}
    return migrateFromFlat(initialTabs, initialActiveNote);
  });

  const splitStateRef = useRef(splitState);
  splitStateRef.current = splitState;

  // --- Accessors (backward-compatible) ---

  // Active pane's tabs and activeNote
  const activePaneId = splitState.activePaneId;
  const firstPaneId = splitState.splitMode
    ? PANE_IDS[splitState.splitMode][0]
    : "left";
  const activePane = splitState.panes[activePaneId] || splitState.panes[firstPaneId];
  const activeNote = activePane.activeNote;
  const tabs = activePane.tabs;

  // Flat accessors for single-pane mode
  const allTabs = (splitState.panes.left || splitState.panes[firstPaneId])?.tabs || [];
  const primaryActiveNote = (splitState.panes.left || splitState.panes[firstPaneId])?.activeNote || null;

  // --- Setters ---

  const setActiveNote = useCallback((noteId) => {
    setSplitState((prev) => {
      const paneId = prev.activePaneId;
      const pane = prev.panes[paneId];
      if (pane.activeNote === noteId) return prev;
      return {
        ...prev,
        panes: {
          ...prev.panes,
          [paneId]: { ...pane, activeNote: noteId },
        },
      };
    });
  }, []);

  const setActiveNoteForPane = useCallback((paneId, noteId) => {
    setSplitState((prev) => {
      const pane = prev.panes[paneId];
      if (!pane || pane.activeNote === noteId) return prev;
      return {
        ...prev,
        panes: {
          ...prev.panes,
          [paneId]: { ...pane, activeNote: noteId },
        },
      };
    });
  }, []);

  const setTabs = useCallback((updater) => {
    setSplitState((prev) => {
      const paneId = prev.activePaneId;
      const pane = prev.panes[paneId];
      const newTabs = typeof updater === "function" ? updater(pane.tabs) : updater;
      return {
        ...prev,
        panes: {
          ...prev.panes,
          [paneId]: { ...pane, tabs: newTabs },
        },
      };
    });
  }, []);

  const setTabsForPane = useCallback((paneId, updater) => {
    setSplitState((prev) => {
      const pane = prev.panes[paneId];
      if (!pane) return prev;
      const newTabs = typeof updater === "function" ? updater(pane.tabs) : updater;
      return {
        ...prev,
        panes: {
          ...prev.panes,
          [paneId]: { ...pane, tabs: newTabs },
        },
      };
    });
  }, []);

  const setActivePaneId = useCallback((paneId) => {
    setSplitState((prev) => {
      if (prev.activePaneId === paneId) return prev;
      return { ...prev, activePaneId: paneId };
    });
  }, []);

  const setDividerPosition = useCallback((pos) => {
    setSplitState((prev) => ({ ...prev, dividerPosition: pos }));
  }, []);

  // --- Split actions ---

  const splitPane = useCallback((direction = "vertical") => {
    setSplitState((prev) => {
      if (prev.splitMode) return prev; // Already split
      const leftPane = prev.panes.left;
      const [firstId, secondId] = PANE_IDS[direction];
      return {
        ...prev,
        splitMode: direction,
        activePaneId: secondId,
        dividerPosition: 50,
        panes: {
          [firstId]: { ...leftPane },
          [secondId]: createPane(
            leftPane.activeNote ? [leftPane.activeNote] : [],
            leftPane.activeNote,
          ),
        },
      };
    });
  }, []);

  const splitPaneWithNote = useCallback((direction = "vertical", noteId) => {
    setSplitState((prev) => {
      if (prev.splitMode) {
        // Already split — open note as tab in other pane
        const otherPaneId = prev.activePaneId === "left" || prev.activePaneId === "top"
          ? (PANE_IDS[prev.splitMode]?.[1] || "right")
          : (PANE_IDS[prev.splitMode]?.[0] || "left");
        const otherPane = prev.panes[otherPaneId];
        const newTabs = otherPane.tabs.includes(noteId)
          ? otherPane.tabs
          : [...otherPane.tabs, noteId];
        return {
          ...prev,
          activePaneId: otherPaneId,
          panes: {
            ...prev.panes,
            [otherPaneId]: { tabs: newTabs, activeNote: noteId },
          },
        };
      }
      const leftPane = prev.panes.left;
      const [firstId, secondId] = PANE_IDS[direction];
      return {
        ...prev,
        splitMode: direction,
        activePaneId: secondId,
        dividerPosition: 50,
        panes: {
          [firstId]: { ...leftPane },
          [secondId]: createPane(noteId ? [noteId] : [], noteId),
        },
      };
    });
  }, []);

  const closeSplit = useCallback(() => {
    setSplitState((prev) => {
      if (!prev.splitMode) return prev;
      const [firstId, secondId] = PANE_IDS[prev.splitMode];
      const firstTabs = prev.panes[firstId]?.tabs || [];
      const secondTabs = prev.panes[secondId]?.tabs || [];
      const mergedTabs = [...firstTabs];
      for (const t of secondTabs) {
        if (!mergedTabs.includes(t)) mergedTabs.push(t);
      }
      const activeNoteId = prev.panes[prev.activePaneId]?.activeNote || prev.panes[firstId]?.activeNote;
      return {
        splitMode: null,
        activePaneId: "left",
        dividerPosition: 50,
        panes: {
          left: createPane(mergedTabs, activeNoteId),
          right: createPane(),
        },
      };
    });
  }, []);

  const closePaneIfEmpty = useCallback((paneId) => {
    setSplitState((prev) => {
      if (!prev.splitMode) return prev;
      const pane = prev.panes[paneId];
      if (pane && pane.tabs.length === 0) {
        // Collapse split
        const otherId = paneId === "left" || paneId === "top"
          ? (PANE_IDS[prev.splitMode]?.[1] || "right")
          : (PANE_IDS[prev.splitMode]?.[0] || "left");
        const otherPane = prev.panes[otherId] || createPane();
        return {
          ...prev,
          splitMode: null,
          activePaneId: "left",
          panes: {
            left: { ...otherPane },
            right: createPane(),
          },
        };
      }
      return prev;
    });
  }, []);

  const moveTabToPane = useCallback((noteId, fromPaneId, toPaneId) => {
    setSplitState((prev) => {
      const fromPane = prev.panes[fromPaneId];
      const toPane = prev.panes[toPaneId];
      if (!fromPane || !toPane) return prev;

      const newFromTabs = fromPane.tabs.filter((t) => t !== noteId);
      const newToTabs = toPane.tabs.includes(noteId) ? toPane.tabs : [...toPane.tabs, noteId];

      // Pick new active for source pane
      let newFromActive = fromPane.activeNote;
      if (fromPane.activeNote === noteId) {
        newFromActive = newFromTabs[newFromTabs.length - 1] || null;
      }

      return {
        ...prev,
        activePaneId: toPaneId,
        panes: {
          ...prev.panes,
          [fromPaneId]: { tabs: newFromTabs, activeNote: newFromActive },
          [toPaneId]: { tabs: newToTabs, activeNote: noteId },
        },
      };
    });
  }, []);

  // Insert tab at specific index in a pane (reorders if already present)
  const insertTabInPane = useCallback((paneId, noteId, index) => {
    setSplitState((prev) => {
      const pane = prev.panes[paneId];
      if (!pane) return prev;
      const newTabs = pane.tabs.filter((t) => t !== noteId);
      const idx = Math.max(0, Math.min(index, newTabs.length));
      newTabs.splice(idx, 0, noteId);
      return {
        ...prev,
        activePaneId: paneId,
        panes: {
          ...prev.panes,
          [paneId]: { tabs: newTabs, activeNote: noteId },
        },
      };
    });
  }, []);

  // Atomic move: remove from source, insert at index in target (single setState)
  const moveTabToPaneAtIndex = useCallback((noteId, fromPaneId, toPaneId, insertIndex) => {
    setSplitState((prev) => {
      const fromPane = prev.panes[fromPaneId];
      const toPane = prev.panes[toPaneId];
      if (!fromPane || !toPane) return prev;

      if (fromPaneId === toPaneId) {
        // Same pane — pure reorder
        const newTabs = fromPane.tabs.filter((t) => t !== noteId);
        const idx = Math.max(0, Math.min(insertIndex, newTabs.length));
        newTabs.splice(idx, 0, noteId);
        return {
          ...prev,
          panes: {
            ...prev.panes,
            [fromPaneId]: { tabs: newTabs, activeNote: noteId },
          },
        };
      }

      // Cross-pane move
      const newFromTabs = fromPane.tabs.filter((t) => t !== noteId);
      let newFromActive = fromPane.activeNote;
      if (fromPane.activeNote === noteId) {
        newFromActive = newFromTabs[newFromTabs.length - 1] || null;
      }

      const newToTabs = toPane.tabs.filter((t) => t !== noteId);
      const idx = Math.max(0, Math.min(insertIndex, newToTabs.length));
      newToTabs.splice(idx, 0, noteId);

      return {
        ...prev,
        activePaneId: toPaneId,
        panes: {
          ...prev.panes,
          [fromPaneId]: { tabs: newFromTabs, activeNote: newFromActive },
          [toPaneId]: { tabs: newToTabs, activeNote: noteId },
        },
      };
    });
  }, []);

  // Duplicate tab to another pane at index (Option+drag)
  const duplicateTabToPane = useCallback((noteId, toPaneId, insertIndex) => {
    setSplitState((prev) => {
      const toPane = prev.panes[toPaneId];
      if (!toPane) return prev;
      if (toPane.tabs.includes(noteId)) return prev; // already present
      const newTabs = [...toPane.tabs];
      const idx = Math.max(0, Math.min(insertIndex, newTabs.length));
      newTabs.splice(idx, 0, noteId);
      return {
        ...prev,
        activePaneId: toPaneId,
        panes: {
          ...prev.panes,
          [toPaneId]: { tabs: newTabs, activeNote: noteId },
        },
      };
    });
  }, []);

  // Open note in specific pane (or active pane)
  const openNoteInPane = useCallback((noteId, targetPaneId) => {
    setSplitState((prev) => {
      const paneId = targetPaneId || prev.activePaneId;
      const pane = prev.panes[paneId];
      if (!pane) return prev;
      const newTabs = pane.tabs.includes(noteId) ? pane.tabs : [...pane.tabs, noteId];
      return {
        ...prev,
        activePaneId: paneId,
        panes: {
          ...prev.panes,
          [paneId]: { tabs: newTabs, activeNote: noteId },
        },
      };
    });
  }, []);

  // Remove a note from all panes (for when a note is deleted)
  const removeNoteFromAllPanes = useCallback((noteId) => {
    setSplitState((prev) => {
      const newPanes = {};
      for (const [paneId, pane] of Object.entries(prev.panes)) {
        const newTabs = pane.tabs.filter((t) => t !== noteId);
        let newActive = pane.activeNote;
        if (pane.activeNote === noteId) {
          newActive = newTabs[newTabs.length - 1] || null;
        }
        newPanes[paneId] = { tabs: newTabs, activeNote: newActive };
      }
      return { ...prev, panes: newPanes };
    });
  }, []);

  // Get the "other" pane id
  const getOtherPaneId = useCallback(() => {
    const s = splitStateRef.current;
    if (!s.splitMode) return null;
    const ids = PANE_IDS[s.splitMode];
    return s.activePaneId === ids[0] ? ids[1] : ids[0];
  }, []);

  // Serialize for persistence
  const getSplitStateForPersistence = useCallback(() => {
    return splitStateRef.current;
  }, []);

  return {
    splitState,
    setSplitState,
    splitStateRef,

    // Backward-compatible accessors
    activeNote,
    tabs,
    setActiveNote,
    setTabs,
    activePaneId,

    // Pane-specific
    setActiveNoteForPane,
    setTabsForPane,
    setActivePaneId,
    setDividerPosition,

    // Split actions
    splitPane,
    splitPaneWithNote,
    closeSplit,
    closePaneIfEmpty,
    moveTabToPane,
    insertTabInPane,
    moveTabToPaneAtIndex,
    duplicateTabToPane,
    openNoteInPane,
    removeNoteFromAllPanes,
    getOtherPaneId,
    getSplitStateForPersistence,
  };
}
