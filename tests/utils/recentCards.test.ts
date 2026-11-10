import { describe, expect, it } from "vitest";
import type { Note, NoteData } from "../../src/types/notes";
import { cardPreview, cardTime, recentlyEdited } from "../../src/utils/recentCards";

const note = (id: string, lastModified: number, over: Partial<Note> = {}): Note =>
  ({
    id,
    title: id,
    folder: null,
    lastModified,
    content: { title: id, blocks: [] },
    ...over,
  }) as Note;
const data = (...notes: Note[]): NoteData => Object.fromEntries(notes.map((n) => [n.id, n]));

describe("the notes edited most recently", () => {
  it("are the four newest, by the later of the file's time and an edit in the app", () => {
    const notes = data(
      note("a", 100),
      note("b", 500),
      note("c", 300),
      note("d", 200),
      note("e", 50),
    );
    expect(recentlyEdited(notes, {})).toEqual(["b", "c", "d", "a"]);
    // Edited in the app just now: ahead of its file's time.
    expect(recentlyEdited(notes, { e: 900 })).toEqual(["e", "b", "c", "d"]);
  });

  // Opening is not editing: nothing but an edit moves a note here, as in Most recent.
  it("leaves out a draft, a note that cannot be read, one from outside and one with no time", () => {
    const notes = data(
      note("kept", 100),
      note("draft", 900, { _draft: true }),
      note("unreadable", 900, { unreadable: "encoding" }),
      note("outside", 900, { outside: "/tmp" }),
      note("offloaded", 900, { offloaded: true }),
      note("timeless", 0),
    );
    expect(recentlyEdited(notes, {})).toEqual(["kept"]);
  });

  it("are none with no notes", () => {
    expect(recentlyEdited({}, {})).toEqual([]);
  });
});

describe("a card's preview", () => {
  const blocks = (list: object[]) => ({ content: { blocks: list } }) as unknown as Note;

  it("is the note's first lines as plain words, formatting and empty blocks dropped", () => {
    expect(
      cardPreview(
        blocks([
          { id: "0", type: "frontmatter", text: "tags: [a]" },
          { id: "1", type: "h1", text: "**Lisbon** trip" },
          { id: "2", type: "p", text: "" },
          { id: "3", type: "checkbox", text: "book [flights](https://example.com)" },
          { id: "4", type: "image", src: "map.png" },
          { id: "5", type: "p", text: "two\nlines" },
        ]),
      ),
    ).toEqual(["Lisbon trip", "book flights", "two lines"]);
  });

  it("stops at four lines and cuts a long one", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      id: `${i}`,
      type: "p",
      text: `line ${i}`,
    }));
    expect(cardPreview(blocks(many))).toHaveLength(4);
    const [long] = cardPreview(blocks([{ id: "1", type: "p", text: "word ".repeat(40) }]));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("…")).toBe(true);
  });

  // A comment is kept out of sight in the note; Home must not be where it shows.
  it("never shows a comment, a footnote's marker, a formula's source or a cell's <br>", () => {
    expect(
      cardPreview(
        blocks([
          { id: "1", type: "p", text: "%% private %% Shopping %% unclosed" },
          { id: "2", type: "p", text: "Eggs[^1] and milk^[inline note]" },
          { id: "3", type: "p", text: "Area is $\\pi r^2$ here" },
          { id: "4", type: "table", rows: [["a<br>b", "c"]] },
          { id: "5", type: "p", text: "%% only a comment %%" },
        ]),
      ),
    ).toEqual(["Shopping", "Eggs and milk", "Area is here", "a b c"]);
  });

  it("passes over code and footnote definitions: source, not prose", () => {
    expect(
      cardPreview(
        blocks([
          { id: "1", type: "code", lang: "mermaid", text: "graph TD; A-->B" },
          { id: "2", type: "footnote", label: "1", text: "the small print" },
          { id: "3", type: "p", text: "The note itself" },
        ]),
      ),
    ).toEqual(["The note itself"]);
  });

  it("never cuts a long line through the middle of an emoji", () => {
    const [long] = cardPreview(blocks([{ id: "1", type: "p", text: `${"a".repeat(78)}😀😀😀` }]));
    expect(long).toBe(`${"a".repeat(78)}😀…`);
  });

  it("is empty for an empty or missing note", () => {
    expect(cardPreview(blocks([]))).toEqual([]);
    expect(cardPreview(undefined)).toEqual([]);
  });
});

describe("a card's time", () => {
  const now = new Date(2026, 10, 10, 19, 0).getTime();
  it("says when without the word Edited", () => {
    expect(cardTime(now - 10_000, now)).toBe("Just now");
    expect(cardTime(now - 12 * 60_000, now)).toBe("12 min ago");
    expect(cardTime(new Date(2026, 10, 10, 9, 5).getTime(), now, false, "en-GB")).toBe("09:05");
    expect(cardTime(new Date(2026, 10, 9, 21, 40).getTime(), now, false, "en-GB")).toBe(
      "Yesterday at 21:40",
    );
  });
});
