import { describe, expect, it } from "vitest";
import { vaultLinkTargets } from "../../src/utils/vaultLinkTarget";

describe("vaultLinkTargets", () => {
  it("names nothing for an address", () => {
    for (const dest of [
      "https://example.com/a.md",
      "mailto:a@b.c",
      "//example.com/a.md",
      "",
      " ",
    ]) {
      expect(vaultLinkTargets(dest, "Uni")).toEqual([]);
    }
  });

  it("tries the path from the note's folder, then from the vault's root", () => {
    expect(vaultLinkTargets("Note.md", null)).toEqual(["Note.md"]);
    expect(vaultLinkTargets("Note.md", "Uni")).toEqual(["Uni/Note.md", "Note.md"]);
    expect(vaultLinkTargets("Sub/Note.md", "Uni")).toEqual(["Uni/Sub/Note.md", "Sub/Note.md"]);
    expect(vaultLinkTargets("./Note.md", "Uni")).toEqual(["Uni/Note.md", "Note.md"]);
  });

  it("resolves `..`, and never tries a path that climbs out of the vault", () => {
    expect(vaultLinkTargets("../Other/Note.md", "Uni/Sem 1")).toEqual(["Uni/Other/Note.md"]);
    expect(vaultLinkTargets("../Note.md", "Uni")).toEqual(["Note.md"]);
    expect(vaultLinkTargets("../../Note.md", "Uni")).toEqual([]);
  });

  it("takes a leading slash as the vault's root", () => {
    expect(vaultLinkTargets("/Uni/Note.md", "Personal")).toEqual(["Uni/Note.md"]);
  });

  it("decodes percent-escapes and keeps the heading, block or page", () => {
    expect(vaultLinkTargets("My%20Note.md#A%20Heading", null)).toEqual(["My Note.md#A Heading"]);
    expect(vaultLinkTargets("paper.pdf#page=4", "Uni")).toEqual([
      "Uni/paper.pdf#page=4",
      "paper.pdf#page=4",
    ]);
    expect(vaultLinkTargets("100%.md", null)).toEqual(["100%.md"]);
  });

  it("reads `#Heading` alone as a heading of the same note", () => {
    expect(vaultLinkTargets("#Intro", "Uni")).toEqual(["#Intro"]);
  });

  it("leaves a link's title and angle brackets out of the address", () => {
    expect(vaultLinkTargets('Note.md "A title"', null)).toEqual(["Note.md"]);
    expect(vaultLinkTargets("<My Note.md>", null)).toEqual(["My Note.md"]);
  });
});
