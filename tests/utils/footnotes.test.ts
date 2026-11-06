import { describe, expect, it } from "vitest";
import { COMMENT_CLASS } from "../../src/utils/comments";
import {
  FOOTNOTE_INLINE_CLASS,
  FOOTNOTE_REF_CLASS,
  findFootnotes,
  literalRuns,
} from "../../src/utils/footnotes";

const spans = (md: string) =>
  findFootnotes(md).map(({ start, end, kind }) => [kind, md.slice(start, end)]);

describe("findFootnotes: the one reading of a footnote in a block's text", () => {
  it("finds a reference by its label, numbers and words alike", () => {
    expect(spans("Created in 2004.[^1] Bread.[^recipe]")).toEqual([
      ["ref", "[^1]"],
      ["ref", "[^recipe]"],
    ]);
  });

  it("a label holds no whitespace and is never empty", () => {
    expect(spans("Spaced.[^my note] and [^] and [^\tx]")).toEqual([]);
  });

  it("a reference followed by a colon mid-sentence is still a reference", () => {
    expect(spans("See [^1]: it says so")).toEqual([["ref", "[^1]"]]);
  });

  it("finds an inline footnote, brackets inside balanced", () => {
    expect(
      spans("Out in 2020.^[Version 1.0 followed.] Tricky.^[with [brackets] inside] end."),
    ).toEqual([
      ["inline", "^[Version 1.0 followed.]"],
      ["inline", "^[with [brackets] inside]"],
    ]);
  });

  it("an inline footnote keeps a wikilink and formatting inside, as text", () => {
    expect(spans("Rich.^[see [[Some Note]] and **bold**] end.")).toEqual([
      ["inline", "^[see [[Some Note]] and **bold**]"],
    ]);
  });

  it("an unclosed inline footnote is text", () => {
    expect(spans("Open ^[never closed and [one] more")).toEqual([]);
  });

  it("nothing inside a code span is a footnote", () => {
    expect(spans("Not a footnote: `[^1]` or `^[x]` here.")).toEqual([]);
  });

  it("a backslash escapes the bracket", () => {
    expect(spans(String.raw`Escaped \[^1] and \^[x] are text.`)).toEqual([]);
  });

  it("an escaped bracket inside an inline footnote does not close it", () => {
    expect(spans(String.raw`a ^[one \] two] b`)).toEqual([["inline", String.raw`^[one \] two]`]]);
  });

  it("a code span inside an inline footnote is skipped whole", () => {
    expect(spans("a ^[see `]` here] b")).toEqual([["inline", "^[see `]` here]"]]);
  });
});

describe("literalRuns: comments and footnotes, each drawn as written", () => {
  it("lists both, in order, each with its class", () => {
    const md = "a %%note%% b[^1] c^[x]";
    expect(literalRuns(md).map(({ start, end, cls }) => [cls, md.slice(start, end)])).toEqual([
      [COMMENT_CLASS, "%%note%%"],
      [FOOTNOTE_REF_CLASS, "[^1]"],
      [FOOTNOTE_INLINE_CLASS, "^[x]"],
    ]);
  });

  it("a footnote inside a comment is the comment's text", () => {
    const md = "a %%see [^1]%% b";
    expect(literalRuns(md).map(({ cls }) => cls)).toEqual([COMMENT_CLASS]);
  });

  it("an inline footnote that would hold a comment's marker is text", () => {
    const md = "a ^[x %%y%% z] b";
    expect(literalRuns(md).map(({ cls }) => cls)).toEqual([COMMENT_CLASS]);
  });
});
