import { type RefObject, useCallback, useEffect, useRef } from "react";
import { cssZoom } from "../../utils/domHelpers";
import { caretOffsetIn, overlaps, spellParagraphs, wordRanges } from "../../utils/spellingMarks";

/** A pause in the typing before a changed paragraph is checked. */
const SETTLE_MS = 150;
/** Where Chromium put its dotted underline (measured on Inter, as the line
 *  was drawn before): up from the bottom of the word's box by this much of
 *  the font size, then down by the line's 1px offset. */
const LINE_RISE_EM = 0.207;
const LINE_DROP_PX = 1;
/** A dot's size and its pitch: 2px dots, about 2px apart. */
const DOT_PX = 2;
const DOT_PITCH_PX = 4;

/**
 * Lay a dotted line under each range, on `layer` (absolutely placed over the
 * editor, never inside it). Drawn rather than a CSS highlight: Chromium paints
 * a highlighted run apart from its neighbours and clips each to its own box,
 * cutting off a glyph that leans past its edge (the y in "y." when the font
 * tucks the full stop under it). Dots run from the word's first letter to its
 * last, evenly, as Chromium's did.
 */
function paintLines(layer: HTMLElement, ranges: Range[]) {
  const zoom = cssZoom(layer);
  const box = layer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  let used = 0;
  for (const r of ranges) {
    const host = r.startContainer.parentElement;
    if (!host) continue;
    const fontPx = parseFloat(getComputedStyle(host).fontSize) * zoom;
    const word = r.toString();
    for (const rect of r.getClientRects()) {
      if (rect.width < 1) continue;
      const top = snap(rect.bottom - LINE_RISE_EM * fontPx + LINE_DROP_PX * zoom);
      const width = rect.width / zoom;
      const dots = Math.max(1, Math.round((width - DOT_PX) / DOT_PITCH_PX) + 1);
      const pitch = dots > 1 ? (width - DOT_PX) / (dots - 1) : width;
      let el = layer.children[used] as HTMLElement | undefined;
      if (!el) {
        el = document.createElement("i");
        layer.appendChild(el);
      }
      el.dataset.word = word;
      el.style.left = `${(rect.left - box.left) / zoom}px`;
      el.style.top = `${(top - box.top) / zoom}px`;
      el.style.width = `${width}px`;
      el.style.backgroundSize = `${pitch}px ${DOT_PX}px`;
      used++;
    }
  }
  while (layer.children.length > used) layer.lastChild?.remove();
}

/**
 * The editor's spelling underline, drawn by the app rather than Chromium,
 * on `layerRef` (see `paintLines`),
 * whose own checker underlines only a focused editor and the rest of a note
 * only when idle (a second or two after a click). The words come from the
 * system's checker (`checkParagraphs`, a Mac's in each paragraph's
 * language), so they always match the right-click menu's.
 *
 * - **A note is checked whole when it opens**, focused or not.
 * - **Answers are kept by paragraph text**: an edit re-checks only the
 *   paragraph it changed, after a pause; until the answer comes the
 *   paragraph keeps its last words, so its lines do not flicker.
 * - **One observer redraws after any change** (typing, undo, paste, a
 *   repaint), since a repaint's new nodes leave the old ranges empty.
 * - **The word being typed is not underlined** until the caret leaves it.
 *
 * Returns `recheck` (the dictionary changed: ask again) and `markedAt` (the
 * right-click asks whether its word is underlined).
 */
export function useSpellingMarks(
  editorRef: RefObject<HTMLElement | null>,
  /** The element the lines are laid on: over the editor, outside it. */
  layerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Anything after which the editor element or its note is new. */
  noteKey: unknown,
) {
  const answers = useRef(new Map<string, Set<string>>());
  const shown = useRef(new WeakMap<Element, Set<string>>());
  const marks = useRef<Range[]>([]);
  const redrawRef = useRef<() => void>(() => {});

  // biome-ignore lint/correctness/useExhaustiveDependencies: `noteKey` names a new editor element or note
  useEffect(() => {
    const editor = editorRef.current;
    const layer = layerRef.current;
    const check = window.electronAPI?.checkParagraphs;
    if (!enabled || !editor || !layer || !check) {
      layer?.replaceChildren();
      marks.current = [];
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let asking = false;
    // The caret just after a keystroke: the word ending there is being typed.
    let typedAt: { node: Node | null; offset: number } | null = null;

    // Drawn at once on any change, from the answers already held (a
    // repaint's new nodes would otherwise lose their lines until the next
    // answer); only asking waits for a pause in the typing.
    const draw = () => {
      const paragraphs = spellParagraphs(editor);
      if (paragraphs.some((p) => p.text.trim() && !answers.current.has(p.text))) askSoon();
      const sel = window.getSelection();
      const ranges: Range[] = [];
      for (const p of paragraphs) {
        const known = answers.current.get(p.text);
        if (known) shown.current.set(p.el, known);
        const words = known ?? shown.current.get(p.el);
        if (!words) continue;
        const skip =
          typedAt && sel?.isCollapsed && sel.anchorNode === typedAt.node
            ? caretOffsetIn(p, sel.anchorNode, sel.anchorOffset)
            : -1;
        ranges.push(...wordRanges(p, words, skip));
      }
      marks.current = ranges;
      paintLines(layer, ranges);
    };
    const ask = () => {
      if (asking) return;
      const texts = [
        ...new Set(
          spellParagraphs(editor)
            .map((p) => p.text)
            .filter((t) => t.trim() && !answers.current.has(t)),
        ),
      ];
      if (!texts.length) return;
      asking = true;
      check(texts)
        .catch(() => texts.map(() => []))
        .then((words) => {
          asking = false;
          if (!live) return;
          for (const [i, t] of texts.entries()) answers.current.set(t, new Set(words[i] ?? []));
          draw();
        });
    };
    const askSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(ask, SETTLE_MS);
    };
    redrawRef.current = draw;

    const observer = new MutationObserver(draw);
    // Attributes too: an indent or a kind change restyles a block, moving its
    // words without touching their text or the editor's size.
    observer.observe(editor, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });
    const onInput = () => {
      const sel = window.getSelection();
      typedAt = sel ? { node: sel.anchorNode, offset: sel.anchorOffset } : null;
    };
    // The caret left the word being typed: underline it now.
    const onSelection = () => {
      const sel = window.getSelection();
      if (!typedAt || (sel?.anchorNode === typedAt.node && sel?.anchorOffset === typedAt.offset))
        return;
      typedAt = null;
      draw();
    };
    editor.addEventListener("input", onInput);
    document.addEventListener("selectionchange", onSelection);
    // The words move without a change to the text: the column rewraps (the
    // window, the sidebar, the UI scale), an image loads above them, a block
    // glides into place, the font arrives.
    const resized = new ResizeObserver(draw);
    resized.observe(editor);
    editor.addEventListener("transitionend", draw);
    editor.addEventListener("animationend", draw);
    document.fonts?.ready.then(() => live && draw());
    draw();
    ask(); // a note just opened is checked at once, not after a pause
    return () => {
      live = false;
      clearTimeout(timer);
      observer.disconnect();
      resized.disconnect();
      editor.removeEventListener("input", onInput);
      editor.removeEventListener("transitionend", draw);
      editor.removeEventListener("animationend", draw);
      document.removeEventListener("selectionchange", onSelection);
      layer.replaceChildren();
      marks.current = [];
    };
  }, [editorRef, layerRef, enabled, noteKey]);

  const recheck = useCallback(() => {
    answers.current.clear();
    shown.current = new WeakMap();
    redrawRef.current();
  }, []);
  const markedAt = useCallback((range: Range) => marks.current.some((m) => overlaps(m, range)), []);
  return { recheck, markedAt };
}
