import { type RefObject, useCallback, useEffect, useRef } from "react";
import { caretOffsetIn, overlaps, spellParagraphs, wordRanges } from "../../utils/spellingMarks";

/** The highlight's name; GlobalStyles draws it as the red dotted line. */
export const SPELLING_HIGHLIGHT = "spelling";
/** A pause in the typing before a changed paragraph is checked. */
const SETTLE_MS = 150;

interface HighlightApi {
  highlights: { set(name: string, h: unknown): void; delete(name: string): void };
  Highlight: new (...r: Range[]) => unknown;
}
function highlightApi(): HighlightApi | null {
  const g = globalThis as {
    CSS?: { highlights?: HighlightApi["highlights"] };
    Highlight?: HighlightApi["Highlight"];
  };
  return g.CSS?.highlights && g.Highlight
    ? { highlights: g.CSS.highlights, Highlight: g.Highlight }
    : null;
}

/**
 * The editor's spelling underline, drawn by the app rather than Chromium,
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
    const api = highlightApi();
    const editor = editorRef.current;
    const check = window.electronAPI?.checkParagraphs;
    if (!enabled || !api || !editor || !check) {
      api?.highlights.delete(SPELLING_HIGHLIGHT);
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
      api.highlights.set(SPELLING_HIGHLIGHT, new api.Highlight(...ranges));
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
    observer.observe(editor, { childList: true, subtree: true, characterData: true });
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
    draw();
    ask(); // a note just opened is checked at once, not after a pause
    return () => {
      live = false;
      clearTimeout(timer);
      observer.disconnect();
      editor.removeEventListener("input", onInput);
      document.removeEventListener("selectionchange", onSelection);
      api.highlights.delete(SPELLING_HIGHLIGHT);
      marks.current = [];
    };
  }, [editorRef, enabled, noteKey]);

  const recheck = useCallback(() => {
    answers.current.clear();
    shown.current = new WeakMap();
    redrawRef.current();
  }, []);
  const markedAt = useCallback((range: Range) => marks.current.some((m) => overlaps(m, range)), []);
  return { recheck, markedAt };
}
