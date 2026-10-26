import { describe, expect, it } from "vitest";
import { attachmentRef, joinVault, pickAttachment } from "../../src/utils/attachmentPath";

// The vault Obsidian was asked about on 2026-10-26: each case's answer below
// is the copy Obsidian drew (`obsidian-attachment-test`, cases 1–9).
const VAULT = [
  "Notes/pic1.svg",
  "pic1.svg",
  "pic2.svg",
  "attachments/pic2.svg",
  "Alpha/Deep/pic3.svg",
  "Zeta/pic3.svg",
  "Zulu/pic3b.svg",
  "Bravo/x/y/pic3b.svg",
  "Notes/pic4.svg",
  "Other/pic4.svg",
  "Aaa/pic4b.svg",
  "Notes/Sib/pic4b.svg",
  "Other/img/pic5.svg",
  "pic5.svg",
  "img/pic6.svg",
  "Notes/pic six.svg",
  "Elsewhere/pic7.svg",
  "Notes/Sub/pic8.svg",
  "X/pic8.svg",
  "Mmm/pic9.svg",
  "Bbb/pic9.svg",
];

function vaultOf(paths: string[]) {
  const set = new Set(paths);
  return {
    exists: (rel: string) => set.has(rel),
    named: (name: string) =>
      paths.filter((p) => p.slice(p.lastIndexOf("/") + 1).toLowerCase() === name),
  };
}

function pick(src: string, folder: string | null, paths = VAULT, markdown = false) {
  const ref = attachmentRef(src, markdown);
  if (!ref) return null;
  const { exists, named } = vaultOf(paths);
  return pickAttachment(ref, folder, exists, named);
}

describe("pickAttachment: Obsidian's order", () => {
  it.each([
    [
      "1: the path from the vault's top beats a copy beside the note",
      "pic1.svg",
      "Notes",
      "pic1.svg",
    ],
    ["2: attachments/ has no place of its own", "pic2.svg", "Notes", "pic2.svg"],
    ["3: the shorter path wins", "pic3.svg", "Notes", "Zeta/pic3.svg"],
    ["3b: the shorter path wins, not A–Z", "pic3b.svg", "Notes", "Zulu/pic3b.svg"],
    ["4b: a sibling folder is not nearer", "pic4b.svg", "Notes/Sub", "Aaa/pic4b.svg"],
    [
      "5: a written folder matches only a path ending in it",
      "img/pic5.svg",
      "Notes",
      "Other/img/pic5.svg",
    ],
    ["7: a bare name is found anywhere", "pic7.svg", "Notes", "Elsewhere/pic7.svg"],
    [
      "8: the note's own folder beats a shorter path",
      "pic8.svg",
      "Notes/Sub",
      "Notes/Sub/pic8.svg",
    ],
  ])("%s", (_label, src, folder, expected) => {
    expect(pick(src, folder)).toBe(expected);
  });

  it("6: a ../ path is read from the note's folder", () => {
    expect(pick("../img/pic6.svg", "Notes", VAULT, true)).toBe("img/pic6.svg");
  });

  it("6b: a Markdown address's percent-escapes are decoded", () => {
    expect(pick("pic%20six.svg", "Notes", VAULT, true)).toBe("Notes/pic six.svg");
  });

  // Obsidian broke ties by its own file order (cases 4 and 9 disagreed); A–Z
  // here, so the desktop and the phone agree.
  it("4, 9: a tie in length goes A–Z", () => {
    expect(pick("pic4.svg", "Notes/Sub")).toBe("Notes/pic4.svg");
    expect(pick("pic9.svg", "Notes")).toBe("Bbb/pic9.svg");
  });

  it("picks the same copy whatever order the files are listed in", () => {
    const reversed = [...VAULT].reverse();
    for (const [src, folder] of [
      ["pic3.svg", "Notes"],
      ["pic4.svg", "Notes/Sub"],
      ["pic9.svg", "Notes"],
      ["img/pic5.svg", "Notes"],
    ] as const) {
      expect(pick(src, folder, reversed)).toBe(pick(src, folder));
    }
  });

  it("matches names and paths ignoring case", () => {
    expect(pick("PIC7.SVG", "Notes")).toBe("Elsewhere/pic7.svg");
    expect(pick("IMG/pic5.svg", null)).toBe("Other/img/pic5.svg");
  });

  it("finds nothing for a name no file has", () => {
    expect(pick("nowhere.png", "Notes")).toBeNull();
    expect(pick("Missing/img/pic5.svg", null)).toBeNull();
  });

  it("falls back to the rest of a ../ path when it is not there", () => {
    expect(pick("../../img/pic7.svg", "Notes", VAULT, true)).toBeNull();
    expect(pick("./pic7.svg", "Notes", VAULT, true)).toBe("Elsewhere/pic7.svg");
  });
});

describe("attachmentRef: the file an address names", () => {
  it("drops the subpath, which is not part of the name", () => {
    expect(attachmentRef("Lecture 3.pdf#page=12")).toBe("Lecture 3.pdf");
    expect(attachmentRef("shot.png#interface")).toBe("shot.png");
  });

  it("keeps a wikilink's % as part of the name; decodes a Markdown address", () => {
    expect(attachmentRef("100%25.png")).toBe("100%25.png");
    expect(attachmentRef("100%25.png", true)).toBe("100%.png");
    expect(attachmentRef("100% done.png", true)).toBe("100% done.png");
    expect(attachmentRef("<my pic.png>", true)).toBe("my pic.png");
  });

  it("names no vault file for a web address or inline data", () => {
    expect(attachmentRef("https://example.com/a.png")).toBeNull();
    expect(attachmentRef("//example.com/a.png")).toBeNull();
    expect(attachmentRef("data:image/png;base64,AAAA")).toBeNull();
    expect(attachmentRef("")).toBeNull();
  });

  it("reads a Windows separator as a folder", () => {
    expect(attachmentRef("img\\a.png")).toBe("img/a.png");
  });
});

describe("joinVault", () => {
  it("reads a path from a folder and never climbs out of the vault", () => {
    expect(joinVault("Notes/Sub", "../img/a.png")).toBe("Notes/img/a.png");
    expect(joinVault(null, "./a.png")).toBe("a.png");
    expect(joinVault("Notes", "../../a.png")).toBeNull();
  });
});
