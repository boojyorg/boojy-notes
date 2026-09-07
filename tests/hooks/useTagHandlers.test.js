/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTagHandlers } from "../../src/hooks/useTagHandlers";

function setup(overrides = {}) {
  const setSearch = vi.fn();
  const setTagMenu = vi.fn();
  const commitNoteData = vi.fn();
  const syncGeneration = { current: 0 };
  const focusBlockId = { current: null };
  const focusCursorPos = { current: null };
  const tagMenuRef = { current: { noteId: "n1", blockIndex: 0 } };
  const noteDataRef = {
    current: {
      n1: { content: { blocks: [{ id: "b1", text: "hello #wor" }] } },
    },
  };
  const deps = {
    setSearch,
    setTagMenu,
    commitNoteData,
    syncGeneration,
    focusBlockId,
    focusCursorPos,
    tagMenuRef,
    noteDataRef,
    ...overrides,
  };
  const { result } = renderHook(() => useTagHandlers(deps));
  return { ...deps, result };
}

describe("useTagHandlers", () => {
  it("handleTagClick sets the sidebar search to #tag and opens the palette the way Cmd+K does", () => {
    const openSearch = vi.fn();
    const { result, setSearch } = setup({ openSearch });
    result.current.handleTagClick("work");
    expect(setSearch).toHaveBeenCalledWith("#work");
    expect(openSearch).toHaveBeenCalledTimes(1);
  });

  it("handleTagSelect repaints the block at once and puts the caret after the tag", () => {
    // Enter arrives from the menu's native window listener, where React does
    // not re-render the editor, so the hook writes the block's HTML itself.
    const el = document.createElement("div");
    el.textContent = "hello #wor";
    document.body.appendChild(el);
    const blockRefs = { current: { b1: el } };
    const noteTitleSetRef = { current: new Set() };
    const { result, syncGeneration, focusBlockId } = setup({ blockRefs, noteTitleSetRef });
    result.current.handleTagSelect("work");
    expect(el.querySelector(".inline-tag")?.textContent).toBe("#work");
    // A plain space ends the tag (the bytes on disk), and the caret is parked
    // on the zero-width anchor after it, which the walkers drop.
    expect(el.textContent).toBe("hello #work \u200B");
    const sel = window.getSelection();
    expect(sel.anchorNode).toBe(el.lastChild);
    expect(sel.anchorOffset).toBe(el.lastChild.textContent.length);
    // Painted and placed here, so nothing is queued for the focus effect.
    expect(syncGeneration.current).toBe(0);
    expect(focusBlockId.current).toBeNull();
    el.remove();
  });

  it("handleTagSelect replaces the in-progress token and restores the caret", () => {
    const { result, commitNoteData, syncGeneration, focusBlockId, focusCursorPos, setTagMenu } =
      setup();
    result.current.handleTagSelect("work");

    // commitNoteData called with an updater that rewrites the block text
    expect(commitNoteData).toHaveBeenCalledTimes(1);
    const updater = commitNoteData.mock.calls[0][0];
    const next = updater({ n1: { content: { blocks: [{ id: "b1", text: "hello #wor" }] } } });
    expect(next.n1.content.blocks[0].text).toBe("hello #work ");

    expect(syncGeneration.current).toBe(1);
    expect(focusBlockId.current).toBe("b1");
    expect(focusCursorPos.current).toBe("hello #work ".length);
    expect(setTagMenu).toHaveBeenCalledWith(null);
  });

  it("handleTagSelect is a no-op (only closes menu) when there's no menu context", () => {
    const { result, commitNoteData, setTagMenu } = setup({ tagMenuRef: { current: null } });
    result.current.handleTagSelect("work");
    expect(commitNoteData).not.toHaveBeenCalled();
    expect(setTagMenu).not.toHaveBeenCalled();
  });

  it("handleTagSelect closes the menu without editing when no #token precedes the caret", () => {
    const { result, commitNoteData, setTagMenu } = setup({
      noteDataRef: {
        current: { n1: { content: { blocks: [{ id: "b1", text: "no tag here" }] } } },
      },
    });
    result.current.handleTagSelect("work");
    expect(commitNoteData).not.toHaveBeenCalled();
    expect(setTagMenu).toHaveBeenCalledWith(null);
  });
});
