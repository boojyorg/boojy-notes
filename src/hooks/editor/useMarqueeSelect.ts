import { type RefObject, useEffect, useRef } from "react";
import type { BlockSelection } from "../../utils/blockRun";
import { cssZoom } from "../../utils/domHelpers";
import {
  autoScrollStep,
  type BlockSpan,
  MARQUEE_THRESHOLD,
  marqueeRun,
} from "../../utils/marqueeSelect";

interface Options {
  scrollerRef: RefObject<HTMLElement | null>;
  editorRef: RefObject<HTMLElement | null>;
  /** Whether a press may start a box: the note's own background, or a block's gutter strip. */
  startsBox: (e: MouseEvent) => boolean;
  /** The block selection now, put back when a box is cancelled. */
  currentSelection: () => BlockSelection | null;
  setBlockSelection: (s: BlockSelection | null) => void;
  /** The caret rests, hidden, in the run's anchor, so the run's keys reach the editor. */
  restCaretIn: (id: string) => void;
  /** The editor's mouse-down flag let go: the box keeps the release from the editor's handlers. */
  releaseMouse: () => void;
  colours: { fill: string; edge: string };
  enabled: boolean;
}

/**
 * A drag that starts on the note's background (the margins, between or below
 * the blocks) or in a block's gutter strip draws a box, and selects the blocks
 * it touches (utils/marqueeSelect), as Notion's does. A press that never moves
 * past the threshold is the click it was (the gutter's pick, the margin's
 * caret). The page scrolls while the pointer nears its top or bottom edge.
 * Escape and leaving the window cancel, putting back what was selected.
 *
 * On the document, in capture: React handles the gutter's press at the app's
 * root and stops it there, so a listener below would never hear it.
 */
export function useMarqueeSelect(options: Options) {
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    if (!options.enabled) return;
    let drag: {
      startX: number;
      /** The start's height in the page: viewport pixels plus the scroll it had. */
      startY: number;
      x: number;
      y: number;
      active: boolean;
      before: BlockSelection | null;
      box: HTMLDivElement | null;
      frame: number;
      run: string;
    } | null = null;

    const spans = (): BlockSpan[] => {
      const editor = opts.current.editorRef.current;
      if (!editor) return [];
      const out: BlockSpan[] = [];
      for (const el of Array.from(editor.children)) {
        if (!(el instanceof HTMLElement) || !el.dataset.blockId) continue;
        if (el.dataset.blockType === "frontmatter") continue;
        const r = el.getBoundingClientRect();
        out.push({ id: el.dataset.blockId, top: r.top, bottom: r.bottom });
      }
      return out;
    };

    const update = () => {
      const scroller = opts.current.scrollerRef.current;
      if (!drag?.active || !scroller) return;
      const zoom = cssZoom(scroller);
      const startY = drag.startY - scroller.scrollTop * zoom;
      const run = marqueeRun(spans(), startY, drag.y);
      const key = run ? `${run.anchor}|${run.head}` : "";
      if (key !== drag.run) {
        drag.run = key;
        opts.current.setBlockSelection(run);
      }
      // Viewport pixels become a style through the UI scale.
      const box = drag.box;
      if (box) {
        box.style.left = `${Math.min(drag.startX, drag.x) / zoom}px`;
        box.style.top = `${Math.min(startY, drag.y) / zoom}px`;
        box.style.width = `${Math.abs(drag.x - drag.startX) / zoom}px`;
        box.style.height = `${Math.abs(drag.y - startY) / zoom}px`;
      }
    };

    const tick = () => {
      const scroller = opts.current.scrollerRef.current;
      if (!drag?.active || !scroller) return;
      const pane = scroller.getBoundingClientRect();
      const step = autoScrollStep(drag.y, pane.top, pane.bottom);
      if (step) scroller.scrollTop += step / cssZoom(scroller);
      update();
      drag.frame = requestAnimationFrame(tick);
    };

    const finish = () => {
      if (!drag) return;
      cancelAnimationFrame(drag.frame);
      drag.box?.remove();
      document.documentElement.classList.remove("marquee-dragging");
      drag = null;
    };

    const onDown = (e: MouseEvent) => {
      const scroller = opts.current.scrollerRef.current;
      if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!scroller || !(e.target instanceof Node) || !scroller.contains(e.target)) return;
      if (!opts.current.startsBox(e)) return;
      drag = {
        startX: e.clientX,
        startY: e.clientY + scroller.scrollTop * cssZoom(scroller),
        x: e.clientX,
        y: e.clientY,
        active: false,
        before: opts.current.currentSelection(),
        box: null,
        frame: 0,
        run: "",
      };
    };

    const onMove = (e: MouseEvent) => {
      if (!drag) return;
      if (e.buttons === 0) return finish();
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (!drag.active) {
        const scroller = opts.current.scrollerRef.current;
        const zoom = scroller ? cssZoom(scroller) : 1;
        const startY = drag.startY - (scroller?.scrollTop ?? 0) * zoom;
        if (Math.hypot(drag.x - drag.startX, drag.y - startY) / zoom < MARQUEE_THRESHOLD) return;
        drag.active = true;
        // The press may have begun a text selection from the margin.
        window.getSelection()?.removeAllRanges();
        document.documentElement.classList.add("marquee-dragging");
        const box = document.createElement("div");
        box.className = "marquee-box";
        box.setAttribute("aria-hidden", "true");
        box.style.background = opts.current.colours.fill;
        box.style.borderColor = opts.current.colours.edge;
        document.body.appendChild(box);
        drag.box = box;
        drag.frame = requestAnimationFrame(tick);
      }
      e.preventDefault();
      update();
    };

    // A box's release is the box's: no caret rescue, no click on what it ends over.
    const swallowClick = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const onUp = (e: MouseEvent) => {
      if (!drag) return;
      const wasBox = drag.active;
      const anchor = drag.run.split("|")[0];
      finish();
      if (!wasBox) return;
      opts.current.releaseMouse();
      if (anchor) opts.current.restCaretIn(anchor);
      e.stopPropagation();
      e.preventDefault();
      window.addEventListener("click", swallowClick, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallowClick, true), 0);
    };

    const cancel = () => {
      if (!drag?.active) return finish();
      const before = drag.before;
      finish();
      opts.current.setBlockSelection(before);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !drag?.active) return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };

    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("mousemove", onMove, true);
    window.addEventListener("mouseup", onUp, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", cancel);
    return () => {
      finish();
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", cancel);
    };
  }, [options.enabled]);
}
