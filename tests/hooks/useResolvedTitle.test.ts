/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResolvedTitle } from "../../src/hooks/useResolvedTitle";
import type { Note, NoteData } from "../../src/types/notes";

const note = (title: string, extra: Partial<Note> = {}): Note =>
  ({ id: "n1", title, folder: null, content: { title, blocks: [] }, ...extra }) as Note;

function setup(
  current: Note,
  { active = "n1", other = "n2" }: { active?: string; other?: string } = {},
) {
  const el = document.createElement("div");
  el.contentEditable = "true";
  el.tabIndex = 0; // jsdom does not treat contentEditable alone as focusable
  el.textContent = current.title;
  document.body.appendChild(el);
  const data: NoteData = { n1: current, [other]: note("Other") };
  const noteDataRef = { current: data };
  const adoptNoteData = vi.fn((updater: (prev: NoteData) => NoteData) => {
    noteDataRef.current = updater(noteDataRef.current);
  });
  const { result } = renderHook(() =>
    useResolvedTitle({
      titleRef: { current: el },
      activeNoteRef: { current: active },
      noteDataRef,
      adoptNoteData,
    }),
  );
  return { resolve: result.current, el, adoptNoteData, noteDataRef };
}

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useResolvedTitle", () => {
  it("adopts the filename into state and the title field of the open note", () => {
    const written = note("Notes: a/b?");
    const { resolve, el, noteDataRef } = setup(written);

    resolve("n1", written, "Notes_ a_b_");

    expect(noteDataRef.current.n1.title).toBe("Notes_ a_b_");
    expect(noteDataRef.current.n1.content.title).toBe("Notes_ a_b_");
    expect(el.textContent).toBe("Notes_ a_b_");
    // The other note is untouched.
    expect(noteDataRef.current.n2.title).toBe("Other");
  });

  it("adopts into state only when the resolved note is not the open one", () => {
    const written = note("Meeting notes");
    const { resolve, el, noteDataRef } = setup(written, { active: "n2" });
    el.textContent = "Other";

    resolve("n1", written, "Meeting notes-2");

    expect(noteDataRef.current.n1.title).toBe("Meeting notes-2");
    expect(el.textContent).toBe("Other");
  });

  it("leaves a note the user has renamed since the write alone", () => {
    const written = note("Meeting notes");
    const { resolve, adoptNoteData, noteDataRef } = setup(note("Meeting notes, renamed"));

    resolve("n1", written, "Meeting notes-2");

    expect(adoptNoteData).not.toHaveBeenCalled();
    expect(noteDataRef.current.n1.title).toBe("Meeting notes, renamed");
  });

  it("never touches a draft", () => {
    const written = note("Draft");
    const { resolve, adoptNoteData } = setup(note("Draft", { _draft: true } as Partial<Note>));

    resolve("n1", written, "Draft-2");

    expect(adoptNoteData).not.toHaveBeenCalled();
  });

  it("keeps the caret where it was when the title field is focused", () => {
    const written = note("Notes: ab");
    const { resolve, el, noteDataRef } = setup(written);
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStart(el.firstChild as Text, 7); // after "Notes: "
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);

    resolve("n1", written, "Notes_ ab");

    expect(noteDataRef.current.n1.title).toBe("Notes_ ab");
    expect(el.textContent).toBe("Notes_ ab");
    expect(document.activeElement).toBe(el);
    expect(window.getSelection()?.anchorOffset).toBe(7);
  });

  it("does not repaint a focused field the user has typed into since the write", () => {
    const written = note("Notes: a");
    const { resolve, el, adoptNoteData } = setup(written);
    el.focus();
    el.textContent = "Notes: ab"; // typed, commit still pending

    resolve("n1", written, "Notes_ a");

    expect(adoptNoteData).not.toHaveBeenCalled();
    expect(el.textContent).toBe("Notes: ab");
  });

  it("does not fill Untitled into a blank field the user is still in", () => {
    const written = note("");
    const { resolve, el, adoptNoteData } = setup(written);
    el.focus();

    resolve("n1", written, "Untitled");

    expect(adoptNoteData).not.toHaveBeenCalled();
    expect(el.textContent).toBe("");
  });

  it("does adopt Untitled for a blank title once the field is left", () => {
    const written = note("");
    const { resolve, el, noteDataRef } = setup(written);

    resolve("n1", written, "Untitled");

    expect(noteDataRef.current.n1.title).toBe("Untitled");
    expect(el.textContent).toBe("Untitled");
  });
});
