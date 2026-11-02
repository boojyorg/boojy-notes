import { afterEach, describe, expect, it } from "vitest";
import {
  namesInOtherNotes,
  PROPERTY_TYPES_KEY,
  readPropertyTypes,
  rememberPropertyType,
} from "../../src/utils/propertyTypes";
import type { NoteData } from "../../src/types/notes";

afterEach(() => localStorage.clear());

describe("the types this device remembers", () => {
  it("keeps a chosen type by name, in this window's storage, and reads only types", () => {
    expect(readPropertyTypes()).toEqual({});
    rememberPropertyType("rating", "number");
    expect(rememberPropertyType("watched", "date")).toEqual({ rating: "number", watched: "date" });
    localStorage.setItem(PROPERTY_TYPES_KEY, JSON.stringify({ a: "number", b: "nonsense", c: 4 }));
    expect(readPropertyTypes()).toEqual({ a: "number" });
    localStorage.setItem(PROPERTY_TYPES_KEY, "{broken");
    expect(readPropertyTypes()).toEqual({});
  });
});

describe("namesInOtherNotes", () => {
  const note = (text: string) =>
    ({
      title: "x",
      folder: null,
      content: { title: "x", blocks: [{ id: "f", type: "frontmatter", text }] },
    }) as never;
  const data: NoteData = {
    a: note("rating: 4\nstatus: done\ntags: [x]"),
    b: note("status: draft\ndirector: Kershner"),
    c: note("broken: [x"),
    me: note("mine: 1"),
  };

  it("lists other notes' names, most used first, then A–Z; never tags, aliases or cssclasses", () => {
    expect(namesInOtherNotes(data, "me").map((n) => n.name)).toEqual([
      "status",
      "director",
      "rating",
    ]);
  });

  it("gives each name the type most notes write it as, and how many notes use it", () => {
    const more: NoteData = {
      ...data,
      d: note("rating: good\nwhen: 2026-01-02\ncast: [a]"),
      e: note("rating: 5\nwhen:\ncast:\n  - b"),
    };
    const byName = Object.fromEntries(namesInOtherNotes(more, "me").map((n) => [n.name, n]));
    expect(byName.rating).toEqual({ name: "rating", type: "number", count: 3 });
    expect(byName.when).toEqual({ name: "when", type: "date", count: 2 });
    expect(byName.cast).toEqual({ name: "cast", type: "list", count: 2 });
    expect(namesInOtherNotes({ x: note("empty:") }, "me")).toEqual([
      { name: "empty", type: null, count: 1 },
    ]);
  });
});
