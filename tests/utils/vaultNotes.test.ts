/**
 * The location's notes: every note but one opened from outside every
 * location, the same object for the same store so a memo keyed on it holds.
 */
import { describe, expect, it } from "vitest";
import type { NoteData } from "../../src/types/notes";
import { vaultNotes } from "../../src/utils/vaultNotes";

const note = (title: string, outside?: string) => ({
  title,
  folder: null,
  content: { title, blocks: [] },
  ...(outside ? { outside } : {}),
});

describe("vaultNotes", () => {
  it("leaves out a note opened from outside, and keeps every other", () => {
    const data: NoteData = { a: note("A"), b: note("Loose", "/Users/t/Downloads"), c: note("C") };
    expect(Object.keys(vaultNotes(data))).toEqual(["a", "c"]);
  });

  it("is the store itself when nothing is from outside, and the same answer for the same store", () => {
    const plain: NoteData = { a: note("A") };
    expect(vaultNotes(plain)).toBe(plain);
    const mixed: NoteData = { a: note("A"), b: note("B", "/tmp") };
    expect(vaultNotes(mixed)).toBe(vaultNotes(mixed));
  });
});
