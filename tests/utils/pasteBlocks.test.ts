import { describe, it, expect } from "vitest";
import {
  buildPastedBlocks,
  isStructuredMarkdownLine,
  stripIncidentalLineEnding,
  type PastedBlock,
} from "../../src/utils/pasteBlocks";
import { markdownToBlocks } from "../../src/utils/markdown";
import type { Block } from "../../src/types/notes";

let n = 0;
const genId = () => `new-${++n}`;

/** Parse clipboard markdown the way the external multi-line paste path does. */
function pasted(markdown: string): PastedBlock[] {
  return markdownToBlocks(markdown).map(({ id: _id, ...rest }) => rest as PastedBlock);
}

const emptyCheckbox: Block = { id: "dest", type: "checkbox", text: "", checked: false };

describe("buildPastedBlocks", () => {
  describe("plain text keeps the destination block", () => {
    it("empty unchecked checkbox + plain text stays an unchecked checkbox", () => {
      const r = buildPastedBlocks(emptyCheckbox, pasted("Buy milk"), "", "", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "Buy milk", checked: false },
      ]);
      expect(r.focusId).toBe("dest");
      expect(r.focusPos).toBe(8);
    });

    it("empty checked checkbox + plain text stays checked", () => {
      const dest: Block = { id: "dest", type: "checkbox", text: "", checked: true };
      const r = buildPastedBlocks(dest, pasted("Buy milk"), "", "", genId);
      expect(r.blocks).toEqual([{ id: "dest", type: "checkbox", text: "Buy milk", checked: true }]);
    });

    it("filled checkbox, caret at start + plain text merges in front of the task", () => {
      const dest: Block = { id: "dest", type: "checkbox", text: "Task", checked: false };
      const r = buildPastedBlocks(dest, pasted("Buy milk "), "", "Task", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "Buy milk Task", checked: false },
      ]);
      // Caret lands between the pasted text and the existing text
      expect(r.focusPos).toBe("Buy milk ".length);
    });

    // Blocks are Markdown structure: lines with no blank line between them are
    // one paragraph, so they paste as soft breaks inside the destination (what
    // Shift+Enter would have typed); a blank line in the clipboard starts a
    // new block.
    it("plain lines with no blank between them stay in the destination as soft breaks", () => {
      const r = buildPastedBlocks(emptyCheckbox, pasted("line one\nline two"), "", "", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "line one\nline two", checked: false },
      ]);
      expect(r.focusId).toBe("dest");
      expect(r.focusPos).toBe("line one\nline two".length);
    });

    it("plain lines at the start of a filled checkbox merge in front of its text", () => {
      const dest: Block = { id: "dest", type: "checkbox", text: "Task", checked: false };
      const r = buildPastedBlocks(dest, pasted("line one\nline two"), "", "Task", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "line one\nline twoTask", checked: false },
      ]);
      expect(r.focusPos).toBe("line one\nline two".length);
    });

    it("a blank line in the clipboard starts a new block", () => {
      const r = buildPastedBlocks(emptyCheckbox, pasted("line one\n\nline two"), "", "", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "line one", checked: false },
        { id: "new-1", type: "p", text: "line two" },
      ]);
      expect(r.focusId).toBe("new-1");
    });

    it.each([
      ["bullet", { id: "dest", type: "bullet", text: "", indent: 1 } as Block],
      ["numbered", { id: "dest", type: "numbered", text: "", indent: 2 } as Block],
      ["heading", { id: "dest", type: "h2", text: "" } as Block],
      ["blockquote", { id: "dest", type: "blockquote", text: "" } as Block],
    ])("%s keeps its type and indent when plain text is pasted in", (_name, dest) => {
      const r = buildPastedBlocks(dest, pasted("Some words"), "", "", genId);
      expect(r.blocks).toEqual([{ ...dest, text: "Some words" }]);
    });

    it("an indented pasted paragraph does not override the destination indent", () => {
      const dest: Block = { id: "dest", type: "bullet", text: "", indent: 1 };
      const r = buildPastedBlocks(dest, [{ type: "p", text: "x", indent: 3 }], "", "", genId);
      expect(r.blocks).toEqual([{ id: "dest", type: "bullet", text: "x", indent: 1 }]);
    });
  });

  describe("structured paste", () => {
    it("takes over an empty block", () => {
      const r = buildPastedBlocks(emptyCheckbox, pasted("## Title\nbody"), "", "", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "h2", text: "Title" },
        { id: expect.stringMatching(/^new-/), type: "p", text: "body" },
      ]);
    });

    it("checkbox markdown into an empty paragraph carries its checked state", () => {
      const dest: Block = { id: "dest", type: "p", text: "" };
      const r = buildPastedBlocks(dest, pasted("- [x] done"), "", "", genId);
      expect(r.blocks).toEqual([{ id: "dest", type: "checkbox", text: "done", checked: true }]);
    });

    it("does not carry the empty destination's indent onto the structure that replaces it", () => {
      const dest: Block = { id: "dest", type: "bullet", text: "", indent: 2 };
      const r = buildPastedBlocks(dest, pasted("# Big"), "", "", genId);
      expect(r.blocks).toEqual([{ id: "dest", type: "h1", text: "Big" }]);
    });

    it("at the start of a populated block goes in front and leaves the block intact", () => {
      const dest: Block = { id: "dest", type: "checkbox", text: "Task", checked: true, indent: 1 };
      const r = buildPastedBlocks(dest, pasted("## Title\n- item"), "", "Task", genId);
      expect(r.blocks).toEqual([
        { id: expect.stringMatching(/^new-/), type: "h2", text: "Title" },
        { id: expect.stringMatching(/^new-/), type: "bullet", text: "item" },
        { id: "dest", type: "checkbox", text: "Task", checked: true, indent: 1 },
      ]);
      expect(r.focusId).toBe("dest");
      expect(r.focusPos).toBe(0);
    });

    it("in the middle of a populated block splits it and keeps the type on the first half", () => {
      const dest: Block = { id: "dest", type: "checkbox", text: "before after", checked: true };
      const r = buildPastedBlocks(dest, pasted("## Title"), "before ", " after", genId);
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "before ", checked: true },
        { id: expect.stringMatching(/^new-/), type: "h2", text: "Title" },
        { id: expect.stringMatching(/^new-/), type: "p", text: " after" },
      ]);
    });

    it("appends the trailing text to a last pasted block of the destination's own type", () => {
      const dest: Block = { id: "dest", type: "bullet", text: "ab" };
      const r = buildPastedBlocks(dest, pasted("- one\n- two"), "a", "b", genId);
      expect(r.blocks.map((b) => [b.type, b.text])).toEqual([
        ["bullet", "a"],
        ["bullet", "one"],
        ["bullet", "twob"],
      ]);
    });
  });

  describe("internal copy (text/boojy-blocks)", () => {
    it("a copied plain paragraph keeps the destination checkbox", () => {
      const r = buildPastedBlocks(
        emptyCheckbox,
        [{ type: "p", text: "copied line", fullBlock: true }],
        "",
        "",
        genId,
      );
      expect(r.blocks).toEqual([
        { id: "dest", type: "checkbox", text: "copied line", checked: false },
      ]);
    });

    it("copied structure into an empty block never carries the fullBlock flag", () => {
      const r = buildPastedBlocks(
        emptyCheckbox,
        [
          { type: "h1", text: "Head", fullBlock: true },
          { type: "code", text: "x = 1", lang: "py", fullBlock: true },
        ],
        "",
        "",
        genId,
      );
      expect(r.blocks).toEqual([
        { id: "dest", type: "h1", text: "Head" },
        { id: expect.stringMatching(/^new-/), type: "code", text: "x = 1", lang: "py" },
      ]);
    });

    it("a code block never merges: trailing text becomes its own paragraph", () => {
      const dest: Block = { id: "dest", type: "p", text: "ab" };
      const r = buildPastedBlocks(
        dest,
        [{ type: "code", text: "x", lang: "", fullBlock: true }],
        "a",
        "b",
        genId,
      );
      expect(r.blocks.map((b) => [b.type, b.text])).toEqual([
        ["p", "a"],
        ["code", "x"],
        ["p", "b"],
      ]);
    });
  });
});

describe("stripIncidentalLineEnding", () => {
  it("removes exactly one terminal LF", () => {
    expect(stripIncidentalLineEnding("Buy milk\n")).toBe("Buy milk");
  });

  it("removes exactly one terminal CRLF", () => {
    expect(stripIncidentalLineEnding("Buy milk\r\n")).toBe("Buy milk");
  });

  it("leaves a deliberately copied blank line in place", () => {
    expect(stripIncidentalLineEnding("Buy milk\n\n")).toBe("Buy milk\n");
    expect(stripIncidentalLineEnding("Buy milk\r\n\r\n")).toBe("Buy milk\r\n");
  });

  it("leaves text without a terminal line ending alone", () => {
    expect(stripIncidentalLineEnding("a\nb")).toBe("a\nb");
    expect(stripIncidentalLineEnding("")).toBe("");
  });
});

describe("isStructuredMarkdownLine", () => {
  it.each([
    "## Title",
    "- item",
    "1. step",
    "- [ ] task",
    "- [x] done",
    "> quote",
  ])("recognises %s", (line) => expect(isStructuredMarkdownLine(line)).toBe(true));

  it.each(["plain words", "", "a\nb", "---", "```"])("rejects %j", (line) =>
    expect(isStructuredMarkdownLine(line)).toBe(false));
});
