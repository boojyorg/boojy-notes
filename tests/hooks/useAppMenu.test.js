/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

/**
 * The application menu (electron/appMenu.ts) sends an item's id to the window;
 * useAppKeyboard runs what the item's key runs, under the key's ownership
 * rules, and tells the menu what can act (2026-09-24).
 */
const api = vi.hoisted(() => ({
  command: null,
  onMenuCommand: vi.fn(),
  setMenuState: vi.fn(),
  revealNote: vi.fn(),
  checkForUpdate: vi.fn(),
}));
vi.mock("../../src/services/apiProvider", () => ({ getAPI: () => api }));

import { useAppKeyboard } from "../../src/hooks/useAppKeyboard";

const blocks = [
  { id: "b1", type: "p", text: "one" },
  { id: "b2", type: "p", text: "two" },
  { id: "b3", type: "p", text: "three" },
];

function makeDeps(overrides = {}) {
  return {
    activeNote: "n1",
    noteData: { n1: { title: "A", content: { blocks } } },
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
    canUndo: false,
    canRedo: false,
    renameNote: vi.fn(),
    duplicateNote: vi.fn(),
    moveNote: vi.fn(),
    deleteNote: vi.fn(),
    applyFormat: vi.fn(),
    setBlockKind: vi.fn(),
    openFind: vi.fn(),
    ...overrides,
  };
}

/** The note on screen: three text blocks inside the editor root. */
function mountEditor() {
  const host = document.createElement("div");
  host.innerHTML = `<div data-editor contenteditable="true">
    <p data-block-id="b1">one</p><p data-block-id="b2">two</p><p data-block-id="b3">three</p>
  </div><input id="field" /><span data-title>A</span>`;
  document.body.appendChild(host);
  return host;
}

/** Select from the start of one block to the end of another. */
function select(from, to) {
  const a = document.querySelector(`[data-block-id="${from}"]`).firstChild;
  const b = document.querySelector(`[data-block-id="${to}"]`).firstChild;
  const range = document.createRange();
  range.setStart(a, 0);
  range.setEnd(b, b.length);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

const run = (id) => act(() => api.command(id));

beforeEach(() => {
  api.onMenuCommand.mockImplementation((cb) => {
    api.command = cb;
    return () => {};
  });
  api.setMenuState.mockClear();
  api.revealNote.mockClear();
  document.execCommand = vi.fn();
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("the application menu", () => {
  it("runs a note's own commands on the open note", () => {
    const deps = makeDeps();
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    run("rename");
    run("duplicate");
    run("trash");
    run("reveal");
    expect(deps.renameNote).toHaveBeenCalledWith("n1");
    expect(deps.duplicateNote).toHaveBeenCalledWith("n1");
    expect(deps.deleteNote).toHaveBeenCalledWith("n1");
    expect(api.revealNote).toHaveBeenCalledWith("n1");
  });

  it("opens Move to… under the note's name", () => {
    const deps = makeDeps();
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    run("moveTo");
    const [subject, anchor] = deps.moveNote.mock.calls[0];
    expect(subject).toEqual({ kind: "notes", ids: ["n1"] });
    expect(Object.keys(anchor).sort()).toEqual(["bottom", "left", "right", "top"]);
  });

  it("does nothing to a note when none is open", () => {
    const deps = makeDeps({ activeNote: null });
    renderHook(() => useAppKeyboard(deps));
    run("duplicate");
    run("bold");
    expect(deps.duplicateNote).not.toHaveBeenCalled();
    expect(deps.applyFormat).not.toHaveBeenCalled();
  });

  it("formats the selection, and only a selection in the editor", () => {
    const deps = makeDeps();
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    select("b2", "b2");
    run("bold");
    expect(deps.applyFormat).toHaveBeenCalledWith("bold");
    window.getSelection().removeAllRanges();
    run("italic");
    expect(deps.applyFormat).toHaveBeenCalledTimes(1);
  });

  it("turns every block the selection runs through into the chosen kind", () => {
    const deps = makeDeps();
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    select("b3", "b3");
    run("h2");
    expect(deps.setBlockKind).toHaveBeenLastCalledWith("n1", ["b3"], "h2");
    select("b1", "b2");
    run("todo");
    expect(deps.setBlockKind).toHaveBeenLastCalledWith("n1", ["b1", "b2"], "checkbox");
  });

  it("undoes the note in the editor, and a text field's own edit inside it", () => {
    const deps = makeDeps({ canUndo: true });
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    run("undo");
    expect(deps.undo).toHaveBeenCalledTimes(1);
    document.getElementById("field").focus();
    run("undo");
    run("redo");
    expect(deps.undo).toHaveBeenCalledTimes(1);
    expect(document.execCommand).toHaveBeenCalledWith("undo");
    expect(document.execCommand).toHaveBeenCalledWith("redo");
  });

  it("stands down under a modal dialog, as the keys do, but for the scale over Settings", () => {
    const deps = makeDeps();
    const host = mountEditor();
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    host.appendChild(modal);
    renderHook(() => useAppKeyboard(deps));
    run("newNote");
    run("undo");
    run("bigger");
    expect(deps.createNote).not.toHaveBeenCalled();
    expect(deps.undo).not.toHaveBeenCalled();
    expect(deps.setUiScale).not.toHaveBeenCalled();
    modal.setAttribute("data-settings-pane", "");
    run("bigger");
    expect(deps.setUiScale).toHaveBeenCalledTimes(1);
  });

  it("opens the find bar, steps through it, and shows Replace", () => {
    const deps = makeDeps();
    renderHook(() => useAppKeyboard(deps));
    run("find");
    run("findNext");
    run("findPrevious");
    run("replace");
    expect(deps.openFind.mock.calls).toEqual([["find"], ["next"], ["prev"], ["replace"]]);
  });

  it("tells the menu what can act, and again when focus moves into a field", () => {
    const deps = makeDeps({ canUndo: true });
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    expect(api.setMenuState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hasNote: true,
        hasFile: true,
        canUndo: true,
        canRedo: false,
        textField: false,
      }),
    );
    act(() => document.getElementById("field").focus());
    expect(api.setMenuState).toHaveBeenLastCalledWith(expect.objectContaining({ textField: true }));
  });

  it("tells the menu which formats the selection holds and what kind its line is", async () => {
    vi.useFakeTimers();
    const deps = makeDeps({
      sidebarVisible: false,
      detectActiveFormats: () => ({ bold: true, italic: false, link: true }),
      noteData: {
        n1: {
          title: "A",
          content: { blocks: [{ ...blocks[0] }, { ...blocks[1], type: "h2" }, blocks[2]] },
        },
      },
    });
    mountEditor();
    renderHook(() => useAppKeyboard(deps));
    select("b2", "b2");
    document.dispatchEvent(new Event("selectionchange"));
    act(() => vi.advanceTimersByTime(200));
    expect(api.setMenuState).toHaveBeenLastCalledWith(
      expect.objectContaining({ formats: ["bold", "link"], kind: "h2", sidebarVisible: false }),
    );
    vi.useRealTimers();
  });
});
