/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import SourceView from "../../src/components/SourceView";
import { markdownToBlocks } from "../../src/utils/markdown";

type NoteData = Record<
  string,
  { content: { blocks: { id: string; type: string; text?: string }[] } }
>;

afterEach(cleanup);

/** The view over one note, with a commit that applies to the ref as useHistory's does. */
function mountView(md: string) {
  const noteDataRef = {
    current: { n1: { content: { blocks: markdownToBlocks(md) } } } as NoteData,
  };
  const commitTextChange = vi.fn((updater: (prev: NoteData) => NoteData) => {
    noteDataRef.current = updater(noteDataRef.current);
  });
  const props = {
    noteId: "n1",
    noteDataRef,
    commitTextChange,
    scrollerRef: { current: document.body },
    entryRef: { current: { offset: 2, top: 0, atTop: true } },
    apiRef: { current: null },
  };
  const view = render(<SourceView {...props} />);
  const field = view.getByLabelText("Markdown") as HTMLTextAreaElement;
  return { ...view, field, props, noteDataRef, commitTextChange };
}

const type = (field: HTMLTextAreaElement, value: string) => {
  field.value = value;
  fireEvent.input(field);
};

describe("SourceView", () => {
  it("opens on the note's file text, focused, with the caret where it was", () => {
    const { field, getByTestId } = mountView("# Title\n\nSome *words*.");
    expect(field.value).toBe("# Title\n\nSome *words*.");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(2);
    // The note's own field: Cmd+Z is the note's undo there.
    expect(getByTestId("source-view")).toHaveAttribute("data-editor");
  });

  it("paints the markers muted under the field", () => {
    const { container } = mountView("# Title\n- item");
    const layer = container.querySelector(".source-layer");
    expect(layer?.querySelectorAll(".md-mark")).toHaveLength(2);
    expect(layer?.textContent).toBe("# Title\n- item");
  });

  it("commits what is typed as the note's blocks, read back by the app's own reader", () => {
    const { field, commitTextChange, noteDataRef } = mountView("one");
    type(field, "one\n\n## two");
    expect(commitTextChange).toHaveBeenCalledTimes(1);
    const blocks = noteDataRef.current.n1.content.blocks;
    expect(blocks.map((b) => [b.type, b.text])).toEqual([
      ["p", "one"],
      // One blank line between blocks is structure, not a row.
      ["h2", "two"],
    ]);
  });

  it("switching in commits nothing, so the file is untouched", () => {
    const { commitTextChange } = mountView("# Title\n\nbody");
    expect(commitTextChange).not.toHaveBeenCalled();
  });

  it("repaints from the note when its blocks change elsewhere (an undo), keeping the caret", () => {
    const { field, props, rerender, noteDataRef } = mountView("first line");
    type(field, "first line edited");
    field.setSelectionRange(5, 5);
    noteDataRef.current = { n1: { content: { blocks: markdownToBlocks("first line") } } };
    rerender(<SourceView {...props} />);
    expect(field.value).toBe("first line");
    expect(field.selectionStart).toBe(5);
  });

  it("never respells its own text under the caret", () => {
    // The writer would put a blank line before the rule; the field keeps
    // what was typed, since the blocks it committed are its own.
    const { field, props, rerender } = mountView("text");
    type(field, "text\n---");
    rerender(<SourceView {...props} />);
    expect(field.value).toBe("text\n---");
  });

  it("types a tab as a character", () => {
    const { field } = mountView("a");
    document.execCommand = vi.fn();
    const e = fireEvent.keyDown(field, { key: "Tab" });
    expect(e).toBe(false);
    expect(document.execCommand).toHaveBeenCalledWith("insertText", false, "\t");
  });
});
