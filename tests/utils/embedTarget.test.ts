import { describe, expect, it } from "vitest";
import { embedFieldsFrom, embedTarget, writtenEmbedTarget } from "../../src/utils/embedTarget";
import type { NoteData } from "../../src/types/notes";

const note = (title: string, blocks: { type: string; text: string }[], folder?: string) => ({
  title,
  folder,
  content: { blocks: blocks.map((b, i) => ({ id: `${title}${i}`, ...b })) },
});

const notes = {
  guide: note("Guide", [
    { type: "frontmatter", text: "tags: x" },
    { type: "h2", text: "Quotes" },
    { type: "p", text: "Q." },
    { type: "h2", text: "Next" },
    { type: "p", text: "N. ^n-id" },
  ]),
  host: note("Host", [{ type: "p", text: "Mine ^here" }]),
  a: note("Twin", []),
  b: note("Twin", [], "Other"),
} as unknown as NoteData;

const shown = (t: ReturnType<typeof embedTarget>) =>
  "blocks" in t ? t.blocks.map((b) => b.text) : t.missing;

describe("embedTarget", () => {
  it("a heading embed is its section; a whole note leaves its properties out", () => {
    expect(shown(embedTarget({ target: "Guide", heading: "Quotes" }, notes, "host"))).toEqual([
      "Quotes",
      "Q.",
    ]);
    expect(shown(embedTarget({ target: "Guide" }, notes, "host"))).toEqual([
      "Quotes",
      "Q.",
      "Next",
      "N. ^n-id",
    ]);
  });

  it("a block embed is its block; with no note name it is the note it sits in", () => {
    expect(shown(embedTarget({ target: "Guide", heading: "^n-id" }, notes, "host"))).toEqual([
      "N. ^n-id",
    ]);
    expect(shown(embedTarget({ target: "#^here" }, notes, "host"))).toEqual(["Mine ^here"]);
  });

  it("says what is missing, in the click's words", () => {
    expect(shown(embedTarget({ target: "Nope" }, notes, "host"))).toBe("No note named “Nope”.");
    expect(shown(embedTarget({ target: "Twin" }, notes, "host"))).toBe("2 notes are named “Twin”.");
    expect(shown(embedTarget({ target: "Guide", heading: "Gone" }, notes, "host"))).toBe(
      "No heading “Gone” in Guide.",
    );
  });

  it("the arrow's words: where it goes, and where to edit", () => {
    const other = embedTarget({ target: "Guide", heading: "Quotes" }, notes, "host");
    const here = embedTarget({ target: "#^here" }, notes, "host");
    expect("openLabel" in other && [other.openLabel, other.editLabel]).toEqual([
      "Open Guide > Quotes",
      "Edit in Guide",
    ]);
    expect("openLabel" in here && [here.openLabel, here.editLabel]).toEqual([
      "Go to ^here in this note",
      "Edit it at ^here, in this note",
    ]);
  });
});

describe("embedFieldsFrom", () => {
  it("splits a typed note embed as the parser does, and round-trips", () => {
    for (const [line, fields] of [
      ["![[Guide#Quotes]]", { target: "Guide", heading: "Quotes" }],
      ["![[#^first-block]]", { target: "#^first-block", heading: null }],
      ["![[Work/Plan]]", { target: "Work/Plan", heading: null }],
    ] as const) {
      expect(embedFieldsFrom(line)).toEqual(fields);
      expect(`![[${writtenEmbedTarget(fields)}]]`).toBe(line);
    }
  });

  it("refuses what is not a note embed", () => {
    for (const line of ["![[sunset.png]]", "![[]]", "[[Guide]]", "Guide", "![[a.pdf#page=2]]"])
      expect(embedFieldsFrom(line)).toBeNull();
  });
});
