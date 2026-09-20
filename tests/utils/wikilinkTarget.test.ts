import { describe, expect, it } from "vitest";
import {
  linkTargetFor,
  noteLinkKeys,
  parseWikilinkTarget,
  resolveWikilink,
  unresolvedWikilinkMessage,
  wikilinkCandidates,
  wikilinkKey,
  wikilinkMayCreate,
  wikilinkStatus,
} from "../../src/utils/wikilinkTarget";
import type { NoteData } from "../../src/types/notes";

const note = (title: string, folder: string | null = null) =>
  ({ id: title, title, folder, content: { title, blocks: [] } }) as NoteData[string];

const vault: NoteData = {
  beta: note("Beta"),
  gamma: note("Gamma", "Work"),
  gammaRoot: note("Gamma"),
  deep: note("Deep", "Work/Sub"),
};

describe("parseWikilinkTarget", () => {
  it("reads a plain name", () => {
    expect(parseWikilinkTarget("Beta")).toEqual({ name: "Beta", folder: null, subpath: null });
    expect(parseWikilinkTarget("  Beta  ")).toEqual({ name: "Beta", folder: null, subpath: null });
  });
  it("splits a heading or block off at the first #", () => {
    expect(parseWikilinkTarget("Beta#Intro")).toEqual({
      name: "Beta",
      folder: null,
      subpath: "Intro",
    });
    expect(parseWikilinkTarget("Beta#^ref")).toEqual({
      name: "Beta",
      folder: null,
      subpath: "^ref",
    });
    expect(parseWikilinkTarget("Beta#A#B")).toEqual({ name: "Beta", folder: null, subpath: "A#B" });
    expect(parseWikilinkTarget("#Intro")).toEqual({ name: "", folder: null, subpath: "Intro" });
  });
  it("reads a folder path, with or without .md", () => {
    expect(parseWikilinkTarget("Work/Gamma")).toEqual({
      name: "Gamma",
      folder: "Work",
      subpath: null,
    });
    expect(parseWikilinkTarget("Work/Sub/Deep.md")).toEqual({
      name: "Deep",
      folder: "Work/Sub",
      subpath: null,
    });
    expect(parseWikilinkTarget("/Work/Gamma#Plan")).toEqual({
      name: "Gamma",
      folder: "Work",
      subpath: "Plan",
    });
    expect(parseWikilinkTarget("Beta.MD")).toEqual({ name: "Beta", folder: null, subpath: null });
  });
});

describe("resolveWikilink", () => {
  it("matches a plain name case-insensitively, as before", () => {
    expect(resolveWikilink("beta", vault)).toBe("beta");
    expect(resolveWikilink("Missing", vault)).toBeNull();
  });
  it("opens the note a heading or block link names", () => {
    expect(resolveWikilink("Beta#Intro", vault)).toBe("beta");
    expect(resolveWikilink("Beta#^ref", vault)).toBe("beta");
  });
  it("prefers the note at the path a folder link gives", () => {
    expect(resolveWikilink("Work/Gamma", vault)).toBe("gamma");
    expect(resolveWikilink("work/gamma.md", vault)).toBe("gamma");
    expect(resolveWikilink("Work/Sub/Deep#Plan", vault)).toBe("deep");
  });
  it("resolves nothing for a stale path, never a namesake elsewhere", () => {
    expect(resolveWikilink("Old/Beta", vault)).toBeNull();
    expect(resolveWikilink("Work/Beta", vault)).toBeNull();
  });
  it("resolves nothing for a same-note heading link or an empty target", () => {
    expect(resolveWikilink("#Intro", vault)).toBeNull();
    expect(resolveWikilink("   ", vault)).toBeNull();
  });
});

describe("noteLinkKeys and wikilinkKey", () => {
  it("agree on the key a note answers to", () => {
    expect(noteLinkKeys(note("Beta"))).toEqual(["beta"]);
    expect(noteLinkKeys(note("Deep", "Work/Sub"))).toEqual(["deep", "work/sub/deep"]);
    expect(noteLinkKeys(note("  "))).toEqual([]);
    expect(wikilinkKey(parseWikilinkTarget("Deep#Plan"))).toBe("deep");
    expect(wikilinkKey(parseWikilinkTarget("Work/Sub/Deep.md"))).toBe("work/sub/deep");
    expect(wikilinkKey(parseWikilinkTarget("#Plan"))).toBeNull();
  });
});

describe("wikilinkMayCreate", () => {
  it("allows only a plain name", () => {
    expect(wikilinkMayCreate(parseWikilinkTarget("Delta"))).toBe(true);
    expect(wikilinkMayCreate(parseWikilinkTarget("Delta.md"))).toBe(true);
    expect(wikilinkMayCreate(parseWikilinkTarget("Delta#Intro"))).toBe(false);
    expect(wikilinkMayCreate(parseWikilinkTarget("Delta#^id"))).toBe(false);
    expect(wikilinkMayCreate(parseWikilinkTarget("Work/Delta"))).toBe(false);
    expect(wikilinkMayCreate(parseWikilinkTarget("#Intro"))).toBe(false);
    expect(wikilinkMayCreate(parseWikilinkTarget(""))).toBe(false);
  });
});

describe("unresolvedWikilinkMessage", () => {
  it("names the note, and its folder when the link gave one", () => {
    expect(unresolvedWikilinkMessage(parseWikilinkTarget("Beta#Intro"))).toBe(
      'No note named "Beta". Links to a heading, block or folder path don\'t create notes.',
    );
    expect(unresolvedWikilinkMessage(parseWikilinkTarget("Work/Gamma"))).toBe(
      'No note named "Gamma" in Work. Links to a heading, block or folder path don\'t create notes.',
    );
    expect(unresolvedWikilinkMessage(parseWikilinkTarget("#Intro"))).toBe(
      "Links to a heading in this note can't be followed yet.",
    );
  });
});

describe("the picker's readings (2026-09-20)", () => {
  const namesakes = {
    a: { title: "Goals", folder: "Personal", content: { blocks: [] } },
    b: { title: "Goals", folder: "Uni/Sem 1", content: { blocks: [] } },
    c: { title: "Other", content: { blocks: [] } },
    d: { title: "Draft", _draft: true, content: { blocks: [] } },
  };

  it("wikilinkCandidates lists every note a name could mean, drafts left out", () => {
    expect(wikilinkCandidates("goals", namesakes)).toEqual(["a", "b"]);
    expect(wikilinkCandidates("Personal/Goals", namesakes)).toEqual(["a"]);
    expect(wikilinkCandidates("Other", namesakes)).toEqual(["c"]);
    expect(wikilinkCandidates("Draft", namesakes)).toEqual([]);
    expect(wikilinkCandidates("#Intro", namesakes)).toEqual([]);
  });

  it("resolveWikilink answers only a name one note owns", () => {
    expect(resolveWikilink("Goals", namesakes)).toBeNull();
    expect(resolveWikilink("Uni/Sem 1/Goals", namesakes)).toBe("b");
    expect(resolveWikilink("other", namesakes)).toBe("c");
  });

  it("linkTargetFor is the title, or Folder/Title for a namesake", () => {
    expect(linkTargetFor("c", namesakes)).toBe("Other");
    expect(linkTargetFor("a", namesakes)).toBe("Personal/Goals");
    expect(linkTargetFor("b", namesakes)).toBe("Uni/Sem 1/Goals");
    expect(linkTargetFor("zzz", namesakes)).toBe("");
  });

  it("wikilinkStatus says note, ambiguous or missing", () => {
    expect(wikilinkStatus("Other", namesakes)).toEqual({
      kind: "note",
      id: "c",
      title: "Other",
      folder: null,
    });
    expect(wikilinkStatus("Goals", namesakes)).toEqual({
      kind: "ambiguous",
      ids: ["a", "b"],
      name: "Goals",
    });
    expect(wikilinkStatus("Work/Delta#Plan", namesakes)).toEqual({
      kind: "missing",
      name: "Delta",
      folder: "Work",
    });
  });
});
