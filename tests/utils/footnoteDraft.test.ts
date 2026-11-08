/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { Block } from "../../src/types/notes";
import {
  type FootnoteDraft,
  canWriteFootnoteFor,
  draftEdit,
  draftForRef,
  draftNumber,
  endsInFootnoteOpen,
  footnoteContext,
} from "../../src/utils/footnoteDraft";
import { markdownToBlocks } from "../../src/utils/markdown";

const blocks = (md: string) => markdownToBlocks(md) as Block[];
const rect = { top: 0, bottom: 0, left: 0, right: 0 };

describe("endsInFootnoteOpen: a `[^` that opens a reference", () => {
  it("is a `[^` at the caret", () => {
    expect(endsInFootnoteOpen("Flour.[^")).toBe(true);
    expect(endsInFootnoteOpen("[^")).toBe(true);
  });
  it("is not an escaped one, nor anything else", () => {
    expect(endsInFootnoteOpen("Flour.\\[^")).toBe(false);
    expect(endsInFootnoteOpen("Flour.\\\\[^")).toBe(true);
    expect(endsInFootnoteOpen("Flour.^")).toBe(false);
    expect(endsInFootnoteOpen("Flour.[^1")).toBe(false);
  });
});

describe("footnoteContext: where the caret is, for a footnote", () => {
  const at = (html: string, selector: string) => {
    document.body.innerHTML = `<div data-editor>${html}</div>`;
    return (document.querySelector(selector) as Element).firstChild;
  };
  it("prose is offered; a cell or a callout's field is said to be unavailable", () => {
    expect(footnoteContext(at('<p data-block-id="a" id="t">x</p>', "#t"))).toBe("text");
    expect(
      footnoteContext(
        at('<div data-block-id="a"><div contenteditable="true" id="t">x</div></div>', "#t"),
      ),
    ).toBe("field");
  });
  it("code, a comment, a link and a footnote's own line are text there: nothing is said", () => {
    for (const inner of [
      "<code id=t>x</code>",
      "<a id=t>x</a>",
      '<span class="md-comment" id=t>x</span>',
    ]) {
      expect(footnoteContext(at(`<p data-block-id="a">${inner}</p>`, "#t"))).not.toBe("text");
    }
    expect(
      footnoteContext(at('<p data-block-id="a" data-block-type="footnote" id="t">x</p>', "#t")),
    ).toBe("literal");
  });
  it("is nothing outside the editor", () => {
    document.body.innerHTML = '<p id="t">x</p>';
    expect(footnoteContext((document.getElementById("t") as Element).firstChild)).toBeNull();
  });
});

describe("draftEdit: what Done writes", () => {
  const note = blocks("Claim one.[^1] Claim two.\n\n[^1]: First.\n");
  const id = note[0].id;
  const menu = (before: string, after: string): FootnoteDraft => ({
    kind: "menu",
    noteId: "n",
    blockId: id,
    label: "",
    before,
    after,
    rect,
  });

  it("Insert footnote puts the next number where the caret was", () => {
    const edit = draftEdit(note, menu("Claim one.[^1] Claim two", "."));
    expect(edit).toEqual({
      blockIndex: 0,
      text: "Claim one.[^1] Claim two[^2].",
      label: "2",
      refsBefore: 1,
    });
  });

  it("is refused when the line no longer reads as it did either side of the caret", () => {
    expect(draftEdit(note, menu("Claim one.[^1] Claim", "."))).toBeNull();
  });

  it("a typed reference is the user's, as typed", () => {
    const typed: FootnoteDraft = {
      kind: "typed",
      noteId: "n",
      blockId: id,
      label: "Hi",
      refIndex: 0,
      rect,
    };
    expect(draftEdit(note, typed)?.text).toBe("Claim one.[^1] Claim two.");
    expect(draftEdit(note, typed)?.label).toBe("Hi");
  });
});

describe("draftNumber: the number the new footnote will show", () => {
  it("counts by first reference: a footnote put before an existing one is [1]", () => {
    const note = blocks("Claim one.[^1] Claim two.\n\n[^1]: First.\n");
    const before: FootnoteDraft = {
      kind: "menu",
      noteId: "n",
      blockId: note[0].id,
      label: "",
      before: "Claim",
      after: " one.[^1] Claim two.",
      rect,
    };
    expect(draftNumber(note, before)).toBe(1);
    expect(draftNumber(note, { ...before, before: "Claim one.[^1] Claim", after: " two." })).toBe(
      2,
    );
  });
});

describe("draftForRef: the panel for a reference nothing defines", () => {
  /** A block root holding `html`, registered as the app's blockRefs do. */
  const mount = (html: string) => {
    document.body.innerHTML = `<div data-editor><div data-block-id="b1"><div id="root">${html}</div></div></div>`;
    const root = document.getElementById("root") as HTMLElement;
    return { root, roots: { b1: root } as Record<string, HTMLElement | null> };
  };
  const ref = (label: string) =>
    `<span class="md-fn-ref" contenteditable="false" data-fn="${label}">[^${label}]</span>`;

  it("is the typed kind for the reference's label, counting the references before it", () => {
    const { roots } = mount(`One${ref("a")} two${ref("6")}`);
    const six = document.querySelector('[data-fn="6"]') as Element;
    expect(canWriteFootnoteFor(six)).toBe(true);
    expect(draftForRef(six, "n1", roots)).toMatchObject({
      kind: "typed",
      noteId: "n1",
      blockId: "b1",
      label: "6",
      refIndex: 1,
    });
  });

  it("is refused in a field of its own (a cell, a callout), and outside a block", () => {
    const { roots } = mount(`<div data-inline-field>Cell${ref("x")}</div>`);
    const inField = document.querySelector('[data-fn="x"]') as Element;
    expect(canWriteFootnoteFor(inField)).toBe(false);
    expect(draftForRef(inField, "n1", roots)).toBeNull();

    const loose = document.createElement("span");
    loose.setAttribute("data-fn", "y");
    document.body.append(loose);
    expect(canWriteFootnoteFor(loose)).toBe(false);
    expect(draftForRef(loose, "n1", roots)).toBeNull();
  });

  it("is refused when the block's root is not the one holding it", () => {
    mount(ref("z"));
    const z = document.querySelector('[data-fn="z"]') as Element;
    expect(draftForRef(z, "n1", { b1: null })).toBeNull();
  });
});
