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
type ToastOptions = { key?: string };

interface LinksFollowDeps {
  noteDataRef: MutableRefObject<NoteData>;
  /** useHistory's: `forget` drops those notes' undo entries. */
  adoptNoteData: (updater: NoteDataUpdater, options?: { forget?: string[] }) => void;
  /** Notes whose keystrokes have not reached a write yet (useHistory). */
  unflushedNotes: MutableRefObject<Set<string>>;
  activeNoteRef: MutableRefObject<string | null>;
  /** The open note's name field: a name still under the caret has not settled. */
  titleRef: RefObject<HTMLElement | null>;
  syncGeneration: MutableRefObject<number>;
  showToast?: (message: string, kind?: string, options?: ToastOptions) => void;
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

/** One toast for the links, whatever it says: a newer one takes the older's place. */
const TOAST_KEY = "links-follow";

/**
 * Links follow a rename or a move made in the app (utils/linkRewrite).
 *
 * The write that renames a note's file says where the file was
 * (`renamedFrom`, write-note), so only a change the app itself wrote is ever
 * followed: a rename in Finder, by a sync client or while the app was closed
 * arrives as an outside change and names no origin here, and one that lands
 * on a note with a rename not yet followed takes that origin with it.
 *
 * A name is followed once, when it has **settled**: the file holds the name
 * the note has, nothing of the note is waiting to be written, and the caret
 * has left the name field. A name typed with pauses renames the file at each
 * pause; the links move once, from the last settled name to this one. A new
 * note has no settled name until its first one settles, so the half-typed
 * names its file passes through on the way are never a name links followed
 * from: a `[[Project]]` that names no note is not captured by a new note
 * typed as far as `Project` on its way to `Project Plan`.
 *
 * The rewritten notes are a change of record (`adoptNoteData`): written by
 * the ordinary flush, which refuses a file that changed outside, and not an
 * undo entry, since Cmd+Z in one note must not rewrite others. Their own undo
 * entries go: each is the note with its old links, and stepping back to one
 * would put those back. Each note keeps the text its file held first, as a
 * version (`history-mark`); one whose version could not be kept is left as
 * it is.
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
  /** The name and folder each note being watched was last written under. */
  const written = useRef(new Map<string, Place>());
  /** Notes first written since their name last settled: no name to follow from. */
  const newborn = useRef(new Set<string>());
  /** The settles asked for, one after another: none is dropped, none overlaps. */
  const queue = useRef<Promise<boolean>>(Promise.resolve(false));

  const forget = useCallback((id: string) => {
    origins.current.delete(id);
    written.current.delete(id);
    newborn.current.delete(id);
  }, []);

  /** A write of the app's: the note's first, or one that renamed or moved its file. */
  const onNoteWritten = useCallback(
    (id: string, to: Place, { from, created }: { from?: Place; created?: boolean }) => {
      if (created) newborn.current.add(id);
      if (!created && !from) return;
      if (from && !newborn.current.has(id) && !origins.current.has(id)) {
        origins.current.set(id, from);
      }
      written.current.set(id, to);
    },
    [],
  );

  /** The folder's notes moved with it, by one rename of the directory. */
  const onNoteRenamed = useCallback(
    (id: string, from: Place, to: Place) => onNoteWritten(id, to, { from }),
    [onNoteWritten],
  );

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

  const follow = useCallback(
    async (final: boolean): Promise<boolean> => {
      // No history to keep a version in (the phone, the web build): nothing is
      // followed, and nothing is said.
      if (!historyAPI()) {
        origins.current.clear();
        written.current.clear();
        newborn.current.clear();
        return false;
      }
      const from = new Map<string, Place>();
      for (const id of new Set([...origins.current.keys(), ...newborn.current])) {
        if (!noteDataRef.current[id]) forget(id);
        else if (settled(id, final)) {
          const place = origins.current.get(id);
          if (place) from.set(id, place);
          // A new note's first name has settled: it has one to follow from now.
          forget(id);
        }
      }
      if (from.size === 0) return false;

      const basis = noteDataRef.current;
      const found = linksFollow(before(basis, from), basis);
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
      // Read again only if a keystroke landed while the versions were kept.
      const now = noteDataRef.current;
      const again = now === basis ? found : linksFollow(before(now, from), now);
      const changed = Object.keys(again.notes).filter((id) => kept.has(id));
      let links = 0;
      if (changed.length > 0) {
        for (const id of changed) links += again.perNote[id];
        // The open note's blocks are painted from state only on a signal.
        if (changed.includes(activeNoteRef.current ?? "")) syncGeneration.current++;
        adoptNoteData(
          (prev) => {
            const next = { ...prev };
            for (const id of changed) {
              // Only over the text the links were read in.
              if (prev[id]?.content?.blocks === now[id]?.content?.blocks) {
                next[id] = again.notes[id];
              }
            }
            return next;
          },
          { forget: changed },
        );
      }
      const message = linksFollowedMessage(links, changed.length, again.skipped);
      // It fades: a rename with nothing to say about it should not need closing.
      if (message) showToast?.(message, "done", { key: TOAST_KEY });
      return changed.length > 0;
    },
    [noteDataRef, adoptNoteData, activeNoteRef, syncGeneration, showToast, settled, forget],
  );

  /**
   * Follow every rename that has settled. `final` (the app is closing) takes
   * a name still under the caret as settled. Resolves whether a note was
   * rewritten by this settle or by one still running when it was asked for,
   * so a caller about to close knows there is something more to write.
   */
  const settle = useCallback(
    ({ final = false } = {}): Promise<boolean> => {
      const earlier = queue.current;
      // After the one before it, whatever became of that.
      const own = earlier.then(
        () => follow(final),
        () => follow(final),
      );
      queue.current = own.catch((err) => {
        console.error("useLinksFollow: a link update failed", err);
        return false;
      });
      const mine = Promise.all([earlier.catch(() => false), queue.current]).then(
        ([before, now]) => before || now,
      );
      return mine;
    },
    [follow],
  );

  return { onNoteWritten, onNoteRenamed, onOutsideMove: forget, settle };
}
