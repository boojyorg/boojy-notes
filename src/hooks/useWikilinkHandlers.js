import { useCallback, useMemo, useRef } from "react";
import {
  missingBlockMessage,
  missingHeadingMessage,
  noteLinkKeys,
  parseWikilinkTarget,
  unresolvedWikilinkMessage,
  wikilinkStatus,
} from "../utils/wikilinkTarget";
import { blockSubpath, findBlockTarget } from "../utils/blockTarget";
import { findHeadingSection, headingSegments } from "../utils/headingTarget";
import { editBlocks } from "../utils/editBlocks";
import { fileForTarget } from "../utils/fileView";
import { vaultLinkTargets } from "../utils/vaultLinkTarget";
import { baseName } from "../utils/vaultPath";
import { vaultNotes } from "../utils/vaultNotes";

/**
 * Wikilink wiring for the editor:
 *   - the note-title set used to detect broken `[[links]]`,
 *   - click / Cmd-click navigation, and autocomplete insertion.
 *
 * `noteTitlesKey` short-circuits on `textOnlyEdit` so plain typing doesn't
 * rebuild the title set every keystroke. `handleWikilinkSelect` lets the block
 * paint itself from the keystroke ref like every other programmatic change
 * (the editor rule, "One owner for note state").
 *
 * A click resolves the *note* a target names (`utils/wikilinkTarget`), so
 * `[[Beta#Intro]]` and `[[Work/Gamma]]` open Beta and the Gamma in Work (an
 * explicit path is the path, never a namesake elsewhere). **A heading is
 * followed** as Obsidian finds it (`utils/headingTarget`): its section shown
 * and tinted, the caret let go, the jump a visit of its own (Back returns to
 * the link, in the same note too). A heading the note lacks is said, never
 * guessed: another note opens at its top, the open note stays where it is. A
 * `^block` only opens the note. **A click that cannot open one note asks**, by
 * decision: a name no note has, or one two notes share, opens the link picker
 * on the link (`openLinkFixerRef`) with Create note or the candidates as its
 * rows, and nothing is made or guessed until a row is chosen.
 *
 * **A target naming a file that is not a note** (`[[Lecture 3.pdf#page=12]]`,
 * Obsidian's form) opens it in the note's place, at the page it asks for
 * (`fileForTarget`), and is drawn as a live link, not a broken one.
 */
export function useWikilinkHandlers({
  noteData,
  noteDataRef,
  // The note open, the editor's heading-link moves (EditorArea) and the
  // history (useNoteHistory), for a heading in the same note.
  activeNote = null,
  headingNavRef = null,
  noteHistoryRef = null,
  textOnlyEdit,
  openNote,
  wikilinkMenuRef,
  setWikilinkMenu,
  syncGeneration,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  showToast,
  // `(el, { fix: true })`: the picker on a link that names no note, or two.
  openLinkFixerRef,
  // The vault's files that are not notes, and the way to show one in place.
  otherFiles = [],
  showFile,
}) {
  // Note title set for broken wikilink detection (its only consumer is
  // inlineMarkdownToHtml's `has`)
  const lastTitlesKey = useRef("");
  const noteTitlesKey = useMemo(() => {
    if (textOnlyEdit.current) {
      textOnlyEdit.current = false;
      return lastTitlesKey.current;
    }
    // Titles and `folder/title`s alike, so the renderer judges an explicit
    // path by the path (utils/wikilinkTarget). A title two notes share is
    // left out, so a plain `[[Goals]]` draws as unresolved: the click asks.
    const counts = new Map();
    for (const n of Object.values(vaultNotes(noteData))) {
      if (n._draft) continue;
      for (const k of noteLinkKeys(n)) counts.set(k, (counts.get(k) || 0) + 1);
    }
    // A file answers to its name and its path, as a note does.
    for (const f of otherFiles) {
      for (const k of new Set([baseName(f.path).toLowerCase(), f.path.toLowerCase()]))
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    const key = [...counts.entries()]
      .filter(([k, c]) => c === 1 || k.includes("/"))
      .map(([k]) => k)
      .sort()
      .join("\0");
    lastTitlesKey.current = key;
    return key;
  }, [noteData, otherFiles]);
  const noteTitleSet = useMemo(() => new Set(noteTitlesKey.split("\0")), [noteTitlesKey]);

  /** A vault file the target names, shown in the note's place: false when the vault holds none. */
  const openFileInPlace = useCallback(
    (target) => {
      const file = showFile ? fileForTarget(target, otherFiles) : null;
      if (file) showFile(file.path, file.page);
      return !!file;
    },
    [showFile, otherFiles],
  );

  // A note a link names, opened at the heading or block its subpath names, if any.
  const followNoteLink = useCallback(
    (id, subpath) => {
      const here = id === activeNote;
      const note = noteDataRef.current[id];
      const all = note?.content?.blocks ?? [];
      const segments = headingSegments(subpath);
      const blockId = blockSubpath(subpath);
      const section = segments
        ? findHeadingSection(all, segments)
        : blockId
          ? findBlockTarget(all, blockId)
          : null;
      if ((segments || blockId) && !section) {
        const where = here ? null : note?.title || "Untitled";
        showToast?.(
          segments ? missingHeadingMessage(segments, where) : missingBlockMessage(blockId, where),
          "info",
        );
        if (!here) openNote(id);
        return;
      }
      if (!section) {
        if (!here) openNote(id);
        return;
      }
      const nav = headingNavRef?.current;
      if (here) {
        // The place being left is taken now: Back returns to it, the link on screen.
        const history = noteHistoryRef?.current;
        const place = nav?.place();
        if (place) history?.recordPlace(id, place);
        history?.jump(id);
      } else openNote(id);
      nav?.reveal(id, all[section.start].id, all[section.end - 1].id);
    },
    [activeNote, noteDataRef, showToast, openNote, headingNavRef, noteHistoryRef],
  );

  // Wikilink click handler
  const handleWikilinkClick = useCallback(
    (target, el = null) => {
      if (openFileInPlace(target)) return;
      const parsed = parseWikilinkTarget(target);
      const status = parsed.name
        ? wikilinkStatus(target, noteDataRef.current)
        : activeNote && noteDataRef.current[activeNote]
          ? { kind: "note", id: activeNote, title: noteDataRef.current[activeNote].title }
          : null;
      if (status?.kind === "note") {
        followNoteLink(status.id, parsed.subpath);
        return;
      }
      if (el && parsed.name && openLinkFixerRef?.current)
        openLinkFixerRef.current(el, { fix: true });
      else if (parsed.name) showToast?.(unresolvedWikilinkMessage(parsed), "info");
    },
    [noteDataRef, showToast, openLinkFixerRef, openFileInPlace, activeNote, followNoteLink],
  );

  // A Markdown link whose destination names something in the vault
  // (`[text](Folder/Note.md#Heading)`, a file, `#Heading`): the note or file
  // is opened as a wikilink's would be, by its path from the note's folder or
  // from the vault's root, never by guessing. False for an address, which is
  // the system browser's.
  const handleVaultLinkClick = useCallback(
    (dest) => {
      const notes = noteDataRef.current;
      const targets = vaultLinkTargets(dest, notes[activeNote]?.folder ?? null);
      if (!targets.length) return false;
      for (const target of targets) {
        if (openFileInPlace(target)) return true;
        const parsed = parseWikilinkTarget(target);
        if (!parsed.name) {
          if (activeNote && notes[activeNote]) followNoteLink(activeNote, parsed.subpath);
          return true;
        }
        const status = wikilinkStatus(target, notes);
        if (status.kind === "note") {
          followNoteLink(status.id, parsed.subpath);
          return true;
        }
      }
      showToast?.(`No note or file at "${targets.at(-1).split("#")[0]}".`, "info");
      return true;
    },
    [noteDataRef, activeNote, openFileInPlace, followNoteLink, showToast],
  );

  // Wikilink autocomplete select handler
  const handleWikilinkSelect = useCallback(
    (title) => {
      const menu = wikilinkMenuRef.current;
      if (!menu) return;
      const { noteId, blockIndex } = menu;
      const blocks = noteDataRef.current[noteId]?.content?.blocks;
      if (!blocks?.[blockIndex]) return;
      const oldText = blocks[blockIndex].text || "";
      const match = oldText.match(/\[\[([^\]]*)$/);
      if (match) {
        const newText = oldText.slice(0, match.index) + `[[${title}]]`;
        // Update state for persistence.
        syncGeneration.current++;
        commitNoteData(
          editBlocks(noteId, (b) => {
            b[blockIndex] = { ...b[blockIndex], text: newText };
          }),
        );
        // The commit renders the editor at once, the bump has the block repaint
        // itself from the keystroke ref, and the queued focus puts the caret
        // after the link through placeCaret, which anchors it *outside* the link
        // so the next keystroke is prose, not part of the alias. From a native
        // listener (WikilinkMenu's window keydown) as from a React one.
        focusBlockId.current = blocks[blockIndex].id;
        focusCursorPos.current = newText.length;
      }
      setWikilinkMenu(null);
    },
    [
      commitNoteData,
      syncGeneration,
      noteDataRef,
      focusBlockId,
      focusCursorPos,
      setWikilinkMenu,
      wikilinkMenuRef,
    ],
  );

  return {
    noteTitleSet,
    handleWikilinkClick,
    handleVaultLinkClick,
    handleWikilinkSelect,
    openFileInPlace,
  };
}
