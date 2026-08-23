/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSlashCommands } from "../../../src/hooks/editor/useSlashCommands";

vi.mock("../../../src/utils/storage", () => ({
  genBlockId: () => "new-block-id",
}));

describe("useSlashCommands", () => {
  it("inserts a blank 2x2 table and a following paragraph", async () => {
    const noteData = {
      "note-1": {
        content: { blocks: [{ id: "block-1", type: "p", text: "/table" }] },
      },
    };
    const noteDataRef = { current: noteData };
    const commitNoteData = vi.fn((updater) => {
      noteDataRef.current = updater(noteDataRef.current);
    });
    const focusBlockId = { current: null };
    const focusCursorPos = { current: null };
    const element = document.createElement("div");
    element.textContent = "/table";

    const { result } = renderHook(() =>
      useSlashCommands({
        noteDataRef,
        blockRefs: { current: { "block-1": element } },
        commitNoteData,
        focusBlockId,
        focusCursorPos,
        insertBlockAfter: vi.fn(),
        onError: vi.fn(),
      }),
    );

    await act(() => result.current.executeSlashCommand("note-1", 0, { type: "table" }));

    expect(noteDataRef.current["note-1"].content.blocks).toEqual([
      {
        id: "block-1",
        type: "table",
        text: "",
        rows: [
          ["", ""],
          ["", ""],
        ],
      },
      { id: "new-block-id", type: "p", text: "" },
    ]);
    expect(element.innerHTML).toBe("<br>");
    expect(focusBlockId.current).toBe("new-block-id");
    expect(focusCursorPos.current).toBe(0);
  });
});
