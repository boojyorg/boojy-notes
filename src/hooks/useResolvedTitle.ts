import { type RefObject, useCallback } from "react";
import type { Note, NoteData } from "../types/notes";
import { getCaretOffset, placeCaret, titleFieldText } from "../utils/domHelpers";

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
 * out (the newer title is in flight, and its own write will resolve again),
 * and a blank title left under the caret keeps its placeholder rather than
 * filling in `Untitled` in front of whatever is typed next; it resolves on
 * the next write, or at the latest when the note is next opened.
 *
 * While the caret is in the field, whitespace the filename trimmed from the
 * end stays in the field: `Meeting ` written as `Meeting.md` used to be
 * painted back as `Meeting` with the caret clamped onto the end, and `notes`
 * typed next made `Meetingnotes`. The name is adopted; only the characters
 * the filesystem changed are painted, at their own offsets, so what is typed
 * next lands where it would have. Leading whitespace goes with the paint (the
 * caret shifts with it, nothing after it moves), and the field catches up
 * with the name in full the next time it is painted from state.
 */
export function useResolvedTitle({
  titleRef,
  activeNoteRef,
  noteDataRef,
  adoptNoteData,
}: ResolvedTitleDeps) {
  return useCallback(
    (noteId: string, written: Note, finalTitle: string) => {
      const latest = noteDataRef.current?.[noteId];
      if (!latest || latest._draft || latest.title !== written.title) return;

      const el = noteId === activeNoteRef.current ? titleRef.current : null;
      const focused = !!el && document.activeElement === el;
      if (focused) {
        if (titleFieldText(el) !== written.title) return;
        if (written.title.trim() === "") return;
      }

      adoptNoteData((prev) => {
        const note = prev[noteId];
        if (!note || note._draft || note.title !== written.title) return prev;
        return {
          ...prev,
          [noteId]: { ...note, title: finalTitle, content: { ...note.content, title: finalTitle } },
        };
      });

      if (!el) return;
      if (!focused) {
        el.textContent = finalTitle;
        return;
      }
      const leading = written.title.length - written.title.trimStart().length;
      const painted = finalTitle + written.title.slice(written.title.trimEnd().length);
      if (painted === titleFieldText(el)) return;
      const offset = getCaretOffset(el);
      el.textContent = painted;
      placeCaret(
        el,
        offset < 0 ? painted.length : Math.max(0, Math.min(offset - leading, painted.length)),
      );
    },
    [titleRef, activeNoteRef, noteDataRef, adoptNoteData],
  );
}
