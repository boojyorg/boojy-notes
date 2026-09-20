/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { DAY, NIGHT } from "../../src/constants/themes";

// The theme the hook sees, switchable between renders.
let theme = DAY;
vi.mock("../../src/hooks/useTheme", () => ({ useTheme: () => ({ theme }) }));
vi.mock("../../src/utils/domHelpers", async (importOriginal) => ({
  ...(await importOriginal()),
  runAutoScroll: () => {},
}));

import { useSidebarDrag } from "../../src/hooks/useSidebarDrag";

const rgb = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const rectAt = (top, height = 28) => ({
  top,
  bottom: top + height,
  height,
  left: 0,
  right: 240,
  width: 240,
});

let moveNotes;

describe("useSidebarDrag: drop feedback reads the live theme", () => {
  let scroller;
  let folderRow;
  let noteRow;

  beforeEach(() => {
    vi.useFakeTimers();
    theme = DAY;
    moveNotes = vi.fn();
    scroller = document.createElement("div");
    scroller.setAttribute("role", "tree");
    scroller.getBoundingClientRect = () => rectAt(0, 400);
    folderRow = document.createElement("div");
    folderRow.dataset.folderPath = "Work";
    folderRow.getBoundingClientRect = () => rectAt(10);
    noteRow = document.createElement("div");
    noteRow.dataset.noteId = "n1";
    noteRow.getBoundingClientRect = () => rectAt(50);
    scroller.append(folderRow, noteRow);
    document.body.appendChild(scroller);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mount() {
    return renderHook(() =>
      useSidebarDrag({
        noteDataRef: { current: { n1: { id: "n1", title: "Plan", folder: "" } } },
        moveNotes,
        sidebarScrollRef: { current: scroller },
        selectedNotesRef: { current: new Set() },
        clearSelectionRef: { current: null },
        moveFolder: vi.fn(),
      }),
    );
  }

  it("paints the folder target in the theme on screen, not the one the handler was made under", () => {
    const { result, rerender } = mount();
    // The handler a row holds can come from an earlier render (a memoised row,
    // a listener registered once); the paint must not inherit that render's theme.
    const pointerDown = result.current.handleSidebarPointerDown;

    theme = NIGHT;
    rerender();

    act(() => {
      pointerDown({ button: 0, target: noteRow, clientX: 20, clientY: 60, pointerType: "mouse" });
    });
    act(() => {
      vi.advanceTimersByTime(400); // the hold that lifts the row
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 20 }));
    });

    expect(result.current.sidebarDrag.current.active).toBe(true);
    expect(folderRow.style.background).toBe(rgb(NIGHT.BG.hover));
    expect(folderRow.style.boxShadow.toLowerCase()).toContain(NIGHT.TEXT.muted.toLowerCase());
    expect(folderRow.style.background).not.toBe(rgb(DAY.BG.hover));

    act(() => result.current.cancelSidebarDrag());
  });

  it("puts back what the row held once the pointer leaves it, never an empty background", () => {
    // A folder row is a <button> whose rest background is set inline; clearing
    // it to "" dropped it onto the UA's buttonface (#EFEFEF), so after the first
    // drag every folder lit up white in Dark.
    folderRow.style.background = "none";
    theme = NIGHT;
    const { result } = mount();

    act(() => {
      result.current.handleSidebarPointerDown({
        button: 0,
        target: noteRow,
        clientX: 20,
        clientY: 60,
        pointerType: "mouse",
      });
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 20 }));
    });
    expect(folderRow.style.background).toBe(rgb(NIGHT.BG.hover));

    // Off the folder onto the empty space below the rows: the row is put back.
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 300 }));
    });
    expect(folderRow.style.background).toBe("none");
    expect(folderRow.style.boxShadow).toBe("");

    // And after the drag ends, the same.
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: 20 }));
    });
    act(() => result.current.cancelSidebarDrag());
    act(() => {
      vi.runAllTimers();
    });
    expect(folderRow.style.background).toBe("none");
  });
});

describe("useSidebarDrag: a row inside a `data-drag-scroller` drags within it (the path's popup)", () => {
  let sidebar;
  let popup;
  let popupFolder;
  let popupNote;
  let moveFolder;

  const press = (result, target) => {
    act(() => {
      result.current.handleSidebarPointerDown({
        button: 0,
        target,
        clientX: 20,
        clientY: 60,
        pointerType: "mouse",
      });
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
  };
  const moveTo = (y) => {
    act(() => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 20, clientY: y }));
    });
  };
  const release = () => {
    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup"));
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    theme = DAY;
    moveNotes = vi.fn();
    moveFolder = vi.fn();
    sidebar = document.createElement("div");
    sidebar.getBoundingClientRect = () => rectAt(0, 400);
    const sidebarFolder = document.createElement("div");
    sidebarFolder.dataset.folderPath = "Elsewhere";
    sidebarFolder.getBoundingClientRect = () => rectAt(10);
    const root = document.createElement("div");
    root.dataset.dropRoot = "true";
    root.getBoundingClientRect = () => rectAt(0, 10);
    sidebar.append(root, sidebarFolder);
    popup = document.createElement("div");
    popup.dataset.dragScroller = "folders";
    popup.setAttribute("role", "tree");
    popup.getBoundingClientRect = () => rectAt(500, 200);
    popupFolder = document.createElement("div");
    popupFolder.dataset.folderPath = "Work";
    popupFolder.getBoundingClientRect = () => rectAt(510);
    popupNote = document.createElement("div");
    popupNote.dataset.noteId = "n1";
    popupNote.getBoundingClientRect = () => rectAt(550);
    popup.append(popupFolder, popupNote);
    document.body.append(sidebar, popup);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mount() {
    return renderHook(() =>
      useSidebarDrag({
        noteDataRef: { current: { n1: { id: "n1", title: "Plan", folder: null } } },
        moveNotes,
        sidebarScrollRef: { current: sidebar },
        selectedNotesRef: { current: new Set() },
        clearSelectionRef: { current: null },
        moveFolder,
      }),
    );
  }

  it("targets the popup's folder rows, and asks the move to reveal where it landed", () => {
    const { result } = mount();
    press(result, popupNote);
    expect(result.current.sidebarDrag.current.active).toBe(true);
    moveTo(520);
    expect(popupFolder.style.background).toBe(rgb(DAY.BG.hover));
    release();
    expect(moveNotes).toHaveBeenCalledWith(["n1"], "Work", { reveal: true });
    expect(result.current.sidebarDrag.current.active).toBe(false);
  });

  it("has no root there: a release between rows, or on a note row, moves nothing", () => {
    const { result } = mount();
    press(result, popupNote);
    // The sidebar's own root row is under y=5, but the drag lives in the popup.
    moveTo(5);
    expect(result.current.sidebarDrag.current.dropTarget).toBeNull();
    moveTo(560); // the note row
    expect(result.current.sidebarDrag.current.dropTarget).toBeNull();
    moveTo(690); // the empty space at the popup's foot
    expect(result.current.sidebarDrag.current.dropTarget).toBeNull();
    release();
    expect(moveNotes).not.toHaveBeenCalled();
    act(() => {
      vi.runAllTimers();
    });
    expect(document.body.classList.contains("block-dragging")).toBe(false);
  });

  it("a folder dragged there goes into the folder row it is dropped on, never itself", () => {
    const { result } = mount();
    const own = document.createElement("div");
    own.dataset.folderPath = "Work/Archive";
    own.getBoundingClientRect = () => rectAt(600);
    popup.append(own);
    press(result, own);
    moveTo(610); // its own row: no target
    expect(result.current.sidebarDrag.current.dropTarget).toBeNull();
    moveTo(520);
    release();
    expect(moveFolder).toHaveBeenCalledWith("Work/Archive", "Work", { reveal: true });
  });

  it("Escape cancels a live drag before the surface it started in sees the key", () => {
    const { result } = mount();
    press(result, popupNote);
    moveTo(520);
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(seen).not.toHaveBeenCalled();
    expect(result.current.sidebarDrag.current.active).toBe(false);
    expect(popupFolder.style.background).toBe("");
    release();
    expect(moveNotes).not.toHaveBeenCalled();
    document.removeEventListener("keydown", seen);
  });

  it("a drop in the sidebar itself does not ask for a reveal", () => {
    const sidebarNote = document.createElement("div");
    sidebarNote.dataset.noteId = "n1";
    sidebarNote.getBoundingClientRect = () => rectAt(50);
    sidebar.append(sidebarNote);
    const { result } = mount();
    press(result, sidebarNote);
    moveTo(15);
    release();
    expect(moveNotes).toHaveBeenCalledWith(["n1"], "Elsewhere", { reveal: false });
  });
});
