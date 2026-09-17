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

describe("useSidebarDrag: drop feedback reads the live theme", () => {
  let scroller;
  let folderRow;
  let noteRow;

  beforeEach(() => {
    vi.useFakeTimers();
    theme = DAY;
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
        adoptNoteData: vi.fn(),
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
