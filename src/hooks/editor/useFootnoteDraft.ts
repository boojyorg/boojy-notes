import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNoteDataActions } from "../../context/NoteDataContext";
import type { Block, NoteData } from "../../types/notes";
import { markdownBefore } from "../../utils/crossBlockEdit";
import { caretOffsetAt, caretRect, placeCaret } from "../../utils/domHelpers";
import {
  type DraftRect,
  FOOTNOTE_DRAFT_EVENT,
  type FootnoteDraft,
  SETTLE_DRAFTS_EVENT,
  draftNumber,
  endsInFootnoteOpen,
  footnoteContext,
  rectOf,
} from "../../utils/footnoteDraft";
import { FOOTNOTE_REF_CLASS } from "../../utils/footnotes";
import {
  findFootnoteDefinition,
  nextFootnoteNumber,
  ownFootnoteRef,
  refBeforeCaret,
} from "../../utils/footnoteTarget";

/** The faint `n]` after a typed `[^`: an empty span whose text is CSS, so nothing reads it. */
export const FOOTNOTE_GHOST_CLASS = "fn-ghost";

/**
 * What a typed `[^` offers: in prose, the ghost of the next number, there to
 * take; in a field (a cell, a callout), a note that no footnote goes there.
 */
type Offer =
  | { kind: "ghost"; label: string }
  | { kind: "unavailable"; rect: DraftRect; text: string };

interface Deps {
  editorRef: MutableRefObject<HTMLElement | null>;
  blockRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  noteDataRef: MutableRefObject<NoteData>;
  activeNote: string | null;
  commitFootnoteDraft: (draft: FootnoteDraft, text: string) => boolean;
  /** A draft that could not be attached (its line changed meanwhile): its text, kept for the user. */
  onNotAdded: (text: string) => void;
}

const blocksIn = (data: NoteData, noteId: string) =>
  (data[noteId]?.content?.blocks ?? []) as Block[];

const caretSpot = () => {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed || !sel.anchorNode) return null;
  return { sel, node: sel.anchorNode, offset: sel.anchorOffset };
};

const blockOf = (node: Node) =>
  (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest(
    "[data-block-id]",
  ) ?? null;

const MODIFIERS = ["Shift", "Meta", "Control", "Alt", "CapsLock"];

/**
 * Making a footnote from where the caret is. A typed `[^` in prose shows the
 * next number's `n]` faintly after the caret; Enter or Tab types it, and the
 * reference, sealed as a typed one is, opens the panel for its text. A typed
 * `]` closing a label nothing defines opens the panel too, as does Insert
 * footnote. In a cell or a callout a note says no footnote goes there; in
 * code, a comment or a link nothing is said: what is typed there is text.
 *
 * The panel's text is a draft until Done, or a leave with text in it: a press
 * elsewhere, another note, or any flush but a window blur (`flushAll` fires
 * `SETTLE_DRAFTS_EVENT` first: quit, a storage switch, a save point, the
 * phone leaving the screen). Escape, or leaving it empty, writes nothing.
 */
export function useFootnoteDraft({
  editorRef,
  blockRefs,
  noteDataRef,
  activeNote,
  commitFootnoteDraft,
  onNotAdded,
}: Deps) {
  const { closeTypingGroup } = useNoteDataActions() as { closeTypingGroup: () => void };
  // Read through a ref: the listeners below are set up once per note, and a
  // new function each render would set them up again, dropping the ghost.
  const closeTypingGroupRef = useRef(closeTypingGroup);
  closeTypingGroupRef.current = closeTypingGroup;
  const [offer, setOfferState] = useState<Offer | null>(null);
  /** The offer showing, set with it: listeners read it before React renders. */
  const offerRef = useRef<Offer | null>(null);
  const [draft, setDraft] = useState<FootnoteDraft | null>(null);
  /** The open draft, set with it: a flush can come before React renders. */
  const draftRef = useRef<FootnoteDraft | null>(null);
  /** The ghost span drawn in the line, if one is showing. */
  const ghost = useRef<HTMLElement | null>(null);
  /** The panel's field, as typed: what a leave writes. */
  const draftText = useRef("");
  /** Where the caret was when the panel opened: Escape puts it back. */
  const returnTo = useRef<{ blockId: string; caret: number } | null>(null);

  /**
   * Show an offer, or none. A ghost is drawn in the line just after the caret
   * (no text of its own, so saving, copying, spelling and caret counts never
   * see it, yet it pushes the rest of the line along), the caret kept before it.
   */
  const setOffer = useCallback((o: Offer | null) => {
    ghost.current?.remove();
    ghost.current = null;
    const sel = window.getSelection();
    if (o?.kind === "ghost" && sel?.rangeCount) {
      const span = document.createElement("span");
      span.className = FOOTNOTE_GHOST_CLASS;
      span.contentEditable = "false";
      span.setAttribute("aria-hidden", "true");
      span.setAttribute("data-ghost", `${o.label}]`);
      // Put in without splitting a text node into an empty one after it,
      // where the browser would then report the caret: past the ghost.
      const { anchorNode: node, anchorOffset: offset } = sel;
      const range = document.createRange();
      if (node?.nodeType === Node.TEXT_NODE) {
        const text = node as Text;
        if (offset < text.data.length) text.splitText(offset);
        text.after(span);
        range.setStart(text, offset);
      } else if (node) {
        node.insertBefore(span, node.childNodes[offset] ?? null);
        range.setStartBefore(span);
      }
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      ghost.current = span;
    }
    offerRef.current = o;
    setOfferState(o);
  }, []);

  /** Whether the caret stands just before the ghost, the ghost still drawn. */
  const caretBeforeGhost = useCallback(() => {
    const g = ghost.current;
    const spot = caretSpot();
    if (!g?.isConnected || !spot) return false;
    const { node, offset } = spot;
    if (node.nodeType === Node.TEXT_NODE)
      return offset === (node as Text).data.length && node.nextSibling === g;
    return node.childNodes[offset] === g;
  }, []);

  const open = useCallback(
    (d: FootnoteDraft) => {
      const spot = caretSpot();
      const el = blockRefs.current[d.blockId];
      returnTo.current =
        spot && el?.contains(spot.node)
          ? { blockId: d.blockId, caret: caretOffsetAt(el, spot.node, spot.offset) }
          : null;
      draftText.current = "";
      setOffer(null);
      draftRef.current = d;
      setDraft(d);
    },
    [blockRefs, setOffer],
  );

  const onNotAddedRef = useRef(onNotAdded);
  onNotAddedRef.current = onNotAdded;

  /**
   * Done, or a leave: the draft written if it holds text, then closed. Where
   * it can no longer go (its line changed meanwhile, as another app or a sync
   * can change it) it is refused, never put elsewhere, and its text is handed
   * on (`onNotAdded`), never dropped.
   */
  const settle = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    const text = draftText.current.trim();
    draftRef.current = null;
    setDraft(null);
    if (text && !commitFootnoteDraft(d, text)) onNotAddedRef.current(text);
  }, [commitFootnoteDraft]);

  /** Escape: nothing written, the caret back where it was. */
  const cancel = useCallback(() => {
    draftRef.current = null;
    setDraft(null);
    const back = returnTo.current;
    const el = back && blockRefs.current[back.blockId];
    if (back && el?.isConnected) {
      el.focus({ preventScroll: true });
      placeCaret(el, back.caret, { reveal: false });
    }
  }, [blockRefs]);

  useEffect(() => {
    if (!activeNote) return;
    // The editor's element is read at each event, never kept: it can be
    // mounted after the note becomes the active one.
    const editor = () => editorRef.current;
    const blocks = () => blocksIn(noteDataRef.current, activeNote);

    /** What a `[^` just before the caret offers, read from the DOM now. */
    const readOffer = (): Offer | null => {
      const spot = caretSpot();
      if (!spot || !editor()?.contains(spot.node)) return null;
      const where = footnoteContext(spot.node);
      if (where !== "text" && where !== "field") return null;
      const blockEl = blockOf(spot.node);
      const blockId = blockEl?.getAttribute("data-block-id") ?? "";
      const textRoot = where === "text" ? blockRefs.current[blockId] : null;
      const before = textRoot
        ? markdownBefore(textRoot, spot.node, spot.offset)
        : (spot.node.textContent ?? "").slice(0, spot.offset);
      if (!endsInFootnoteOpen(before)) return null;
      if (!textRoot) {
        const what = blockEl?.getAttribute("data-block-type") === "table" ? "a table" : "a callout";
        const rect = rectOf(caretRect(spot.sel.getRangeAt(0), blockEl));
        return { kind: "unavailable", rect, text: `Footnotes can't go in ${what}` };
      }
      const label = String(nextFootnoteNumber(blocks()));
      return { kind: "ghost", label };
    };

    /** The reference just before the caret in a text block, with its place in the block. */
    const refAtCaret = () => {
      const spot = caretSpot();
      const blockEl = spot && blockOf(spot.node);
      const blockId = blockEl?.getAttribute("data-block-id") ?? "";
      const textRoot = blockRefs.current[blockId];
      const ref = spot && refBeforeCaret(spot.node, spot.offset);
      if (!ref || !textRoot?.contains(ref) || !ownFootnoteRef(ref)) return null;
      const refIndex = [...textRoot.querySelectorAll(`.${FOOTNOTE_REF_CLASS}`)].indexOf(ref);
      return { ref, blockId, refIndex, label: ref.getAttribute("data-fn") ?? "" };
    };

    // The last character typed: Enter or Tab asks for an offer right after a `^`.
    let lastTyped: string | null = null;
    // Only the newest keystroke's check counts: under load an older one's
    // timer can run after a newer one drew the ghost.
    let inputSeq = 0;
    // Read once the editor's own handlers have run (they seal a closed reference).
    const onInput = (e: Event) => {
      const native = e as InputEvent;
      if (native.isComposing || !editor()?.contains(e.target as Node)) return;
      lastTyped = native.inputType === "insertText" ? native.data : null;
      const typed = lastTyped;
      const seq = ++inputSeq;
      setTimeout(() => {
        if (seq !== inputSeq) return;
        if (typed === "^") return setOffer(readOffer());
        setOffer(null);
        // `]` closing a label nothing defines: the panel, for that label. Not
        // at a line's start, where `[^9]: ` is a footnote line being typed.
        if (typed !== "]") return;
        const at = refAtCaret();
        if (!at?.label || findFootnoteDefinition(blocks(), at.label) >= 0) return;
        const root = blockRefs.current[at.blockId];
        const index = [...(at.ref.parentNode?.childNodes ?? [])].indexOf(at.ref as ChildNode);
        if (root && at.ref.parentNode && markdownBefore(root, at.ref.parentNode, index) === "")
          return;
        open({
          kind: "typed",
          noteId: activeNote,
          blockId: at.blockId,
          label: at.label,
          refIndex: at.refIndex,
          rect: rectOf(at.ref.getBoundingClientRect()),
        });
      }, 0);
    };

    // The ghost is for the `[^` just typed: the caret moving off it drops it.
    // A repaint (a new note's first save) takes the ghost away and puts the
    // caret back: still just after the `[^`, the ghost is drawn again.
    const onSelection = () => {
      if (!offerRef.current && lastTyped !== "^") return;
      // Looked at a frame later: a repaint (a new note's first save) moves
      // the caret away and back, and takes the ghost with it.
      requestAnimationFrame(() => {
        const o = offerRef.current;
        if (o?.kind === "ghost" && caretBeforeGhost()) return;
        if (o?.kind === "unavailable") {
          const spot = caretSpot();
          if (spot && endsInFootnoteOpen((spot.node.textContent ?? "").slice(0, spot.offset)))
            return;
        }
        // Still straight after a `^` (no key since): what the caret is at now.
        setOffer(lastTyped === "^" ? readOffer() : null);
      });
    };

    /**
     * Enter or Tab takes the ghost: its `n]` is typed into the line (an entry
     * of its own, so ⌘Z gives back `[^`) and the reference seals as a typed
     * one does. Its input has run the editor's handlers by now, so the panel
     * opens at once: a key typed straight after must land in it, not the line.
     */
    const accept = (o: Extract<Offer, { kind: "ghost" }>) => {
      setOffer(null);
      closeTypingGroupRef.current();
      document.execCommand("insertText", false, `${o.label}]`);
      closeTypingGroupRef.current();
      const at = refAtCaret();
      if (!at) return;
      flushSync(() =>
        open({
          kind: "typed",
          noteId: activeNote,
          blockId: at.blockId,
          label: at.label,
          refIndex: at.refIndex,
          rect: rectOf(at.ref.getBoundingClientRect()),
        }),
      );
    };

    // Enter and Tab take a ghost, Escape drops an offer; any other key drops
    // it and does what it does.
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const typedCaret = lastTyped;
      if (!MODIFIERS.includes(e.key)) lastTyped = null;
      const takes = e.key === "Enter" || e.key === "Tab";
      // Taken straight after `[^`, before the ghost has drawn, it is still the ghost's.
      let o = offerRef.current ?? (takes && typedCaret === "^" ? readOffer() : null);
      // A ghost a repaint took away offers nothing: what is not shown is not taken.
      if (o?.kind === "ghost" && offerRef.current && !caretBeforeGhost()) {
        setOffer(null);
        o = null;
      }
      if (!o) return;
      const plain = !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (takes && plain && o.kind === "ghost") {
        e.preventDefault();
        e.stopPropagation();
        accept(o);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOffer(null);
      } else if (!MODIFIERS.includes(e.key)) {
        setOffer(null);
      }
    };

    // Insert footnote: from the menu bar this is no key event, so React would
    // render later; the panel opens now, and a letter typed at once lands in it.
    const onDraft = (e: Event) => flushSync(() => open((e as CustomEvent<FootnoteDraft>).detail));
    document.addEventListener("input", onInput, true);
    document.addEventListener(FOOTNOTE_DRAFT_EVENT, onDraft);
    document.addEventListener("selectionchange", onSelection);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener(FOOTNOTE_DRAFT_EVENT, onDraft);
      document.removeEventListener("selectionchange", onSelection);
      window.removeEventListener("keydown", onKey, true);
      setOffer(null);
    };
  }, [activeNote, editorRef, blockRefs, noteDataRef, open, setOffer, caretBeforeGhost]);

  // Another note: a draft holding text is written into the one it was made in.
  useEffect(() => {
    if (draftRef.current && draftRef.current.noteId !== activeNote) settle();
  }, [activeNote, settle]);
  // A flush (`flushAll`) writes it first.
  useEffect(() => {
    window.addEventListener(SETTLE_DRAFTS_EVENT, settle);
    return () => window.removeEventListener(SETTLE_DRAFTS_EVENT, settle);
  }, [settle]);

  const unavailable = offer?.kind === "unavailable" ? offer : null;
  const number = draft
    ? draftNumber(blocksIn(noteDataRef.current, draft.noteId), draft)
    : undefined;
  return { unavailable, draft, number, draftText, done: settle, cancel };
}
