/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useAppKeyboard, focusOwner } from "../../src/hooks/useAppKeyboard";

function makeDeps(overrides = {}) {
  return {
    activeNote: "n1",
    noteData: { n1: { title: "A", content: { blocks: [] } } },
    uiScale: 100,
    blockDrag: { current: { active: false } },
    sidebarDrag: { current: { active: false } },
    titleRef: { current: null },
    undo: vi.fn(),
    redo: vi.fn(),
    createNote: vi.fn(),
    createFolder: vi.fn(),
    revealSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    openSearch: vi.fn(),
    openSettings: vi.fn(),
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

    // A re-render hands the hook new callbacks — as happens when the active
    // note changes (cancelBlockDrag). Nothing else changed, so the old code
    // kept the mount closure and called the first-render functions.
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

  it("Escape cancels an active drag, and otherwise is nobody's", () => {
    const deps = makeDeps();
    deps.sidebarDrag.current.active = true;
    renderHook(() => useAppKeyboard(deps));

    let e = key("Escape");
    expect(deps.cancelSidebarDrag).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);

    // With no drag to cancel the shell leaves Escape alone: the sidebar sits
    // in the layout at every width and only its toggle hides it (the overlay
    // it used to close went on 2026-09-14).
    deps.sidebarDrag.current.active = false;
    e = key("Escape");
    expect(deps.cancelSidebarDrag).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
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

  // Cmd+Shift+N is New folder (Apple Notes, Finder); Cmd+, is Settings; Cmd+\
  // toggles the sidebar (2026-09-17). Cmd+N alone is still New note.
  it("Cmd+Shift+N makes a folder and not a note; Cmd+, opens Settings; Cmd+\\ toggles the sidebar", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));

    let e = key("n", { metaKey: true, shiftKey: true });
    expect(deps.createFolder).toHaveBeenCalledWith(null);
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    key("N", { metaKey: true, shiftKey: true });
    expect(deps.createFolder).toHaveBeenCalledTimes(2);
    key("n", { metaKey: true });
    expect(deps.createNote).toHaveBeenCalledTimes(1);

    e = key(",", { ctrlKey: true });
    expect(deps.openSettings).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);

    e = key("\\", { metaKey: true });
    expect(deps.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    // A layout that puts the character elsewhere: the physical key counts.
    key("ü", { metaKey: true, code: "Backslash" });
    expect(deps.toggleSidebar).toHaveBeenCalledTimes(2);
    // Without a modifier the characters are typing.
    key(",");
    key("\\");
    expect(deps.openSettings).toHaveBeenCalledTimes(1);
    expect(deps.toggleSidebar).toHaveBeenCalledTimes(2);
  });

  it("Ctrl+Cmd+S goes to the sidebar's tree, showing the sidebar first if hidden", () => {
    mount(
      '<div role="tree"><button tabindex="-1">a</button><button tabindex="0" id="stop">b</button></div>',
      "#stop",
    );
    document.body.focus();
    const hidden = makeDeps({ sidebarVisible: false });
    renderHook(() => useAppKeyboard(hidden));
    const e = key("s", { ctrlKey: true, metaKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(hidden.revealSidebar).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("stop");
    // Cmd+S alone is not it.
    key("s", { metaKey: true });
    expect(hidden.revealSidebar).toHaveBeenCalledTimes(1);
  });

  it("Ctrl+Cmd+S with the sidebar showing only moves focus", () => {
    mount('<div role="tree"><button tabindex="0" id="stop">b</button></div>', "#stop");
    document.body.focus();
    const shown = makeDeps({ sidebarVisible: true });
    renderHook(() => useAppKeyboard(shown));
    key("s", { ctrlKey: true, altKey: true });
    expect(shown.revealSidebar).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("stop");
  });

  it("Cmd+/ switches the Markdown view, and only with a note open", () => {
    const toggleSourceView = vi.fn();
    renderHook(() => useAppKeyboard(makeDeps({ toggleSourceView })));
    const e = key("/", { metaKey: true });
    expect(toggleSourceView).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    // A layout where the slash needs Shift: the physical key counts.
    key("7", { ctrlKey: true, shiftKey: true, code: "Slash" });
    expect(toggleSourceView).toHaveBeenCalledTimes(2);
    // Typing a slash is typing.
    key("/");
    expect(toggleSourceView).toHaveBeenCalledTimes(2);
    cleanup();
    const none = vi.fn();
    renderHook(() => useAppKeyboard(makeDeps({ activeNote: null, toggleSourceView: none })));
    expect(key("/", { metaKey: true }).defaultPrevented).toBe(false);
    expect(none).not.toHaveBeenCalled();
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

  // The readout the shortcut raises is the scale's whole feedback, so a press
  // at either end of the range must still answer, with the scale it is on;
  // silence there reads as a missed keystroke (2026-09-19). Setting the scale
  // it already holds is a no-op for state.
  it("a scale key at the end of the range answers with the scale it is on", () => {
    const top = makeDeps({ uiScale: 200 });
    const { rerender } = renderHook((props) => useAppKeyboard(props), { initialProps: top });
    key("=", { metaKey: true });
    expect(top.setUiScale).toHaveBeenCalledWith(200);

    const bottom = makeDeps({ uiScale: 50 });
    rerender(bottom);
    key("-", { metaKey: true });
    expect(bottom.setUiScale).toHaveBeenCalledWith(50);
  });

  // A scale typed into Settings' Custom… field sits between two presets; the
  // keys take it to the nearest one on the side they point.
  it("from a custom scale, the keys move to the nearest preset either side", () => {
    const deps = makeDeps({ uiScale: 93 });
    renderHook(() => useAppKeyboard(deps));
    key("=", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(100);
    key("-", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(90);
    key("0", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(100);
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
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    const e = new KeyboardEvent("keydown", { key: "p", metaKey: true, cancelable: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(deps.openSearch).not.toHaveBeenCalled();
  });

  it("no shortcut runs while a modal dialog or a menu holds focus", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));

    mount('<div role="dialog" aria-modal="true"><button>ok</button></div>', "button");
    key("n", { metaKey: true });
    key("p", { metaKey: true });
    key("z", { metaKey: true });
    key("Escape");
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(deps.openSearch).not.toHaveBeenCalled();
    expect(deps.undo).not.toHaveBeenCalled();

    document.body.innerHTML = "";
    mount('<div role="menu" tabindex="-1"></div>', "[role=menu]");
    key("n", { metaKey: true });
    key("Escape");
    expect(deps.createNote).not.toHaveBeenCalled();
    // The scale keys included: they are Settings' exception, not every modal's.
    key("=", { metaKey: true });
    expect(deps.setUiScale).not.toHaveBeenCalled();
  });

  // The app resizes behind the open Settings pane, so the keys that resize it
  // belong there too (2026-09-19). Every other shortcut still stands down.
  it("the scale keys are the one shortcut that works over Settings", () => {
    const deps = makeDeps({ uiScale: 100 });
    renderHook(() => useAppKeyboard(deps));

    mount(
      '<div role="dialog" aria-modal="true" data-settings-pane=""><button>ok</button></div>',
      "button",
    );
    key("=", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(110);
    key("0", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(100);
    // And nothing else does.
    key("n", { metaKey: true });
    key("p", { metaKey: true });
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(deps.openSearch).not.toHaveBeenCalled();
  });

  // The pane's focus trap places focus a frame after it opens, and a key
  // pressed inside that frame is still Settings'.
  it("the scale keys work before the pane's trap has placed focus", () => {
    const deps = makeDeps({ uiScale: 100 });
    renderHook(() => useAppKeyboard(deps));
    const host = document.createElement("div");
    host.innerHTML = '<div role="dialog" aria-modal="true" data-settings-pane=""></div>';
    document.body.appendChild(host);
    key("=", { metaKey: true });
    expect(deps.setUiScale).toHaveBeenCalledWith(110);
  });

  it("a menu inside Settings takes the scale keys back", () => {
    const deps = makeDeps({ uiScale: 100 });
    renderHook(() => useAppKeyboard(deps));
    document.body.innerHTML =
      '<div role="dialog" aria-modal="true" data-settings-pane="">' +
      '<div role="menu"><button id="row">100%</button></div></div>';
    document.getElementById("row").focus();
    key("=", { metaKey: true });
    expect(deps.setUiScale).not.toHaveBeenCalled();
  });

  it("a dialog on top of Settings takes the scale keys back", () => {
    const deps = makeDeps({ uiScale: 100 });
    renderHook(() => useAppKeyboard(deps));

    // The confirm dialog Settings opens for "Change notes folder?" holds the
    // focus, so the pane below it is no longer the surface being used.
    document.body.innerHTML =
      '<div role="dialog" aria-modal="true" data-settings-pane=""></div>' +
      '<div role="alertdialog" aria-modal="true"><button id="confirm">Choose</button></div>';
    document.getElementById("confirm").focus();
    key("=", { metaKey: true });
    expect(deps.setUiScale).not.toHaveBeenCalled();
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
    document.body.innerHTML = "";
    // A non-modal dialog (the path's folder popup) owns the keys while it
    // holds focus, and not when focus is elsewhere.
    mount(
      '<div role="dialog"><div role="tree" tabindex="-1"></div></div><button>out</button>',
      '[role="tree"]',
    );
    expect(focusOwner()).toBe("modal");
    document.querySelector("button").focus();
    expect(focusOwner()).toBeNull();
  });
});
