// @ts-check
import { useCallback, useMemo, useState } from "react";
import { linkTargetFor, wikilinkStatus } from "../utils/wikilinkTarget";
import { caretLength, caretOffsetAt, linkText, placeCaret } from "../utils/domHelpers";

/**
 * The link picker's owner (2026-09-20): when it opens, what it is about, and
 * what its answer becomes in the note. One picker, four ways in:
 *
 *   - Cmd+K or the toolbar's Link: `openFromSelection`, through the format
 *     hook's `getLinkContext` (the link the caret is in, else the selection).
 *   - A right-click's Edit link, or a click on a link that names no note or
 *     two: `openForLink(el, { fix })`.
 *   - A typed `[[`: the input handler's `wikilinkMenu` state, rendered as
 *     the picker with notes only; its answer goes through the wikilink
 *     select path, which rewrites the block's text from the `[[`.
 *
 * What is written. An address with words selected: `[words](url)`; with
 * nothing selected: the bare URL (the autolink form, kept verbatim in the
 * file). A note with words selected: `[[Target|words]]`; with nothing:
 * `[[Target]]`. The target is the shortest that names the note and no other
 * (`linkTargetFor`): the title, or `Folder/Title` for a namesake. Editing
 * rewrites the element in place and reads the block back like a keystroke.
 * Remove leaves the words. Create makes the note in the open note's folder
 * without opening it, then links to it.
 *
 * While the picker holds focus the words it will link wear a neutral wash
 * (`<mark class="link-picker-wash">`, the field's own grammar, never the
 * saved ==highlight==): the document's selection goes with focus, and the
 * wash is what says where the link lands. It is unwrapped before anything is
 * read back or the picker closes, so it never reaches the file.
 */

const WASH_CLASS = "link-picker-wash";

/** Wrap what `range` holds in the wash; answers the mark, or null for a caret. */
function wash(range) {
  if (range.collapsed) return null;
  const mark = document.createElement("mark");
  mark.className = WASH_CLASS;
  try {
    range.surroundContents(mark);
  } catch (_) {
    mark.appendChild(range.extractContents());
    range.insertNode(mark);
  }
  return mark;
}

/** Unwrap the wash; answers a range over what it held, or null. */
function unwash(mark) {
  const parent = mark.parentNode;
  if (!parent) return null;
  const first = mark.firstChild;
  const last = mark.lastChild;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStartBefore(first);
  range.setEndAfter(last);
  return range;
}
/**
 * @typedef {{ top: number, bottom: number, left: number, right: number }} Anchor
 * @typedef {{
 *   mode: "create" | "edit",
 *   anchor: Anchor,
 *   savedRange: Range,
 *   existing: HTMLElement | null,
 *   text?: string,
 *   dest?: string,
 *   searchAtOpen?: boolean,
 *   candidateIds?: string[],
 *   wash?: HTMLElement | null,
 * }} PickerState
 */

export function useLinkPicker({
  noteData,
  noteDataRef,
  activeNoteRef,
  editorRef,
  getLinkContextRef,
  reReadBlockFromDom,
  createNote,
  wikilinkMenu,
  setWikilinkMenu,
  handleWikilinkSelect,
  blockRefs,
}) {
  const [picker, setPicker] = useState(/** @type {PickerState | null} */ (null));

  const notes = useMemo(
    () =>
      Object.entries(noteData)
        .filter(([, n]) => !n._draft && (n.title || "").trim())
        .map(([id, n]) => ({ id, title: n.title, folder: n.folder || null }))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [noteData],
  );

  /** Edit `el`; `fix` lists candidates or Create at once, for a link that resolves to nothing or two. */
  const openForLink = useCallback(
    (el, { fix = false } = {}) => {
      const r = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNode(el);
      const isNote = el.classList.contains("wikilink");
      const target = isNote ? el.getAttribute("data-target") || "" : "";
      const status = isNote ? wikilinkStatus(target, noteDataRef.current) : null;
      // Fixing a link searches by the note's name: `[[Work/Gamma]]` or
      // `[[Beta#Intro]]` that names nothing offers the Gammas and Betas there
      // are, and Create for the name, never for the path.
      const fixQuery = fix && status && status.kind !== "note" ? status.name : null;
      setPicker({
        mode: "edit",
        anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        savedRange: range,
        existing: el,
        text: linkText(el),
        dest: isNote ? `[[${fixQuery ?? target}]]` : el.getAttribute("href") || "",
        searchAtOpen: fix,
        candidateIds: status?.kind === "ambiguous" ? status.ids : undefined,
      });
    },
    [noteDataRef],
  );

  const openFromSelection = useCallback(() => {
    const ctx = getLinkContextRef.current?.();
    if (!ctx) return;
    if (ctx.existingLink) openForLink(ctx.existingLink);
    else {
      const mark = wash(ctx.savedRange);
      let savedRange = ctx.savedRange;
      if (mark) {
        savedRange = document.createRange();
        savedRange.selectNode(mark);
      }
      setPicker({ mode: "create", anchor: ctx.anchor, savedRange, existing: null, wash: mark });
    }
  }, [getLinkContextRef, openForLink]);

  const close = useCallback(() => {
    setPicker((p) => {
      if (p?.savedRange && editorRef.current) {
        // Back to the note, where the reader was: the selection for a
        // cancelled creation, the caret after the link otherwise.
        const range = p.wash ? unwash(p.wash) : p.savedRange;
        const sel = window.getSelection();
        try {
          if (sel && range) {
            sel.removeAllRanges();
            sel.addRange(range);
            if (p.mode === "edit") sel.collapseToEnd();
          }
        } catch (_) {}
        editorRef.current.focus({ preventScroll: true });
      }
      return null;
    });
  }, [editorRef]);

  /** The quick route's close: the `[[` stays as typed, the caret returns after it. */
  const closeQuick = useCallback(() => {
    const menu = wikilinkMenu;
    setWikilinkMenu(null);
    if (!menu) return;
    const blocks = noteDataRef.current[menu.noteId]?.content?.blocks;
    const el = blocks?.[menu.blockIndex] && blockRefs.current[blocks[menu.blockIndex].id];
    if (el) placeCaret(el, caretLength(el));
  }, [wikilinkMenu, setWikilinkMenu, noteDataRef, blockRefs]);

  /** The note a chosen destination means, made if asked; answers its target text. */
  const noteTarget = useCallback(
    (dest) => {
      let id = dest.id;
      if (dest.create) {
        const folder = noteDataRef.current[activeNoteRef.current]?.folder || null;
        id = createNote(folder, dest.title, { open: false });
      }
      return id ? linkTargetFor(id, noteDataRef.current) : dest.title;
    },
    [createNote, noteDataRef, activeNoteRef],
  );

  const applyQuick = useCallback(
    ({ dest }) => {
      if (dest.kind !== "note") return;
      handleWikilinkSelect(noteTarget(dest));
    },
    [handleWikilinkSelect, noteTarget],
  );

  const apply = useCallback(
    ({ dest, text }) => {
      const p = picker;
      const sel = window.getSelection();
      if (!p || !sel) return;
      const range = (p.wash && unwash(p.wash)) || p.savedRange;
      sel.removeAllRanges();
      sel.addRange(range);
      const selectedText = p.mode === "create" && !sel.isCollapsed ? sel.toString() : "";
      let el;
      if (dest.kind === "url") {
        const label = text || selectedText || dest.url;
        el = document.createElement("a");
        el.href = dest.url;
        el.setAttribute("data-url", dest.url);
        el.className = label === dest.url ? "external-link bare-url" : "external-link";
        el.textContent = label;
        const icon = document.createElement("span");
        icon.className = "external-link-icon";
        icon.contentEditable = "false";
        icon.textContent = "↗";
        el.appendChild(icon);
      } else {
        const target =
          dest.keep && p.existing?.classList.contains("wikilink")
            ? p.existing.getAttribute("data-target") || dest.title
            : noteTarget(dest);
        const label = text || selectedText || dest.title;
        el = document.createElement("span");
        const status = wikilinkStatus(target, noteDataRef.current);
        el.className = status.kind === "note" ? "wikilink" : "wikilink wikilink-broken";
        el.setAttribute("data-target", target);
        el.textContent = label;
      }
      if (p.existing) {
        p.existing.replaceWith(el);
      } else {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(el);
      }
      // The caret goes after the link through placeCaret, which anchors it
      // outside the link so the next keystroke is prose, never the alias
      // (a raw range after the element was canonicalised to inside it).
      const blockEl = el.closest("[data-block-id]");
      const after = document.createRange();
      after.setStartAfter(el);
      after.collapse(true);
      sel.removeAllRanges();
      sel.addRange(after);
      const pos = blockEl ? caretOffsetAt(blockEl, after.startContainer, after.startOffset) : -1;
      reReadBlockFromDom();
      setPicker(null);
      editorRef.current?.focus({ preventScroll: true });
      if (blockEl && pos >= 0) placeCaret(blockEl, pos);
    },
    [picker, noteTarget, noteDataRef, reReadBlockFromDom, editorRef],
  );

  const remove = useCallback(() => {
    const el = picker?.existing;
    setPicker(null);
    if (!el) return;
    removeLinkElement(el);
    reReadBlockFromDom();
    editorRef.current?.focus({ preventScroll: true });
  }, [picker, reReadBlockFromDom, editorRef]);

  // The quick route as picker props: the block's line is the anchor.
  const quick = wikilinkMenu
    ? {
        mode: "create",
        notesOnly: true,
        anchor: {
          top: wikilinkMenu.rect.top,
          bottom: wikilinkMenu.rect.top,
          left: wikilinkMenu.rect.left,
          right: wikilinkMenu.rect.left,
        },
        initialDest: wikilinkMenu.filter || "",
      }
    : null;

  return {
    picker,
    quick,
    notes,
    openFromSelection,
    openForLink,
    apply,
    applyQuick,
    remove,
    close,
    closeQuick,
  };
}

/**
 * The link becomes its words, and the caret rests after them, so the block
 * read back is this one: a right-click leaves the document selection wherever
 * it was, which may be another block (the old Remove read that one).
 */
export function removeLinkElement(el) {
  const text = document.createTextNode(linkText(el));
  el.replaceWith(text);
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(text, text.length);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
