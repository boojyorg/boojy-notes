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
      expect(vaultLinkTargets(dest, "Uni")).toBeNull();
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

  it("tries a destination that ends like a title whole first, then without it", () => {
    expect(vaultLinkTargets('Note.md "A title"', null)).toEqual(['Note.md "A title"', "Note.md"]);
    expect(vaultLinkTargets("Meeting notes (2024)", null)).toEqual([
      "Meeting notes (2024)",
      "Meeting notes",
    ]);
    expect(vaultLinkTargets("<My Note.md>", null)).toEqual(["My Note.md"]);
  });

  it("takes a name with a colon and a space as a name, not a scheme", () => {
    expect(vaultLinkTargets("Re: plan.md", null)).toEqual(["Re: plan.md"]);
  });

  it("names nothing, as a path and not as an address, when it only climbs out of the vault", () => {
    expect(vaultLinkTargets("../Shared/Note.md", null)).toEqual([]);
  });
});
