import { type RefObject, useCallback, useRef } from "react";
import type { Note, NoteData } from "../types/notes";

type NoteDataUpdater = (prev: NoteData) => NoteData;

interface ResolvedTitleDeps {
  /** The editor's contentEditable title field. */
  titleRef: RefObject<HTMLElement | null>;
  activeNoteRef: RefObject<string | null>;
  /** Latest note data, pending text included (useHistory's ref). */
  noteDataRef: RefObject<NoteData>;
  /** Publishes a change of record without a history entry. */
  adoptNoteData: (updater: NoteDataUpdater) => void;
}

interface HeldAnswer {
  noteId: string;
  written: Note;
  finalTitle: string;
}

/**
 * The renderer's half of "a persisted note's title is its filename".
 *
 * Persistence answers every write with the basename the file actually got.
 * When that differs from the title written, this adopts it: in state, so the
 * sidebar, the window title and the next write all use the real name; and in
 * the title field, so the user sees it now and not after a restart. The
 * renderer never guesses at filename rules; it takes the answer.
 *
 * Nothing is adopted when the user has renamed the note since the write went
 * out (the newer title is in flight, and its own write will resolve again).
 *
 * The field is the user's while the caret is in it (2026-09-17). A write
 * goes out under a name that is still being typed, and its answer can name a
 * note the user has not finished naming: `Tyr` on the way to `Tyres` collides
 * with `Tyr.md` and came back as `Tyr-2`, painted under the caret before
 * Enter. So while the field is focused every differing answer is held, not
 * adopted, and `settleTitle`, called when the field loses focus, adopts the
 * last one if the name is still what was written: the name settles on Enter
 * or a click away, on the beat the pill does. A blank name becomes `Untitled`
 * the same way, and a sanitised character (`/` to `_`) or trimmed whitespace
 * shows once the caret has left rather than being painted in place; the
 * offset-preserving paint that did that (review 2026-09-07, §2.7) is gone
 * with the reason for it. A write landing after the caret has left is
 * adopted at once.
 */
export function useResolvedTitle({
  titleRef,
  activeNoteRef,
  noteDataRef,
  adoptNoteData,
}: ResolvedTitleDeps) {
  /** The answer a focused field refused, for `settleTitle`. */
  const held = useRef<HeldAnswer | null>(null);
  const onTitleResolved = useCallback(
    (noteId: string, written: Note, finalTitle: string) => {
      const latest = noteDataRef.current?.[noteId];
      if (!latest || latest._draft || latest.title !== written.title) return;

      const el = noteId === activeNoteRef.current ? titleRef.current : null;
      if (el && document.activeElement === el) {
        held.current = { noteId, written, finalTitle };
        return;
      }

      adoptNoteData((prev) => {
        const note = prev[noteId];
        if (!note || note._draft || note.title !== written.title) return prev;
        return {
          ...prev,
          [noteId]: { ...note, title: finalTitle, content: { ...note.content, title: finalTitle } },
        };
      });
      if (el) el.textContent = finalTitle;
    },
    [titleRef, activeNoteRef, noteDataRef, adoptNoteData],
  );
  // The guards inside re-check the note: a name typed since the answer was
  // held wins (its own write answers again), and a note that is no longer
  // open is adopted in state alone.
  const settleTitle = useCallback(() => {
    const h = held.current;
    held.current = null;
    if (h) onTitleResolved(h.noteId, h.written, h.finalTitle);
  }, [onTitleResolved]);
  return { onTitleResolved, settleTitle };
}
