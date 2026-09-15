import { describe, expect, it } from "vitest";
import {
  noteLinkKeys,
  parseWikilinkTarget,
  resolveWikilink,
  unresolvedWikilinkMessage,
  wikilinkKey,
  wikilinkMayCreate,
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
