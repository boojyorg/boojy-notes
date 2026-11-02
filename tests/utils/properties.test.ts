import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  appendItem,
  type Change,
  conversion,
  nameProblem,
  removeItem,
  removeProperty,
  renameProperty,
  replaceItem,
  runChange,
  setCheckbox,
  setList,
  setText,
  setTyped,
  setUntyped,
  yamlText,
  type Property,
  readProperties,
} from "../../src/utils/properties";

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

const run = (text: string, change: Change) => runChange(text, change);
const prop = (text: string, key: string) => {
  const r = readProperties(text);
  if (!r.ok) throw new Error(r.reason);
  return r.props.find((p) => p.key === key)!;
};

describe("changing one property rewrites only its own text", () => {
  const T =
    '# Imported\ntitle: Empire # the sequel\nyear: 1980\ncast:\n  - Mark Hamill\n  - "Harrison Ford"\ntags: [a, "b, c"]\nrating:\nend: x\n';

  it("text keeps a trailing comment, and quotes only what would read as something else", () => {
    expect(run(T, setText("title", "Return"))).toBe(T.replace("Empire #", "Return #"));
    expect(run(T, setText("title", "1999"))).toBe(T.replace("Empire #", '"1999" #'));
    expect(run(T, setText("title", "yes"))).toBe(T.replace("Empire #", '"yes" #'));
    expect(run(T, setText("title", "#tag"))).toBe(T.replace("Empire #", '"#tag" #'));
    expect(run(T, setText("title", "a: b"))).toBe(T.replace("Empire #", '"a: b" #'));
    expect(run(T, setText("title", "[[Note]]"))).toBe(T.replace("Empire #", '"[[Note]]" #'));
  });

  it("a quoted value keeps its quotes", () => {
    const q = "a: 'it''s'\nb: \"x\"\n";
    expect(run(q, setText("a", "that's"))).toBe("a: 'that''s'\nb: \"x\"\n");
    expect(run(q, setText("b", "y"))).toBe("a: 'it''s'\nb: \"y\"\n");
  });

  it("an empty value is filled after the colon, and cleared back to it", () => {
    expect(run(T, setTyped("rating", "number", "4"))).toBe(T.replace("rating:\n", "rating: 4\n"));
    expect(run(T, setText("title", ""))).toBe(
      T.replace("title: Empire # the sequel", "title: # the sequel"),
    );
  });

  it("numbers, dates and tick boxes are written as they read", () => {
    expect(run(T, setTyped("year", "number", "1981"))).toBe(T.replace("1980", "1981"));
    const d = "when: 2026-12-01\nok: true\n";
    expect(run(d, setTyped("when", "date", "2027-01-02"))).toBe("when: 2027-01-02\nok: true\n");
    expect(run(d, setCheckbox("ok", false))).toBe("when: 2026-12-01\nok: false\n");
  });

  it("a value with no type yet is what it reads as", () => {
    expect(run("r:\n", setUntyped("r", "4"))).toBe("r: 4\n");
    expect(run("r:\n", setUntyped("r", "calm"))).toBe("r: calm\n");
    expect(run("r:\n", setUntyped("r", "no"))).toBe('r: "no"\n');
  });

  it("a block list keeps its prefix and its items' spelling; a flow list stays flow", () => {
    expect(run(T, setList("cast", ["Mark Hamill", "Harrison Ford", "Carrie Fisher"]))).toBe(
      T.replace('  - "Harrison Ford"\n', '  - "Harrison Ford"\n  - Carrie Fisher\n'),
    );
    expect(run(T, setList("cast", ["Harrison Ford"]))).toBe(T.replace("  - Mark Hamill\n", ""));
    expect(run(T, setList("tags", ["a", "b, c", "d"]))).toBe(
      T.replace('tags: [a, "b, c"]', 'tags: [a, "b, c", d]'),
    );
    expect(run(T, setList("cast", []))).toBe(
      T.replace('cast:\n  - Mark Hamill\n  - "Harrison Ford"\n', "cast: []\n"),
    );
  });

  it("remove takes the property's lines and nothing else, comments above the next key staying", () => {
    expect(run(T, removeProperty("cast"))).toBe(
      T.replace('cast:\n  - Mark Hamill\n  - "Harrison Ford"\n', ""),
    );
    expect(run(T, removeProperty("title"))).toBe(T.replace("title: Empire # the sequel\n", ""));
    expect(run("a: 1\n# keep\nb: 2\n", removeProperty("a"))).toBe("# keep\nb: 2\n");
    // The block's text holds no final newline: removing its last line leaves none either.
    expect(run("# keep\nb: 2", removeProperty("b"))).toBe("# keep");
    expect(run("a: 1\nb: 2", removeProperty("b"))).toBe("a: 1");
  });

  it("rename changes the name only, and refuses one already used or not plain", () => {
    expect(run(T, renameProperty("year", "released"))).toBe(
      T.replace("year: 1980", "released: 1980"),
    );
    expect(run(T, renameProperty("year", "Title"))).toBeNull();
    expect(nameProblem(T, "year", "title")).toMatch(/already called/);
    expect(nameProblem(T, "year", "a: b")).toMatch(/Use letters/);
    expect(nameProblem(T, "year", " ")).toMatch(/needs a name/);
  });

  it("nothing is written for a property that is gone, read-only, or YAML that doesn't read", () => {
    expect(run(T, setText("missing", "x"))).toBeNull();
    expect(run("src:\n  a: 1\n", setText("src", "x"))).toBeNull();
    expect(run("tags: [a", setText("tags", "x"))).toBeNull();
  });

  it("a change whose result wouldn't read back as intended is refused, not written", () => {
    const bad: Change = {
      key: "year",
      apply: (t) => t.replace("year: 1980", "year: [1980"),
      expect: () => true,
    };
    expect(run(T, bad)).toBe(false);
    const spill: Change = {
      key: "year",
      apply: (t) => t.replace("end: x", "end: y"),
      expect: () => true,
    };
    expect(run(T, spill)).toBe(false);
  });
});

describe("one list item: only its own bytes change", () => {
  it("a block list: an edit, a removal and an addition touch one item's line", () => {
    const B = "cast:\n  - Mark Hamill\n  - Harrison Ford\nyear: 1980\n";
    expect(run(B, replaceItem("cast", 0, "Mark Hamill", "Mark Hamil"))).toBe(
      B.replace("Mark Hamill", "Mark Hamil"),
    );
    expect(run(B, removeItem("cast", 0, "Mark Hamill"))).toBe(B.replace("  - Mark Hamill\n", ""));
    expect(run(B, appendItem("cast", "Carrie Fisher"))).toBe(
      B.replace("Ford\n", "Ford\n  - Carrie Fisher\n"),
    );
  });

  it("an unindented list keeps its prefix, and an edited item keeps its quotes", () => {
    const B = "cast:\n- 'Mark Hamill'\n- \"Harrison Ford\"\nyear: 1980\n";
    expect(run(B, replaceItem("cast", 1, "Harrison Ford", "Carrie"))).toBe(
      B.replace('"Harrison Ford"', '"Carrie"'),
    );
    expect(run(B, appendItem("cast", "Carrie"))).toBe(B.replace('Ford"\n', 'Ford"\n- Carrie\n'));
  });

  it("a comma is text: bare in a block list, quoted inside a flow one", () => {
    expect(run("cast:\n  - a\n", appendItem("cast", "Fisher, Carrie"))).toBe(
      "cast:\n  - a\n  - Fisher, Carrie\n",
    );
    expect(run("aliases: [x]\n", appendItem("aliases", "Fisher, Carrie"))).toBe(
      'aliases: [x, "Fisher, Carrie"]\n',
    );
  });

  it("a flow list keeps its spacing and its line breaks", () => {
    const F = "tags: [ a ,  b ,c ]\n";
    expect(run(F, replaceItem("tags", 0, "a", "A"))).toBe("tags: [ A ,  b ,c ]\n");
    expect(run(F, removeItem("tags", 0, "a"))).toBe("tags: [ b ,c ]\n");
    expect(run(F, removeItem("tags", 2, "c"))).toBe("tags: [ a ,  b ]\n");
    expect(run(F, appendItem("tags", "d"))).toBe("tags: [ a ,  b ,c ,d ]\n");
    const M = "tags: [a,\n  b]\nx: 1\n";
    expect(run(M, replaceItem("tags", 0, "a", "A"))).toBe("tags: [A,\n  b]\nx: 1\n");
    expect(run(M, appendItem("tags", "c"))).toBe("tags: [a,\n  b,\n  c]\nx: 1\n");
    expect(
      run("aliases: [Episode V, 'Empire']\n", replaceItem("aliases", 1, "Empire", "Empire!")),
    ).toBe("aliases: [Episode V, 'Empire!']\n");
  });

  it("a blank line between items stays", () => {
    const G = "cast:\n  - a\n\n  - b\nnext: 1\n";
    expect(run(G, replaceItem("cast", 0, "a", "A"))).toBe("cast:\n  - A\n\n  - b\nnext: 1\n");
    expect(run(G, removeItem("cast", 1, "b"))).toBe("cast:\n  - a\n\nnext: 1\n");
  });

  it("a repeated item: the one at its place changes", () => {
    const D = "cast:\n  - a\n  - 'a'\n";
    expect(run(D, replaceItem("cast", 1, "a", "z"))).toBe("cast:\n  - a\n  - 'z'\n");
    expect(run(D, removeItem("cast", 0, "a"))).toBe("cast:\n  - 'a'\n");
  });

  it("the only item leaves an empty list; the last line keeps the text's own ending", () => {
    expect(run("cast:\n  - a\nx: 1\n", removeItem("cast", 0, "a"))).toBe("cast: []\nx: 1\n");
    expect(run("cast: [a]\n", removeItem("cast", 0, "a"))).toBe("cast: []\n");
    expect(run("cast:\n  - a\n  - b", removeItem("cast", 1, "b"))).toBe("cast:\n  - a");
    expect(run("cast: []\n", appendItem("cast", "a"))).toBe("cast: [a]\n");
    expect(run("cast:\n", appendItem("cast", "a"))).toBe("cast:\n  - a\n");
  });

  it("a list that changed since is left alone; a comment in it makes it YAML's", () => {
    const B = "cast:\n  - a\n  - b\n";
    expect(run(B, replaceItem("cast", 1, "x", "y"))).toBeNull();
    expect(run(B, removeItem("cast", 5, "b"))).toBeNull();
    expect(run("cast:\n  - a\n  # note\n  - b\n", appendItem("cast", "c"))).toBeNull();
    expect(run("cast:\n  - a # who\n  - b\n", replaceItem("cast", 0, "a", "A"))).toBeNull();
  });
});

describe("one list item, for any list and any edit: every other byte stays", () => {
  const item = fc.oneof(
    fc.stringMatching(/^[A-Za-z][A-Za-z ,:#'"-]{0,8}[A-Za-z]$/),
    fc.constantFrom("a", "05", "yes", "x, y"),
  );
  const space = fc.constantFrom("", " ", "  ");
  // A block list (`- ` lines, maybe a blank line between) or a flow one (any spacing, maybe wrapped).
  const list = fc.oneof(
    fc
      .tuple(
        fc.array(item, { minLength: 1, maxLength: 4 }),
        fc.constantFrom("  - ", "- "),
        fc.boolean(),
      )
      .map(([xs, prefix, gap]) =>
        xs.map((x) => `\n${prefix}${JSON.stringify(x)}`).join(gap ? "\n" : ""),
      ),
    fc
      .tuple(
        fc.array(item, { minLength: 1, maxLength: 4 }),
        space,
        space,
        fc.constantFrom(",", ",\n  "),
      )
      .map(
        ([xs, a, b, sep]) => ` [${a}${xs.map((x) => JSON.stringify(x)).join(`${sep}${b}`)}${a}]`,
      ),
  );
  const text = list.map((v) => `before: 1\nlist:${v}\nafter: 2\n`);
  const clean = (v: string) =>
    v.replace(/[\n\r\t\u0000-\u001f\u007f-\u00a0\u2028\u2029\ufeff]/g, "").trim();

  it("an edit, removal or addition reads back, and the other items keep their spelling", () => {
    fc.assert(
      fc.property(text, fc.nat(), fc.string({ maxLength: 10 }), fc.nat(2), (t, pick, raw, op) => {
        const p = prop(t, "list");
        const items = p.shown as string[];
        const ranges = p.list?.items ?? [];
        const i = pick % items.length;
        const v = clean(raw);
        fc.pre(v !== "");
        const change =
          op === 0
            ? replaceItem("list", i, items[i], v)
            : op === 1
              ? removeItem("list", i, items[i])
              : appendItem("list", v);
        const out = run(t, change);
        expect(out).not.toBe(false);
        if (out === null) return;
        const want =
          op === 0
            ? items.map((s, j) => (j === i ? v : s))
            : op === 1
              ? items.filter((_, j) => j !== i)
              : [...items, v];
        expect(prop(out, "list").shown).toEqual(want);
        expect(out.startsWith("before: 1\nlist:")).toBe(true);
        expect(out.endsWith("\nafter: 2\n")).toBe(true);
        // Every untouched item's source, in order, is still in the text.
        const kept = ranges.filter((_, j) => op === 2 || j !== i).map((r) => t.slice(r.from, r.to));
        let at = 0;
        for (const src of kept) {
          const found = out.indexOf(src, at);
          expect(found).toBeGreaterThanOrEqual(0);
          at = found + src.length;
        }
      }),
      { numRuns: 400 },
    );
  });
});

describe("conversion: what a type change keeps, and what it would lose", () => {
  const T =
    'episode: "05"\nyear: 1980\ntitle: Empire\nwhen: 2026-12-01T20:30\nday: 2026-12-01\ncast: [a, b, c]\none: [7]\nok: true\nr:\n';
  const conv = (key: string, to: Parameters<typeof conversion>[1]) => {
    const c = conversion(prop(T, key), to);
    return { loss: c.loss, text: run(T, c.change) };
  };

  it("lossless changes say nothing and apply as they are", () => {
    expect(conv("year", "text")).toEqual({
      loss: null,
      text: T.replace("year: 1980", 'year: "1980"'),
    });
    expect(conv("cast", "text")).toEqual({
      loss: null,
      text: T.replace("cast: [a, b, c]", "cast: a, b, c"),
    });
    expect(conv("title", "list")).toEqual({
      loss: null,
      text: T.replace("title: Empire", "title:\n  - Empire"),
    });
    expect(conv("day", "datetime").text).toBe(
      T.replace("day: 2026-12-01", "day: 2026-12-01T00:00"),
    );
    expect(conv("one", "number").text).toBe(T.replace("one: [7]", "one: 7"));
    expect(conv("r", "checkbox").text).toBe(T.replace("r:\n", "r: false\n"));
    expect(conv("r", "list").text).toBe(T.replace("r:\n", "r: []\n"));
  });

  it("lossy changes say what they lose", () => {
    expect(conv("episode", "number")).toEqual({
      loss: "“05” will become 5.",
      text: T.replace('episode: "05"', "episode: 5"),
    });
    expect(conv("title", "number").loss).toBe("“Empire” isn't a number, so it will be cleared.");
    expect(conv("title", "number").text).toBe(T.replace("title: Empire", "title:"));
    expect(conv("cast", "number").loss).toBe(
      "The 3 items aren't a number, so they will be cleared.",
    );
    expect(conv("title", "checkbox").loss).toMatch(
      /isn't true or false, so it will be cleared and the box left unticked/,
    );
    expect(conv("when", "date")).toEqual({
      loss: "The time 20:30 will be dropped.",
      text: T.replace("2026-12-01T20:30", "2026-12-01"),
    });
    expect(conv("ok", "date").loss).toBe("“true” isn't a date, so it will be cleared.");
  });

  it("a list whose items hold commas asks before joining", () => {
    const t = 'tags: ["a, b", c]\n';
    expect(conversion(prop(t, "tags"), "text").loss).toMatch(/can't be split back/);
  });
});

describe("yamlText", () => {
  it("is bare only when bare reads back as the same text", () => {
    expect(yamlText("hello world")).toBe("hello world");
    expect(yamlText(" pad")).toBe('" pad"');
    expect(yamlText("Off")).toBe('"Off"');
    expect(yamlText("2026-12-01")).toBe('"2026-12-01"');
    expect(yamlText("a, b", undefined, true)).toBe('"a, b"');
    expect(yamlText('say "hi"')).toBe('say "hi"');
  });
});

describe("runChange, for any frontmatter and any change: only the property's own lines", () => {
  const key = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}$/);
  const scalar = fc.oneof(
    fc.stringMatching(/^[A-Za-z][A-Za-z ,:#'"-]{0,10}$/),
    fc.integer({ min: 0, max: 3000 }).map(String),
    fc.constantFrom("true", "false", "2026-12-01", "05", "yes", "~", ""),
  );
  const line = fc.tuple(
    key,
    fc.oneof(
      scalar.map((s) => ` ${s}`),
      fc
        .array(scalar, { maxLength: 3 })
        .map((xs) => xs.map((x) => `\n  - ${JSON.stringify(x)}`).join("")),
    ),
  );
  const doc = fc
    .uniqueArray(line, { selector: ([k]) => k, minLength: 1, maxLength: 5 })
    .map((ls) => ls.map(([k, v]) => `${k}:${v}`).join("\n") + "\n");

  it("never changes a byte outside the touched property, and the value reads back", () => {
    fc.assert(
      fc.property(doc, fc.nat(), fc.string({ maxLength: 12 }), (text, pick, value) => {
        const r = readProperties(text);
        fc.pre(r.ok && r.props.length > 0);
        if (!r.ok) return;
        const p = r.props[pick % r.props.length];
        fc.pre(p.editable);
        const v = value.replace(/[\n\r\t\u0000-\u001f\u007f-\u00a0\u2028\u2029\ufeff]/g, "").trim();
        const out = runChange(text, setText(p.key, v));
        if (out === null || out === false) return;
        expect(out.startsWith(text.slice(0, p.start))).toBe(true);
        expect(out.endsWith(text.slice(p.end))).toBe(true);
        const back = prop(out, p.key);
        expect(back.shown).toBe(v === "" ? null : v);
      }),
      { numRuns: 300 },
    );
  });
});

describe("addProperty: a new property, last, in its type's empty form", () => {
  it("adds after everything else, which stays byte for byte", async () => {
    const { addProperty } = await import("../../src/utils/properties");
    expect(runChange("title: A # c", addProperty("rating", "number"))).toBe(
      "title: A # c\nrating:",
    );
    expect(runChange("title: A\n", addProperty("seen", "checkbox"))).toBe("title: A\nseen: false");
    expect(runChange("# only a comment", addProperty("cast", "list"))).toBe(
      "# only a comment\ncast: []",
    );
    expect(runChange("", addProperty("tags", "list"))).toBe("tags: []");
  });

  it("refuses a name the note already has, or one that isn't plain", async () => {
    const { addProperty } = await import("../../src/utils/properties");
    expect(runChange("Title: A", addProperty("title", "text"))).toBeNull();
    expect(runChange("a: 1", addProperty("b: c", "text"))).toBeNull();
  });
});

describe("anchors and aliases", () => {
  it("YAML whose alias has lost its anchor doesn't read as rows", () => {
    expect(readProperties("copy: *gone").ok).toBe(false);
  });

  it("removing the property that holds an anchor another one uses is refused, not written", () => {
    const text = "source: &value one\ncopy: *value\nend: x";
    expect(runChange(text, removeProperty("source"))).toBe(false);
    expect(runChange(text, removeProperty("end"))).toBe("source: &value one\ncopy: *value");
    expect(runChange(text, removeProperty("copy"))).toBe("source: &value one\nend: x");
  });
});
