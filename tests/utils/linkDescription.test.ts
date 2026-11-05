import { describe, expect, it } from "vitest";
import { describeWikilink } from "../../src/utils/linkDescription";
import type { NoteData } from "../../src/types/notes";

const note = (title: string, blocks: { type: string; text: string }[], folder?: string) => ({
  title,
  folder,
  content: { blocks: blocks.map((b, i) => ({ id: `${title}${i}`, ...b })) },
});

const notes = {
  here: note("Here", [
    { type: "h2", text: "Callouts" },
    { type: "p", text: "Has an ID. ^first-block" },
  ]),
  guide: note("Guide", [{ type: "h2", text: "**Tables**" }], "Docs"),
  a: note("Twin", []),
  b: note("Twin", [], "Other"),
} as unknown as NoteData;

const d = (target: string) => describeWikilink(target, notes, "here");

describe("describeWikilink", () => {
  it("a link into the open note says so, never 'no note'", () => {
    expect(d("#^first-block")).toEqual({ label: "^first-block", sub: "in this note" });
    expect(d("#Callouts")).toEqual({ label: "Callouts", sub: "in this note" });
  });

  it("another note's heading reads Note > Heading, its folder beside it", () => {
    expect(d("Guide#tables")).toEqual({ label: "Guide > tables", sub: "Docs" });
    expect(d("Guide")).toEqual({ label: "Guide", sub: "Docs" });
    expect(d("Here")).toEqual({ label: "Here", sub: "Notes" });
  });

  it("a heading or block the note lacks is said, as missing", () => {
    expect(d("#^nope")).toEqual({ label: "^nope", sub: "no block by this name", missing: true });
    expect(d("Guide#Nope")).toEqual({
      label: "Guide > Nope",
      sub: "no heading by this name",
      missing: true,
    });
  });

  it("a missing or shared name is said as before", () => {
    expect(d("Delta")).toEqual({ label: "Delta", sub: "no note by this name", missing: true });
    expect(d("Twin")).toEqual({ label: "Twin", sub: "2 notes share this name", missing: true });
  });
});
