/**
 * A link's `#subpath` finds its heading as Obsidian 1.15's `resolveSubpath`
 * does, so a link reaches the same heading in both apps.
 */
import { describe, expect, it } from "vitest";
import {
  findHeadingSection,
  headingSegments,
  normaliseHeading,
} from "../../src/utils/headingTarget";

const b = (type: string, text = "") => ({ type, text });

describe("normaliseHeading", () => {
  it("drops Obsidian's punctuation, folds whitespace and case", () => {
    expect(normaliseHeading("**Tables**")).toBe("tables");
    expect(normaliseHeading("Tables?")).toBe("tables");
    expect(normaliseHeading("  Big   [[Link]] here ")).toBe("big link here");
  });

  it("keeps `_` and `-`, as Obsidian does", () => {
    expect(normaliseHeading("_Tables_")).toBe("_tables_");
    expect(normaliseHeading("Step-by-step")).toBe("step-by-step");
  });
});

describe("headingSegments", () => {
  it("splits a heading path and names nothing for an empty subpath or a block", () => {
    expect(headingSegments("A#B")).toEqual(["A", "B"]);
    expect(headingSegments("Tables")).toEqual(["Tables"]);
    expect(headingSegments(null)).toBeNull();
    expect(headingSegments("")).toBeNull();
    expect(headingSegments("^abc123")).toBeNull();
  });
});

describe("findHeadingSection", () => {
  const blocks = [
    b("h1", "Guide"),
    b("p", "intro"),
    b("h2", "**Tables**"),
    b("p", "rows"),
    b("h3", "Widths"),
    b("p", "wide"),
    b("h2", "Callouts"),
    b("h3", "Widths"),
    b("p", "callout widths"),
    b("h1", "Appendix"),
  ];

  it("matches a formatted heading by its words, ignoring case", () => {
    expect(findHeadingSection(blocks, ["tables"])).toEqual({ start: 2, end: 6 });
  });

  it("ends a section at the next heading of its level or higher, or the note's end", () => {
    expect(findHeadingSection(blocks, ["Callouts"])).toEqual({ start: 6, end: 9 });
    expect(findHeadingSection(blocks, ["Appendix"])).toEqual({ start: 9, end: 10 });
  });

  it("takes the first of two same-named headings; a path reaches the second", () => {
    expect(findHeadingSection(blocks, ["Widths"])).toEqual({ start: 4, end: 6 });
    expect(findHeadingSection(blocks, ["Callouts", "Widths"])).toEqual({ start: 7, end: 9 });
  });

  it("finds nothing for a heading the note lacks, or one Obsidian's matching keeps apart", () => {
    expect(findHeadingSection(blocks, ["Nope"])).toBeNull();
    expect(findHeadingSection([b("h2", "_Tables_")], ["Tables"])).toBeNull();
    // A path's later segment must sit deeper than the one before it.
    expect(findHeadingSection(blocks, ["Tables", "Callouts"])).toBeNull();
  });
});
