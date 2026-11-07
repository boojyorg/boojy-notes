import { describe, expect, it } from "vitest";
import {
  addFootnote,
  describeFootnote,
  findFootnoteDefinition,
  nextFootnoteNumber,
  ownFootnoteRef,
  refLabel,
} from "../../src/utils/footnoteTarget";
import { blocksToMarkdown, markdownToBlocks } from "../../src/utils/markdown";
import type { Block } from "../../src/types/notes";

const blocks = (md: string) => markdownToBlocks(md) as Block[];

describe("a reference's definition", () => {
  it("reads the label a drawn reference names", () => {
    expect(refLabel("[^proof]")).toBe("proof");
  });

  it("is the last definition with the label, as Obsidian reads a duplicate", () => {
    const b = blocks("Which?[^dup]\n\n[^dup]: The first.\n\n[^dup]: The second.\n");
    expect(b[findFootnoteDefinition(b, "dup")].text).toBe("The second.");
    expect(describeFootnote(b, "dup")).toEqual({ label: "The second.", wrap: true });
  });

  it("shows its later paragraphs, one a line, and its text without markers", () => {
    const b = blocks(
      "Long.[^long]\n\n[^long]: First **bold**.\n    Still first.\n\n    A second.\n\nBack in the note.\n",
    );
    expect(describeFootnote(b, "long")).toEqual({
      label: "First bold. Still first.\nA second.",
      wrap: true,
    });
  });

  it("says so when the note has none, or it is empty", () => {
    expect(describeFootnote(blocks("Nowhere.[^x]\n"), "x")).toEqual({
      label: "[^x]",
      sub: "no footnote by this label",
      missing: true,
    });
    expect(describeFootnote(blocks("Empty.[^e]\n\n[^e]:\n"), "e")).toEqual({
      label: "[^e]",
      sub: "empty footnote",
    });
  });
});

describe("nextFootnoteNumber", () => {
  it("is 1 in a note with no footnotes", () => {
    expect(nextFootnoteNumber(blocks("Plain.\n"))).toBe(1);
  });

  it("is one above every numeric label, a reference's with no definition included", () => {
    expect(
      nextFootnoteNumber(blocks("A.[^1] B.[^7] C.[^note]\n\n[^1]: One.\n[^3]: Three.\n")),
    ).toBe(8);
  });

  it("counts references in a table and a callout, never in code or a comment", () => {
    expect(nextFootnoteNumber(blocks("| A | B |\n| --- | --- |\n| x[^4] | y |\n"))).toBe(5);
    expect(nextFootnoteNumber(blocks("> [!note] Title[^6]\n> Body.[^5]\n"))).toBe(7);
    expect(nextFootnoteNumber(blocks("Not `[^9]` nor %%[^8]%%.\n\n```\n[^10]\n```\n"))).toBe(1);
  });
});

describe("addFootnote: Insert footnote's one edit", () => {
  const insert = (md: string, index: number, text: string, label: string) => {
    const b = blocks(md);
    const at = addFootnote(b, index, text, label, "new");
    return { at, md: blocksToMarkdown(b) };
  };

  it("puts the definition at the note's end, after the footnotes already there", () => {
    expect(insert("One.[^1] Two.\n\n[^1]: First.\n", 0, "One.[^1] Two.[^2]", "2")).toEqual({
      at: 2,
      md: "One.[^1] Two.[^2]\n\n[^1]: First.\n\n[^2]: \n",
    });
  });

  it("starts the footnotes under a note with none", () => {
    expect(insert("Claim.\n\nMore.\n", 0, "Claim.[^1]", "1").md).toBe(
      "Claim.[^1]\n\nMore.\n\n[^1]: \n",
    );
  });

  it("goes above the blank rows a note ends with, never above the edited block", () => {
    const blank = (id: string) => ({ id, type: "p", text: "" }) as Block;
    const b = [{ id: "a", type: "p", text: "Claim." } as Block, blank("e1"), blank("e2")];
    expect(addFootnote(b, 0, "Claim.[^1]", "1", "new")).toBe(1);
    expect(b.map((x) => x.type)).toEqual(["p", "footnote", "p", "p"]);
    const c = [{ id: "a", type: "p", text: "Claim." } as Block, blank("e1"), blank("e2")];
    expect(addFootnote(c, 2, "[^1]", "1", "new")).toBe(3);
  });
});

describe("ownFootnoteRef", () => {
  it("is the open note's reference, never one drawn in an embed", () => {
    document.body.innerHTML =
      '<p><span class="md-fn-ref" id="own">[^1]</span></p>' +
      '<div data-embed-source="Other"><span class="md-fn-ref" id="theirs">[^1]</span></div>';
    expect(ownFootnoteRef(document.getElementById("own"))?.id).toBe("own");
    expect(ownFootnoteRef(document.getElementById("theirs"))).toBeNull();
    expect(ownFootnoteRef(document.body)).toBeNull();
  });
});
