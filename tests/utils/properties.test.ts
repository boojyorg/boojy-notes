import { describe, expect, it } from "vitest";
import { type Property, readProperties } from "../../src/utils/properties";

const props = (text: string): Property[] => {
  const r = readProperties(text);
  if (!r.ok) throw new Error(`expected rows, got: ${r.reason}`);
  return r.props;
};
const brief = (text: string) => props(text).map((p) => [p.key, p.type, p.editable, p.shown]);

describe("readProperties: types from how the value is written", () => {
  it("reads text, numbers, tick boxes, dates and lists", () => {
    expect(
      brief(
        [
          "title: The Empire Strikes Back",
          'episode: "05"',
          "year: 1980",
          "parts: 05",
          "favourite: true",
          "seen: False",
          "watched: 2026-12-01",
          "at: 2026-12-01T20:30",
          "cast:",
          "  - Mark Hamill",
          '  - "Harrison Ford"',
          "tags: [starwars, actuallygood]",
        ].join("\n"),
      ),
    ).toEqual([
      ["title", "text", true, "The Empire Strikes Back"],
      ["episode", "text", true, "05"],
      ["year", "number", true, "1980"],
      ["parts", "number", true, "05"],
      ["favourite", "checkbox", true, true],
      ["seen", "checkbox", true, false],
      ["watched", "date", true, "2026-12-01"],
      ["at", "datetime", true, "2026-12-01T20:30"],
      ["cast", "list", true, ["Mark Hamill", "Harrison Ford"]],
      ["tags", "list", true, ["starwars", "actuallygood"]],
    ]);
  });

  it("an empty value has no type, whether bare, null or ~", () => {
    expect(brief("rating:\nn: null\nt: ~")).toEqual([
      ["rating", null, true, null],
      ["n", null, true, null],
      ["t", null, true, null],
    ]);
  });

  it("marks tags, aliases and cssclasses as fixed by their name", () => {
    expect(props("tags: [a]\naliases: [b]\ncssclasses:\nother: x").map((p) => p.fixed)).toEqual([
      "tags",
      "aliases",
      "cssclasses",
      undefined,
    ]);
  });
});

describe("readProperties: what the rows may not change", () => {
  it("multi-line text, maps, anchors, aliases, explicit tags and comments in a list are read-only", () => {
    const text = [
      "body: |",
      "  line one",
      "  line two",
      "folded: one",
      "  two",
      "source:",
      "  site: imdb",
      "  id: tt0080684",
      "anchor: &x 1",
      "alias: *x",
      "forced: !!str 5",
      "nested: [[a], b]",
      "commented:",
      "  - a # why",
    ].join("\n");
    expect(props(text).map((p) => [p.key, p.editable, p.shown])).toEqual([
      ["body", false, "line one line two"],
      ["folded", false, "one two"],
      ["source", false, "site: imdb, id: tt0080684"],
      ["anchor", false, "&x 1"],
      ["alias", false, "*x"],
      ["forced", false, "!!str 5"],
      ["nested", false, "[[a], b]"],
      ["commented", false, "- a # why"],
    ]);
  });
});

describe("readProperties: YAML that is not rows", () => {
  it.each([
    ["a parse error", "tags: [a"],
    ["a duplicate key", "a: 1\na: 2"],
    ["a root that is a list", "- a\n- b"],
    ["a root that is text", "just words"],
    ["a quoted key", '"a": 1'],
    ["a merge key", "base: &b\n  x: 1\n<<: *b"],
  ])("%s", (_, text) => {
    expect(readProperties(text).ok).toBe(false);
  });

  it("no properties at all, or comments only, is rows with none", () => {
    expect(readProperties("")).toEqual({ ok: true, props: [] });
    expect(readProperties("# just a note")).toEqual({ ok: true, props: [] });
  });
});

describe("readProperties: each property's own lines", () => {
  it("runs from its key line to the next key's, leaving comments above the next key to it", () => {
    const text = "# Imported\ntitle: x # why\ncast:\n  - a\n  - b\n\n# about year\nyear: 1\n";
    const [title, cast, year] = props(text);
    expect(text.slice(title.start, title.end)).toBe("title: x # why\n");
    expect(text.slice(cast.start, cast.end)).toBe("cast:\n  - a\n  - b\n");
    expect(text.slice(year.start, year.end)).toBe("year: 1\n");
  });

  it("the last property runs to the end, less any trailing comments", () => {
    const text = "a: 1\nb: 2\n# end";
    const [, b] = props(text);
    expect(text.slice(b.start, b.end)).toBe("b: 2\n");
  });
});

describe("readProperties: the preservation fixture", () => {
  it("reads every shape in frontmatter-properties.md as rows", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync("tests/fixtures/preservation/frontmatter-properties.md", "utf8");
    const yaml = raw.split("\n---\n")[0].replace(/^---\n/, "");
    expect(props(yaml).map((p) => [p.key, p.type, p.editable])).toEqual([
      ["title", "text", true],
      ["episode", "text", true],
      ["subtitle", "text", true],
      ["year", "number", true],
      ["favourite", "text", true],
      ["seen", "checkbox", true],
      ["watched", "datetime", true],
      ["cast", "list", true],
      ["tags", "list", true],
      ["aliases", null, true],
      ["cssclasses", null, true],
      ["rating", null, true],
      ["source", null, false],
      ["base", "text", false],
      ["copy", null, false],
      ["blurb", "text", false],
    ]);
  });
});

describe("shownDate", () => {
  it("shows a date in the app's English, the time as written, and anything else unchanged", async () => {
    const { shownDate } = await import("../../src/utils/properties");
    expect(shownDate("2026-12-01")).toBe("1 Dec 2026");
    expect(shownDate("2026-12-01T20:30")).toBe("1 Dec 2026, 20:30");
    expect(shownDate("2026-02-30")).toBe("2026-02-30");
    expect(shownDate("soon")).toBe("soon");
  });
});
