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
  return {
    resolve: result.current.onTitleResolved,
    settle: result.current.settleTitle,
    el,
    adoptNoteData,
    noteDataRef,
  };
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

  // `Tyr` on the way to `Tyres` collides with an existing `Tyr.md`; the
  // suffix must not appear under the caret before Enter (2026-09-17).
  it("holds a collision suffix while the caret is in the field and adopts it once the caret leaves", () => {
    const written = note("Tyr");
    const { resolve, settle, el, adoptNoteData, noteDataRef } = setup(written);
    el.focus();

    resolve("n1", written, "Tyr-2");
    expect(adoptNoteData).not.toHaveBeenCalled();
    expect(el.textContent).toBe("Tyr");

    el.blur();
    settle();
    expect(noteDataRef.current.n1.title).toBe("Tyr-2");
    expect(noteDataRef.current.n1.content.title).toBe("Tyr-2");
    expect(el.textContent).toBe("Tyr-2");

    // Settled once; a second blur has nothing to adopt.
    settle();
    expect(adoptNoteData).toHaveBeenCalledTimes(1);
  });

  it("drops a held answer when the name was typed on before the caret left", () => {
    const written = note("Tyr");
    const { resolve, settle, el, adoptNoteData, noteDataRef } = setup(written);
    el.focus();
    resolve("n1", written, "Tyr-2");

    // `es` typed since: the newer name is in state and its own write will
    // answer again (with `Tyres`, which needs no adoption).
    noteDataRef.current = { ...noteDataRef.current, n1: note("Tyres") };
    el.textContent = "Tyres";
    el.blur();
    settle();

    expect(adoptNoteData).not.toHaveBeenCalled();
    expect(noteDataRef.current.n1.title).toBe("Tyres");
    expect(el.textContent).toBe("Tyres");
  });

  it("holds the newest answer only", () => {
    const { resolve, settle, el, noteDataRef } = setup(note("a/b "));
    el.focus();
    resolve("n1", note("a/b"), "a_b");
    noteDataRef.current = { ...noteDataRef.current, n1: note("a/b ") };
    resolve("n1", note("a/b "), "a_b");

    el.blur();
    settle();
    expect(noteDataRef.current.n1.title).toBe("a_b");
    expect(el.textContent).toBe("a_b");
  });

  it("holds the answer to a blank name and adopts Untitled once the caret leaves", () => {
    const written = note("");
    const { resolve, settle, el, adoptNoteData, noteDataRef } = setup(written);
    el.innerHTML = "<br>";
    el.focus();

    resolve("n1", written, "Untitled-2");
    expect(adoptNoteData).not.toHaveBeenCalled();
    expect(el.textContent).toBe("");

    el.blur();
    settle();
    expect(noteDataRef.current.n1.title).toBe("Untitled-2");
    expect(el.textContent).toBe("Untitled-2");
  });

  it("paints the whole name, whitespace trimmed, once the field is left", () => {
    const written = note("  Meeting ");
    const { resolve, el, noteDataRef } = setup(written);

    resolve("n1", written, "Meeting");

    expect(noteDataRef.current.n1.title).toBe("Meeting");
    expect(el.textContent).toBe("Meeting");
  });
});
