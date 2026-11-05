/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../src/utils/inlineFormatting", () => ({
  inlineMarkdownToHtml: (text) => `RENDERED:${text}`,
}));

import { useWikilinkHandlers } from "../../src/hooks/useWikilinkHandlers";

function setup(overrides = {}) {
  const noteData = {
    n1: { title: "Alpha", content: { blocks: [{ id: "b1", text: "see [[Be" }] } },
    n2: { title: "Beta", content: { blocks: [] } },
    n3: { title: "Gamma", folder: "Work", content: { blocks: [] } },
  };
  const openNote = vi.fn();
  const createNote = vi.fn();
  const setWikilinkMenu = vi.fn();
  const commitNoteData = vi.fn();
  const showToast = vi.fn();
  const deps = {
    noteData,
    noteDataRef: { current: noteData },
    textOnlyEdit: { current: false },
    openNote,
    createNote,
    wikilinkMenuRef: { current: { noteId: "n1", blockIndex: 0 } },
    setWikilinkMenu,
    syncGeneration: { current: 0 },
    commitNoteData,
    showToast,
    blockRefs: { current: {} },
    focusBlockId: { current: null },
    focusCursorPos: { current: null },
    ...overrides,
  };
  const { result, rerender } = renderHook((p) => useWikilinkHandlers(p), { initialProps: deps });
  return { ...deps, result, rerender };
}

describe("useWikilinkHandlers", () => {
  it("builds the title set (lowercased)", () => {
    const { result } = setup();
    expect(result.current.noteTitleSet.has("alpha")).toBe(true);
    expect(result.current.noteTitleSet.has("beta")).toBe(true);
    expect(result.current.noteTitleSet.has("gamma")).toBe(true);
    expect(result.current.noteTitleSet.has("work/gamma")).toBe(true);
    // The backlink index left with the panel (2026-09-05).
    expect(result.current).not.toHaveProperty("currentBacklinks");
  });

  it("click opens an existing note by title (case-insensitive)", () => {
    const { result, openNote, createNote } = setup();
    result.current.handleWikilinkClick("beta");
    expect(openNote).toHaveBeenCalledWith("n2");
    expect(createNote).not.toHaveBeenCalled();
  });

  it("click on a missing name opens the picker on the link, and creates nothing (2026-09-20)", () => {
    const openLinkFixerRef = { current: vi.fn() };
    const { result, openNote, createNote, showToast } = setup({ openLinkFixerRef });
    const el = document.createElement("span");
    result.current.handleWikilinkClick("Delta", el);
    expect(openLinkFixerRef.current).toHaveBeenCalledWith(el, { fix: true });
    expect(createNote).not.toHaveBeenCalled();
    expect(openNote).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    // With no element to fix (the context menu's Open on a broken link), it says so.
    result.current.handleWikilinkClick("Delta");
    expect(showToast).toHaveBeenCalled();
  });

  it("a name two notes share resolves to neither: the title set leaves it out and a click asks", () => {
    const openLinkFixerRef = { current: vi.fn() };
    const noteData = {
      n1: { title: "Goals", folder: "Personal", content: { blocks: [] } },
      n2: { title: "Goals", folder: "Uni", content: { blocks: [] } },
      n3: { title: "Other", content: { blocks: [] } },
    };
    const { result, openNote } = setup({
      noteData,
      noteDataRef: { current: noteData },
      openLinkFixerRef,
    });
    expect(result.current.noteTitleSet.has("goals")).toBe(false);
    expect(result.current.noteTitleSet.has("personal/goals")).toBe(true);
    expect(result.current.noteTitleSet.has("other")).toBe(true);
    const el = document.createElement("span");
    result.current.handleWikilinkClick("Goals", el);
    expect(openNote).not.toHaveBeenCalled();
    expect(openLinkFixerRef.current).toHaveBeenCalledWith(el, { fix: true });
    result.current.handleWikilinkClick("Personal/Goals", el);
    expect(openNote).toHaveBeenCalledWith("n1");
  });

  // Obsidian's other target forms name a note too; a click opens that note
  // and never makes a `Beta#Intro` or `Work_Gamma` file (2026-09-15).
  it("click on a heading, block or folder-path link opens the note it names", () => {
    const { result, openNote, createNote } = setup();
    result.current.handleWikilinkClick("Beta#Intro");
    result.current.handleWikilinkClick("Beta#^ref");
    result.current.handleWikilinkClick("Work/Gamma");
    result.current.handleWikilinkClick("Work/Gamma.md#Plan");
    expect(openNote.mock.calls).toEqual([["n2"], ["n2"], ["n3"], ["n3"]]);
    expect(createNote).not.toHaveBeenCalled();
  });

  it("click on an unsupported target whose note is missing creates nothing and says so", () => {
    const { result, openNote, createNote, showToast } = setup();
    result.current.handleWikilinkClick("Delta#Intro");
    result.current.handleWikilinkClick("Work/Delta");
    // Beta exists, but the path says Old: a stale path opens no namesake.
    result.current.handleWikilinkClick("Old/Beta");
    expect(createNote).not.toHaveBeenCalled();
    expect(openNote).not.toHaveBeenCalled();
    expect(showToast.mock.calls.map(([msg, type]) => [msg.split(".")[0], type])).toEqual([
      ['No note named "Delta"', "info"],
      ['No note named "Delta" in Work', "info"],
      ['No note named "Beta" in Old', "info"],
    ]);
  });

  describe("a heading link", () => {
    const guide = {
      title: "Guide",
      content: {
        blocks: [
          { id: "g1", type: "h1", text: "Guide" },
          { id: "g2", type: "h2", text: "**Tables**" },
          { id: "g3", type: "p", text: "rows ^Rows-ID" },
          { id: "g4", type: "h2", text: "Callouts" },
        ],
      },
    };
    const headingSetup = () => {
      const noteData = { n1: guide, n2: { title: "Beta", content: { blocks: [] } } };
      const reveal = vi.fn();
      const place = { top: { id: "g1", top: 0 }, caret: null };
      const history = { jump: vi.fn(), recordPlace: vi.fn() };
      const ctx = setup({
        noteData,
        noteDataRef: { current: noteData },
        activeNote: "n2",
        headingNavRef: { current: { reveal, place: () => place } },
        noteHistoryRef: { current: history },
      });
      return { ...ctx, reveal, history, place };
    };

    it("opens another note and reveals the heading's section", () => {
      const { result, openNote, reveal, history, showToast } = headingSetup();
      result.current.handleWikilinkClick("Guide#tables");
      expect(openNote).toHaveBeenCalledWith("n1");
      expect(reveal).toHaveBeenCalledWith("n1", "g2", "g3");
      expect(history.jump).not.toHaveBeenCalled();
      expect(showToast).not.toHaveBeenCalled();
    });

    it("in the open note is a visit of its own, the place left kept first", () => {
      const { result, rerender, openNote, reveal, history, place, ...deps } = headingSetup();
      rerender({ ...deps, openNote, activeNote: "n1" });
      result.current.handleWikilinkClick("#Callouts");
      expect(openNote).not.toHaveBeenCalled();
      expect(history.recordPlace).toHaveBeenCalledWith("n1", place);
      expect(history.jump).toHaveBeenCalledWith("n1");
      expect(reveal).toHaveBeenCalledWith("n1", "g4", "g4");
    });

    it("missing: another note opens at its top, the open note stays; both say so", () => {
      const { result, rerender, openNote, reveal, showToast, ...deps } = headingSetup();
      result.current.handleWikilinkClick("Guide#Nope");
      expect(openNote).toHaveBeenCalledWith("n1");
      rerender({ ...deps, openNote, showToast, activeNote: "n1" });
      result.current.handleWikilinkClick("#Nope");
      expect(openNote).toHaveBeenCalledTimes(1);
      expect(reveal).not.toHaveBeenCalled();
      expect(showToast.mock.calls.map(([m]) => m)).toEqual([
        "No heading “Nope” in Guide.",
        "No heading “Nope” in this note.",
      ]);
    });

    it("to a block opens its note there, and in the open note is a visit", () => {
      const { result, rerender, openNote, reveal, history, showToast, ...deps } = headingSetup();
      result.current.handleWikilinkClick("Guide#^rows-id");
      expect(openNote).toHaveBeenCalledWith("n1");
      expect(reveal).toHaveBeenCalledWith("n1", "g3", "g3");
      rerender({ ...deps, openNote, showToast, activeNote: "n1" });
      result.current.handleWikilinkClick("#^rows-id");
      expect(openNote).toHaveBeenCalledTimes(1);
      expect(history.jump).toHaveBeenCalledWith("n1");
      expect(reveal).toHaveBeenCalledTimes(2);
      expect(showToast).not.toHaveBeenCalled();
    });

    it("to a missing block: another note opens at its top, the open note stays; both say so", () => {
      const { result, rerender, openNote, reveal, showToast, ...deps } = headingSetup();
      result.current.handleWikilinkClick("Guide#^nope");
      expect(openNote).toHaveBeenCalledWith("n1");
      rerender({ ...deps, openNote, showToast, activeNote: "n1" });
      result.current.handleWikilinkClick("#^nope");
      expect(openNote).toHaveBeenCalledTimes(1);
      expect(reveal).not.toHaveBeenCalled();
      expect(showToast.mock.calls.map(([m]) => m)).toEqual([
        "No block “^nope” in Guide.",
        "No block “^nope” in this note.",
      ]);
    });
  });

  it("select inserts the link with a bump, leaves the DOM to the block's own repaint, and queues the caret", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const noteData = {
      n1: { title: "Alpha", content: { blocks: [{ id: "b1", text: "see [[Be" }] } },
    };
    const {
      result,
      commitNoteData,
      syncGeneration,
      focusBlockId,
      focusCursorPos,
      setWikilinkMenu,
    } = setup({
      noteData,
      noteDataRef: { current: noteData },
      blockRefs: { current: { b1: el } },
    });

    result.current.handleWikilinkSelect("Beta");

    // state updated for persistence
    const updater = commitNoteData.mock.calls[0][0];
    const next = updater(noteData);
    expect(next.n1.content.blocks[0].text).toBe("see [[Beta]]");
    expect(syncGeneration.current).toBe(1);

    // The block paints itself from the ref on the bump; the handler writes
    // nothing to the DOM. The caret is queued after the link.
    expect(el.innerHTML).toBe("");
    expect(focusBlockId.current).toBe("b1");
    expect(focusCursorPos.current).toBe("see [[Beta]]".length);
    expect(setWikilinkMenu).toHaveBeenCalledWith(null);
  });

  it("select is a no-op when there is no menu context", () => {
    const { result, commitNoteData, setWikilinkMenu } = setup({
      wikilinkMenuRef: { current: null },
    });
    result.current.handleWikilinkSelect("Beta");
    expect(commitNoteData).not.toHaveBeenCalled();
    expect(setWikilinkMenu).not.toHaveBeenCalled();
  });
});
