import { type MutableRefObject, type RefObject, useCallback, useRef } from "react";
import type { NoteData } from "../types/notes";
import { linksFollow } from "../utils/linkRewrite";
import { getAPI } from "../services/apiProvider";

type MarkResult = { ok: true } | { ok: false; reason: "off" | "unknown" | "failed" };
interface HistoryAPI {
  mark: (noteId: string, reason: string) => Promise<MarkResult>;
}
const historyAPI = (): HistoryAPI | undefined =>
  (getAPI() as { history?: HistoryAPI } | null)?.history;

/** What a version kept before a link update is called in the note's history. */
export const LINKS_FOLLOW_REASON = "Before link update";

interface Place {
  title: string;
  folder: string | null;
}
type NoteDataUpdater = (prev: NoteData) => NoteData;

interface LinksFollowDeps {
  noteDataRef: MutableRefObject<NoteData>;
  adoptNoteData: (updater: NoteDataUpdater) => void;
  /** Notes whose keystrokes have not reached a write yet (useHistory). */
  unflushedNotes: MutableRefObject<Set<string>>;
  activeNoteRef: MutableRefObject<string | null>;
  /** The open note's name field: a name still under the caret has not settled. */
  titleRef: RefObject<HTMLElement | null>;
  syncGeneration: MutableRefObject<number>;
  showToast?: (message: string, kind?: string) => void;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** What the toast says once the links have followed. */
export function linksFollowedMessage(links: number, notes: number, skipped: number): string {
  const unread =
    skipped > 0
      ? `${plural(skipped, "note")} kept online or not readable ${skipped === 1 ? "was" : "were"} not checked`
      : "";
  if (links === 0) return unread ? `Links: ${unread}.` : "";
  const updated = `Updated ${plural(links, "link")} in ${plural(notes, "note")}`;
  return unread ? `${updated}; ${unread}.` : `${updated}.`;
}

/** The notes as they were before the renames in `from`, text as it is now. */
function before(now: NoteData, from: Map<string, Place>): NoteData {
  const was = { ...now };
  for (const [id, place] of from) {
    if (now[id]) was[id] = { ...now[id], title: place.title, folder: place.folder };
  }
  return was;
}

/**
 * Links follow a rename or a move made in the app (utils/linkRewrite).
 *
 * The write that renames a note's file says where the file was
 * (`renamedFrom`, write-note), so only a change the app itself wrote is ever
 * followed: a rename in Finder, by a sync client or while the app was closed
 * arrives as an outside change and names no origin here.
 *
 * A name is followed once, when it has **settled**: the file holds the name
 * the note has, nothing of the note is waiting to be written, and the caret
 * has left the name field. A name typed with pauses renames the file at each
 * pause; the links move once, from the first name to the last.
 *
 * The rewritten notes are a change of record (`adoptNoteData`): written by
 * the ordinary flush, which refuses a file that changed outside, and not an
 * undo entry, since Cmd+Z in one note must not rewrite others. Each keeps the
 * text its file held first, as a version (`history-mark`); one whose version
 * could not be kept is left as it is.
 */
export function useLinksFollow({
  noteDataRef,
  adoptNoteData,
  unflushedNotes,
  activeNoteRef,
  titleRef,
  syncGeneration,
  showToast,
}: LinksFollowDeps) {
  /** Where each renamed note was before its first rename not yet followed. */
  const origins = useRef(new Map<string, Place>());
  /** The name and folder each of those notes was last written under. */
  const written = useRef(new Map<string, Place>());
  const following = useRef(false);

  const onNoteRenamed = useCallback((id: string, from: Place, to: Place) => {
    if (!origins.current.has(id)) origins.current.set(id, from);
    written.current.set(id, to);
  }, []);

  const settled = useCallback(
    (id: string, final: boolean) => {
      const note = noteDataRef.current[id];
      const to = written.current.get(id);
      if (!note || !to) return false;
      if (unflushedNotes.current.has(id)) return false;
      if ((note.title ?? "") !== to.title || (note.folder ?? null) !== to.folder) return false;
      // The app is closing: the name under the caret is the name it has.
      if (final) return true;
      const field = titleRef.current;
      return !(id === activeNoteRef.current && field && document.activeElement === field);
    },
    [noteDataRef, unflushedNotes, activeNoteRef, titleRef],
  );

  /**
   * Follow every rename that has settled. `final` (the app is closing) takes
   * a name still under the caret as settled. Resolves whether any note was
   * rewritten, so the caller knows there is something more to write.
   */
  const settle = useCallback(
    async ({ final = false } = {}): Promise<boolean> => {
      if (following.current) return false;
      // No history to keep a version in (the phone, the web build): nothing is
      // followed, and nothing is said.
      if (!historyAPI()) {
        origins.current.clear();
        written.current.clear();
        return false;
      }
      const from = new Map<string, Place>();
      for (const [id, place] of origins.current) {
        if (!noteDataRef.current[id]) {
          origins.current.delete(id);
          written.current.delete(id);
        } else if (settled(id, final)) from.set(id, place);
      }
      if (from.size === 0) return false;
      for (const id of from.keys()) {
        origins.current.delete(id);
        written.current.delete(id);
      }

      following.current = true;
      try {
        const found = linksFollow(before(noteDataRef.current, from), noteDataRef.current);
        const ids = Object.keys(found.notes);
        // A version of each first: the text its file holds now. History turned
        // off for a note is the user's choice; any other refusal leaves the note.
        const api = historyAPI();
        const kept = new Set<string>();
        await Promise.all(
          ids.map(async (id) => {
            const result = await api
              ?.mark(id, LINKS_FOLLOW_REASON)
              .catch((): MarkResult => ({ ok: false, reason: "failed" }));
            if (result && (result.ok || result.reason === "off")) kept.add(id);
          }),
        );
        // Read again now the versions are kept: a keystroke may have landed.
        const now = noteDataRef.current;
        const again = linksFollow(before(now, from), now);
        const changed = Object.keys(again.notes).filter((id) => kept.has(id));
        let links = 0;
        if (changed.length > 0) {
          for (const id of changed) links += again.perNote[id];
          // The open note's blocks are painted from state only on a signal.
          if (changed.includes(activeNoteRef.current ?? "")) syncGeneration.current++;
          adoptNoteData((prev) => {
            const next = { ...prev };
            for (const id of changed) {
              // Only over the text the links were read in.
              if (prev[id]?.content?.blocks === now[id]?.content?.blocks)
                next[id] = again.notes[id];
            }
            return next;
          });
        }
        const message = linksFollowedMessage(links, changed.length, again.skipped);
        if (message) showToast?.(message, links > 0 ? "done" : "notice");
        return changed.length > 0;
      } finally {
        following.current = false;
      }
    },
    [noteDataRef, adoptNoteData, activeNoteRef, syncGeneration, showToast, settled],
  );

  return { onNoteRenamed, settle };
}
