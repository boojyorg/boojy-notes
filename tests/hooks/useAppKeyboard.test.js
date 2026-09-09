/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useAppKeyboard, focusOwner } from "../../src/hooks/useAppKeyboard";

function makeDeps(overrides = {}) {
  return {
    activeNote: "n1",
    noteData: { n1: { title: "A", content: { blocks: [] } } },
    uiScale: 100,
    overlayOpen: false,
    blockDrag: { current: { active: false } },
    sidebarDrag: { current: { active: false } },
    titleRef: { current: null },
    undo: vi.fn(),
    redo: vi.fn(),
    createNote: vi.fn(),
    revealSidebar: vi.fn(),
    openSearch: vi.fn(),
    closeOverlay: vi.fn(),
    setUiScale: vi.fn(),
    cancelBlockDrag: vi.fn(),
    cancelSidebarDrag: vi.fn(),
    ...overrides,
  };
}

const key = (k, init = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, cancelable: true, ...init });
  window.dispatchEvent(e);
  return e;
};

/** Mount `html` in the body and focus the element matching `focus`. */
function mount(html, focus) {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.appendChild(host);
  host.querySelector(focus).focus();
  return host;
}

// Unmount every hook between tests: a listener left behind takes the key
// first, and the next test's handler then sees it as already claimed.
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

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
    expect(second.openSearch).toHaveBeenCalledTimes(1);
    expect(first.openSearch).not.toHaveBeenCalled();

    key("Escape");
    expect(second.cancelBlockDrag).toHaveBeenCalledTimes(1);
    expect(first.cancelBlockDrag).not.toHaveBeenCalled();
  });

  it("Escape cancels an active drag before anything else, then closes an open overlay", () => {
    const deps = makeDeps({ overlayOpen: true });
    deps.sidebarDrag.current.active = true;
    renderHook(() => useAppKeyboard(deps));

    key("Escape");
    expect(deps.cancelSidebarDrag).toHaveBeenCalledTimes(1);
    expect(deps.closeOverlay).not.toHaveBeenCalled();

    deps.sidebarDrag.current.active = false;
    key("Escape");
    expect(deps.closeOverlay).toHaveBeenCalledTimes(1);
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

  it("redo answers Cmd+Shift+Z whether Chromium reports the key as z or Z, and Cmd+Y", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    key("z", { metaKey: true, shiftKey: true });
    key("Z", { metaKey: true, shiftKey: true });
    key("y", { metaKey: true });
    expect(deps.redo).toHaveBeenCalledTimes(3);
    key("z", { metaKey: true });
    expect(deps.undo).toHaveBeenCalledTimes(1);
  });
});

// The closest active surface owns the key (review 2026-09-07, §1.13, §4.6).
describe("key ownership", () => {
  it("a key a surface has already taken is not the shell's", () => {
    const deps = makeDeps({ overlayOpen: true });
    renderHook(() => useAppKeyboard(deps));
    const e = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(deps.closeOverlay).not.toHaveBeenCalled();
  });

  it("no shortcut runs while a modal dialog or a menu holds focus", () => {
    const deps = makeDeps({ overlayOpen: true });
    renderHook(() => useAppKeyboard(deps));

    mount('<div role="dialog" aria-modal="true"><button>ok</button></div>', "button");
    key("n", { metaKey: true });
    key("p", { metaKey: true });
    key("z", { metaKey: true });
    key("Escape");
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(deps.openSearch).not.toHaveBeenCalled();
    expect(deps.undo).not.toHaveBeenCalled();
    expect(deps.closeOverlay).not.toHaveBeenCalled();

    document.body.innerHTML = "";
    mount('<div role="menu" tabindex="-1"></div>', "[role=menu]");
    key("n", { metaKey: true });
    key("Escape");
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(deps.closeOverlay).not.toHaveBeenCalled();
  });

  it("a native text field outside the editor keeps its own undo and redo; the rest still runs", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    mount('<input aria-label="Rename note">', "input");
    const undo = key("z", { metaKey: true });
    key("z", { metaKey: true, shiftKey: true });
    key("y", { metaKey: true });
    expect(deps.undo).not.toHaveBeenCalled();
    expect(deps.redo).not.toHaveBeenCalled();
    // Left to the browser: the field's own undo runs on the default.
    expect(undo.defaultPrevented).toBe(false);
    key("n", { metaKey: true });
    expect(deps.createNote).toHaveBeenCalledTimes(1);
  });

  it("the title field and a code block's textarea are the editor's, so the note's undo is theirs", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    mount("<div data-editor><textarea></textarea></div>", "textarea");
    key("z", { metaKey: true });
    expect(deps.undo).toHaveBeenCalledTimes(1);
    document.body.innerHTML = "";
    mount('<div contenteditable="true" data-title tabindex="0"></div>', "[data-title]");
    key("z", { metaKey: true });
    expect(deps.undo).toHaveBeenCalledTimes(2);
  });

  it("Cmd+K is not the shell's: it belongs to the editor's link shortcut", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    const e = key("k", { metaKey: true });
    expect(deps.openSearch).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("an open modal owns the keys before its focus trap has placed focus", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    const host = document.createElement("div");
    host.innerHTML = '<div role="dialog" aria-modal="true"><button>ok</button></div>';
    document.body.appendChild(host);
    expect(document.activeElement).toBe(document.body);
    key("n", { metaKey: true });
    expect(deps.createNote).not.toHaveBeenCalled();
  });

  it("focusOwner names the surface", () => {
    expect(focusOwner()).toBeNull();
    mount('<div role="alertdialog" aria-modal="true"><button>x</button></div>', "button");
    expect(focusOwner()).toBe("modal");
    document.body.innerHTML = "";
    mount("<input>", "input");
    expect(focusOwner()).toBe("field");
    document.body.innerHTML = "";
    mount('<button role="treeitem">row</button>', "button");
    expect(focusOwner()).toBeNull();
  });
});
