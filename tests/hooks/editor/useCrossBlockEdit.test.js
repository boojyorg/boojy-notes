/** @vitest-environment jsdom */
/**
 * One edit, one block root. The `beforeinput` guard cancels every native
 * edit whose target range is not confined to one block root and makes the
 * edit in state instead, across representative block types; an edit inside
 * one root, a text block or a block that owns its own field, is left to
 * Chromium. jsdom fires no real beforeinput and has no getTargetRanges, so
 * the events are built by hand with the target range Chromium would report.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCrossBlockEdit } from "../../../src/hooks/editor/useCrossBlockEdit";
import { getBlockFromNode } from "../../../src/utils/domHelpers";

vi.mock("../../../src/utils/storage", () => ({ genBlockId: () => "fresh" }));

const p = (id, text) => ({ id, type: "p", text });
const h1 = (id, text) => ({ id, type: "h1", text });
const bullet = (id, text) => ({ id, type: "bullet", text });
const code = (id) => ({ id, type: "code", text: "x" });
const table = (id) => ({ id, type: "table", rows: [["a"]] });
const divider = (id) => ({ id, type: "spacer" });

let editorEl;
let deps;
let roots;

/** Build the editor DOM for `blocks` and the deps the hook needs. */
function setup(blocks) {
  editorEl = document.createElement("div");
  document.body.appendChild(editorEl);
  const refs = {};
  roots = {};
  for (const b of blocks) {
    const root = document.createElement(b.type === "p" ? "p" : "div");
    root.dataset.blockId = b.id;
    root.dataset.blockType = b.type;
    if (b.type === "table") {
      root.contentEditable = "false";
      const cell = document.createElement("td");
      cell.contentEditable = "true";
      cell.textContent = "cell";
      root.appendChild(cell);
    } else if (b.type === "code" || b.type === "spacer") {
      root.contentEditable = "false";
      root.textContent = b.type;
    } else {
      root.textContent = b.text;
      refs[b.id] = root;
    }
    editorEl.appendChild(root);
    roots[b.id] = root;
  }
  const noteDataRef = { current: { n1: { content: { blocks } } } };
  deps = {
    noteDataRef,
    activeNoteRef: { current: "n1" },
    blockRefs: { current: refs },
    editorRef: { current: editorEl },
    commitNoteData: vi.fn((updater) => {
      noteDataRef.current = updater(noteDataRef.current);
    }),
    focusBlockId: { current: null },
    focusCursorPos: { current: null },
    syncGeneration: { current: 0 },
    selectBlock: vi.fn(),
    getBlock: (node) =>
      getBlockFromNode(node, editorEl, noteDataRef.current.n1.content.blocks, refs),
  };
  return renderHook(() => useCrossBlockEdit(deps)).result.current;
}

const text = (id) => roots[id].firstChild;
const blocksNow = () => deps.noteDataRef.current.n1.content.blocks;

function select(startNode, startOffset, endNode = startNode, endOffset = startOffset) {
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/** A beforeinput as Chromium would fire it, with the target range it would report. */
function beforeInput(inputType, target, data = null) {
  const e = new InputEvent("beforeinput", { inputType, data, bubbles: true, cancelable: true });
  e.getTargetRanges = () => (target ? [target] : []);
  return e;
}
const targetRange = (sc, so, ec, eo) => ({
  startContainer: sc,
  startOffset: so,
  endContainer: ec,
  endOffset: eo,
});
/** The target range of an edit over the current selection. */
const selectionTarget = () => {
  const r = window.getSelection().getRangeAt(0);
  return targetRange(r.startContainer, r.startOffset, r.endContainer, r.endOffset);
};

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection().removeAllRanges();
});

describe("useCrossBlockEdit: the beforeinput guard", () => {
  describe("an edit inside one root is Chromium's", () => {
    it("a selection inside one text block is not touched", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), p("b", "second")]);
      select(text("a"), 1, text("a"), 3);
      const e = beforeInput("deleteContentBackward", selectionTarget());
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(false);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });

    it("a selection inside a table cell is the table's own", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), table("t")]);
      const cellText = roots.t.firstChild.firstChild;
      select(cellText, 0, cellText, 2);
      const e = beforeInput("insertText", selectionTarget(), "x");
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(false);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });

    it("an event with no target range (a textarea) is left alone", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), code("k")]);
      const e = beforeInput("insertText", null, "x");
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(false);
    });
  });

  describe("a selection spanning two roots is the app's", () => {
    it.each([
      ["paragraph into paragraph", [p("a", "first"), p("b", "second")], "a", "b", "ficond"],
      ["heading into paragraph", [h1("a", "Title"), p("b", "body")], "a", "b", "Tidy"],
      ["paragraph into list item", [p("a", "first"), bullet("b", "item")], "a", "b", "fiem"],
    ])("Backspace over %s merges the two in state and Chromium does nothing", (_, blocks, s, e2, merged) => {
      const { handleEditorBeforeInput } = setup(blocks);
      select(text(s), 2, text(e2), 2);
      const e = beforeInput("deleteContentBackward", selectionTarget());
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(blocksNow()).toEqual([{ ...blocks[0], text: merged }]);
      expect(deps.focusBlockId.current).toBe(s);
      expect(deps.focusCursorPos.current).toBe(2);
      expect(deps.syncGeneration.current).toBe(1);
    });

    it("Cut, a word delete and a line delete are deletes too", () => {
      for (const type of ["deleteByCut", "deleteWordForward", "deleteSoftLineBackward"]) {
        const { handleEditorBeforeInput } = setup([p("a", "first"), p("b", "second")]);
        select(text("a"), 2, text("b"), 3);
        const e = beforeInput(type, selectionTarget());
        handleEditorBeforeInput(e);
        expect(e.defaultPrevented).toBe(true);
        expect(blocksNow().map((b) => b.text)).toEqual(["fiond"]);
        document.body.innerHTML = "";
      }
    });

    it("typed text replaces the selection inside the start block", () => {
      const { handleEditorBeforeInput } = setup([
        p("a", "first"),
        p("b", "second"),
        p("c", "third"),
      ]);
      select(text("a"), 2, text("c"), 2);
      const e = beforeInput("insertText", selectionTarget(), "Z");
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(blocksNow()).toEqual([p("a", "fiZird")]);
      expect(deps.focusCursorPos.current).toBe(3);
    });

    it("Enter keeps the start block and opens a new one with the rest", () => {
      const { handleEditorBeforeInput } = setup([bullet("a", "one"), bullet("b", "two")]);
      select(text("a"), 1, text("b"), 1);
      const e = beforeInput("insertParagraph", selectionTarget());
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(blocksNow()).toEqual([bullet("a", "o"), bullet("fresh", "wo")]);
      expect(deps.focusBlockId.current).toBe("fresh");
    });

    it("Shift+Enter leaves a soft break in the start block", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), p("b", "second")]);
      select(text("a"), 2, text("b"), 3);
      const e = beforeInput("insertLineBreak", selectionTarget());
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(blocksNow()).toEqual([p("a", "fi\nond")]);
    });

    it("a native format across roots is cancelled and nothing changes", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), p("b", "second")]);
      select(text("a"), 2, text("b"), 3);
      const e = beforeInput("formatBold", selectionTarget());
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });

    it("a selection reaching into a table, code block or divider is refused", () => {
      for (const other of [table("t"), code("k"), divider("s")]) {
        const { handleEditorBeforeInput } = setup([p("a", "first"), other]);
        const inner = roots[other.id].firstChild.firstChild ?? roots[other.id].firstChild;
        select(text("a"), 2, inner, 1);
        const e = beforeInput("deleteContentBackward", selectionTarget());
        handleEditorBeforeInput(e);
        expect(e.defaultPrevented).toBe(true);
        expect(deps.commitNoteData).not.toHaveBeenCalled();
        document.body.innerHTML = "";
      }
    });

    it("a selection with one end outside every root is refused", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first")]);
      const stray = document.createTextNode("stray");
      editorEl.appendChild(stray);
      select(text("a"), 2, stray, 2);
      const e = beforeInput("insertText", selectionTarget(), "x");
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });
  });

  describe("a collapsed caret whose Delete or Backspace reaches into a neighbour", () => {
    it("forward Delete at the end of a block merges the next text block in", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), p("b", "second")]);
      select(text("a"), 5);
      // Chromium reports the reach as a range from the caret to the start of the next root.
      const e = beforeInput("deleteContentForward", targetRange(text("a"), 5, roots.b, 0));
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(blocksNow()).toEqual([p("a", "firstsecond")]);
      expect(deps.focusCursorPos.current).toBe(5);
    });

    it("Backspace at the start of a block whose reach skips a code block above is refused", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), code("k"), p("b", "second")]);
      select(text("b"), 0);
      const e = beforeInput("deleteContentBackward", targetRange(text("a"), 5, roots.b, 0));
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
      expect(deps.selectBlock).not.toHaveBeenCalled();
    });

    it("forward Delete before a divider selects the divider instead", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), divider("s"), p("b", "second")]);
      select(text("a"), 5);
      const e = beforeInput("deleteContentForward", targetRange(text("a"), 5, roots.b, 0));
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(deps.selectBlock).toHaveBeenCalledWith("s");
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });

    it("forward Delete before a table is refused", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), table("t"), p("b", "second")]);
      select(text("a"), 5);
      const e = beforeInput("deleteContentForward", targetRange(text("a"), 5, roots.b, 0));
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });

    it("a reach that is not a delete changes nothing", () => {
      const { handleEditorBeforeInput } = setup([p("a", "first"), p("b", "second")]);
      select(text("a"), 5);
      const e = beforeInput("insertText", targetRange(text("a"), 5, roots.b, 0), "x");
      handleEditorBeforeInput(e);
      expect(e.defaultPrevented).toBe(true);
      expect(deps.commitNoteData).not.toHaveBeenCalled();
    });
  });

  describe("ownEdit, shared with the paste and cut paths", () => {
    it("makes the edit for a block scope too, and reports a refusal", () => {
      const { scopeOf, ownEdit } = setup([p("a", "first"), table("t")]);
      select(text("a"), 1, text("a"), 3);
      const range = window.getSelection().getRangeAt(0);
      expect(ownEdit(scopeOf(range), { kind: "delete" }, range)).toBe(true);
      expect(blocksNow()[0]).toEqual(p("a", "fst"));

      const cellText = roots.t.firstChild.firstChild;
      select(text("a"), 1, cellText, 1);
      const across = window.getSelection().getRangeAt(0);
      expect(ownEdit(scopeOf(across), { kind: "delete" }, across)).toBe(false);
    });
  });
});
