/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppKeyboard } from "../../src/hooks/useAppKeyboard";

function makeDeps(overrides = {}) {
  return {
    activeNote: "n1",
    noteData: { n1: { title: "A", content: { blocks: [] } } },
    uiScale: 100,
    settingsOpen: false,
    overlayOpen: false,
    blockDrag: { current: { active: false } },
    sidebarDrag: { current: { active: false } },
    titleRef: { current: null },
    searchInputRef: { current: null },
    undo: vi.fn(),
    redo: vi.fn(),
    createNote: vi.fn(),
    setSettingsOpen: vi.fn(),
    revealSidebar: vi.fn(),
    closeOverlay: vi.fn(),
    setUiScale: vi.fn(),
    cancelBlockDrag: vi.fn(),
    cancelSidebarDrag: vi.fn(),
    ...overrides,
  };
}

const key = (k, init = {}) =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: k, ...init }));

describe("useAppKeyboard", () => {
  it("calls the callbacks from the latest render, not the ones captured at mount", () => {
    const first = makeDeps();
    const { rerender } = renderHook((props) => useAppKeyboard(props), { initialProps: first });

    // A re-render hands the hook new callbacks — as happens when the sidebar
    // flips to overlay mode (revealSidebar) or the active note changes
    // (cancelBlockDrag). Nothing else changed, so the old code kept the mount
    // closure and called the first-render functions.
    // The drag refs themselves are stable across renders; only their contents move.
    const second = makeDeps({ blockDrag: first.blockDrag, sidebarDrag: first.sidebarDrag });
    rerender(second);
    first.blockDrag.current.active = true;

    key("p", { metaKey: true });
    expect(second.revealSidebar).toHaveBeenCalledTimes(1);
    expect(first.revealSidebar).not.toHaveBeenCalled();

    key("Escape");
    expect(second.cancelBlockDrag).toHaveBeenCalledTimes(1);
    expect(first.cancelBlockDrag).not.toHaveBeenCalled();
  });

  it("Escape prefers an active drag, then Settings, then an open overlay", () => {
    const deps = makeDeps({ settingsOpen: true, overlayOpen: true });
    const { rerender } = renderHook((props) => useAppKeyboard(props), { initialProps: deps });

    key("Escape");
    expect(deps.setSettingsOpen).toHaveBeenCalledWith(false);
    expect(deps.closeOverlay).not.toHaveBeenCalled();

    const next = makeDeps({ settingsOpen: false, overlayOpen: true });
    rerender(next);
    key("Escape");
    expect(next.closeOverlay).toHaveBeenCalledTimes(1);
  });

  it("Cmd+N focuses the title instead of creating a note while a draft is open", () => {
    const titleEl = document.createElement("div");
    titleEl.tabIndex = 0;
    document.body.appendChild(titleEl);
    const deps = makeDeps({
      noteData: { n1: { title: "", _draft: true, content: { blocks: [] } } },
      titleRef: { current: titleEl },
    });
    renderHook(() => useAppKeyboard(deps));

    key("n", { metaKey: true });
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(titleEl);
    document.body.removeChild(titleEl);
  });

  it("zoom shortcuts step through SCALE_OPTIONS from the current scale", () => {
    const deps = makeDeps({ uiScale: 100 });
    const { rerender } = renderHook((props) => useAppKeyboard(props), { initialProps: deps });
    key("=", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(110);

    const next = makeDeps({ uiScale: 110 });
    rerender(next);
    key("-", { metaKey: true });
    expect(next.setUiScale).toHaveBeenCalledWith(100);
    key("0", { metaKey: true });
    expect(next.setUiScale).toHaveBeenCalledWith(100);
  });
});
