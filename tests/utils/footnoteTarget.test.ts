import { describe, expect, it } from "vitest";
import {
  addFootnote,
  describeFootnote,
  findFootnoteDefinition,
  footnoteNumbers,
  nextFootnoteNumber,
  numberFootnotes,
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
      sub: "no footnote yet · click to write it",
      missing: true,
    });
    // Where a click can't write one (a table cell, a callout), no offer.
    expect(describeFootnote(blocks("Nowhere.[^x]\n"), "x", false).sub).toBe(
      "no footnote by this label",
    );
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
      md: "One.[^1] Two.[^2]\n\n[^1]: First.\n[^2]: \n",
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

describe("numberFootnotes: Reading view's numbers, drawn over the source", () => {
  const ref = (l: string) =>
    `<span class="md-fn-ref" data-fn="${l}"><span class="md-fn-src">[^${l}]</span></span>`;
  const def = (l: string) => `<span data-footnote-label="" data-fn="${l}">${l}</span>`;
  const n = (sel: string) =>
    [...document.querySelectorAll(sel)].map((e) => e.getAttribute("data-n"));

  it("numbers by first reference; a repeat shares its number; a definition takes its reference's", () => {
    document.body.innerHTML =
      `<div id="r"><p>${ref("proof")} ${ref("1")} ${ref("proof")} ${ref("x")}</p>` +
      `<p>${def("1")}</p><p>${def("proof")}</p><p>${def("lonely")}</p></div>`;
    numberFootnotes(document.getElementById("r") as Element);
    // [^x] has no definition: no number, its text shows.
    expect(n(".md-fn-ref")).toEqual(["1", "2", "1", null]);
    // [^lonely] is named by no reference: its label shows.
    expect(n("[data-footnote-label]")).toEqual(["2", "1", null]);
  });

  it("two definitions of one label: the last is numbered, the earlier is unused and kept", () => {
    document.body.innerHTML = `<div id="r"><p>${ref("dup")}</p><p>${def("dup")}</p><p>${def("dup")}</p></div>`;
    numberFootnotes(document.getElementById("r") as Element);
    expect(n(".md-fn-ref")).toEqual(["1"]);
    expect(n("[data-footnote-label]")).toEqual([null, "1"]);
  });

  it("renumbers when a reference arrives before an existing one, and leaves embeds alone", () => {
    document.body.innerHTML =
      `<div id="r"><p id="p">${ref("b")}</p><p>${def("a")}</p><p>${def("b")}</p>` +
      `<div data-embed-source="Other">${ref("a")}</div></div>`;
    const root = document.getElementById("r") as Element;
    numberFootnotes(root);
    expect(n("[data-footnote-label]")).toEqual([null, "1"]);
    (document.getElementById("p") as Element).insertAdjacentHTML("afterbegin", ref("a"));
    numberFootnotes(root);
    expect(n("[data-footnote-label]")).toEqual(["1", "2"]);
    expect(n("[data-embed-source] .md-fn-ref")).toEqual([null]);
  });
});

describe("footnoteNumbers: the numbers numberFootnotes draws, read from the blocks", () => {
  it("numbers by first reference; a repeat shares; no definition, no number", () => {
    const b = blocks(
      "See[^proof] and[^1], again[^proof], and[^x].\n\n[^1]: One.\n\n[^proof]: Proof.\n\n[^lonely]: Alone.",
    );
    // The same note as numberFootnotes's first case, so the two agree.
    expect([...footnoteNumbers(b)]).toEqual([
      ["proof", 1],
      ["1", 2],
    ]);
  });

  it("counts a callout's title before its body, never code or a comment", () => {
    const b = blocks(
      "> [!note] Title[^t]\n> Body[^b]\n\n`[^c]` %%[^m]%%\n\n[^b]: B.\n\n[^t]: T.\n\n[^c]: C.\n\n[^m]: M.",
    );
    expect([...footnoteNumbers(b)]).toEqual([
      ["t", 1],
      ["b", 2],
    ]);
  });
});
