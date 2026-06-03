/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTagHandlers } from "../../src/hooks/useTagHandlers";

function setup(overrides = {}) {
  const setSearch = vi.fn();
  const setTagMenu = vi.fn();
  const commitTextChange = vi.fn();
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
    commitTextChange,
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
  it("handleTagClick sets the sidebar search to #tag", () => {
    const { result, setSearch } = setup();
    result.current.handleTagClick("work");
    expect(setSearch).toHaveBeenCalledWith("#work");
  });

  it("handleTagSelect replaces the in-progress token and restores the caret", () => {
    const { result, commitTextChange, syncGeneration, focusBlockId, focusCursorPos, setTagMenu } =
      setup();
    result.current.handleTagSelect("work");

    // commitTextChange called with an updater that rewrites the block text
    expect(commitTextChange).toHaveBeenCalledTimes(1);
    const updater = commitTextChange.mock.calls[0][0];
    const next = updater({ n1: { content: { blocks: [{ id: "b1", text: "hello #wor" }] } } });
    expect(next.n1.content.blocks[0].text).toBe("hello #work ");

    expect(syncGeneration.current).toBe(1);
    expect(focusBlockId.current).toBe("b1");
    expect(focusCursorPos.current).toBe("hello #work ".length);
    expect(setTagMenu).toHaveBeenCalledWith(null);
  });

  it("handleTagSelect is a no-op (only closes menu) when there's no menu context", () => {
    const { result, commitTextChange, setTagMenu } = setup({ tagMenuRef: { current: null } });
    result.current.handleTagSelect("work");
    expect(commitTextChange).not.toHaveBeenCalled();
    expect(setTagMenu).not.toHaveBeenCalled();
  });

  it("handleTagSelect closes the menu without editing when no #token precedes the caret", () => {
    const { result, commitTextChange, setTagMenu } = setup({
      noteDataRef: {
        current: { n1: { content: { blocks: [{ id: "b1", text: "no tag here" }] } } },
      },
    });
    result.current.handleTagSelect("work");
    expect(commitTextChange).not.toHaveBeenCalled();
    expect(setTagMenu).toHaveBeenCalledWith(null);
  });
});
