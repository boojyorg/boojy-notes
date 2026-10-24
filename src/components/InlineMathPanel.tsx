import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useExitGhost } from "../hooks/useExitGhost";
import { Tooltip, useTooltip } from "./Tooltip";
import { INLINE_MATH_CLASS, caretOffsetAt, cssZoom, placeCaret } from "../utils/domHelpers";
import { drawAtom } from "../utils/inlineMath";
import { useLatexCompletion } from "../hooks/useLatexCompletion";
import LatexMenu from "./LatexMenu";
import { MENU_RADIUS } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { isMac } from "../utils/platform";
import { rectAnchor } from "./Menu";

const SHIFT_ENTER = isMac ? "⇧↵" : "Shift+Enter";
const MONO = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

/** Which formula is open: the nth in its block, found again after a repaint. */
export interface InlineMathTarget {
  blockId: string;
  index: number;
}

interface Props {
  target: InlineMathTarget;
  blockRefs: { current: Record<string, HTMLElement | null> };
  syncGen: number;
  /** Read a block back from the DOM and commit it at the text grain. */
  reRead: (sel: { rangeCount: number; anchorNode: Node }) => void;
  onClose: () => void;
}

const atomsIn = (el: HTMLElement | null | undefined) =>
  el ? [...el.querySelectorAll<HTMLElement>(`.${INLINE_MATH_CLASS}`)] : [];

/**
 * The field that owns a formula's text when it is not the editor's own
 * paragraph: a table cell, a callout's title or body. Such a field commits
 * itself on `input` (the inline formats' route, `formatInlineField`); read
 * back as the whole block it would write the cell's or title's text wrong.
 */
const ownField = (atom: HTMLElement): HTMLElement | null => {
  const field = atom.parentElement?.closest<HTMLElement>('[contenteditable="true"]');
  return field && !field.hasAttribute("data-editor") ? field : null;
};

/**
 * An inline formula's source, under it. The formula stays in the sentence and
 * redraws as the source changes: each input writes the element's `data-math`
 * and reads the block back, the editor's rule for a programmatic text edit
 * (no repaint). Enter does nothing (a formula in a line is one line);
 * Shift+Enter, Escape, Done or a click away finishes with the caret after the
 * formula; ← at the source's start and → at its end step out before or after
 * it. `data-note-field`: Cmd+Z here is the note's undo, every other key the
 * field's.
 */
export default function InlineMathPanel({ target, blockRefs, syncGen, reRead, onClose }: Props) {
  const { theme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const tip = useTooltip();
  useExitGhost(panelRef);

  const block = () => blockRefs.current[target.blockId] ?? null;
  const atom = () => atomsIn(block())[target.index] ?? null;

  const [anchor, setAnchor] = useState(() => {
    const a = atom();
    return a ? rectAnchor(a) : null;
  });
  const pos = useMenuPosition(panelRef, true, anchor, { gapY: 6 });
  const zoom = cssZoom(document.documentElement) || 1;
  const columnWidth = (block()?.getBoundingClientRect().width ?? 420) / zoom;

  const fit = useCallback(() => {
    const ta = fieldRef.current;
    if (!ta) return;
    ta.style.width = `calc(${Math.max(12, ta.value.length + 1)}ch + 28px)`;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  // Marked while open; the mark goes with the panel. Painted from the
  // formula's own source, on open and after an undo or redo repaints it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the generation is the signal
  useLayoutEffect(() => {
    const a = atom();
    const ta = fieldRef.current;
    if (!a || !ta) {
      onClose();
      return;
    }
    a.setAttribute("data-editing", "");
    if (ta.value !== (a.getAttribute("data-math") ?? "")) {
      ta.value = a.getAttribute("data-math") ?? "";
      fit();
    }
    setAnchor(rectAnchor(a));
    return () => a.removeAttribute("data-editing");
  }, [syncGen]);

  // Opened with the caret at the end of the source.
  useLayoutEffect(() => {
    const ta = fieldRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    ta.selectionStart = ta.selectionEnd = ta.value.length;
    fit();
  }, [fit]);

  // The note scrolls under a fixed panel: follow the formula.
  // biome-ignore lint/correctness/useExhaustiveDependencies: atom() reads the live block
  useEffect(() => {
    const scroller = document.querySelector(".editor-scroll");
    const follow = () => {
      const a = atom();
      if (a) setAnchor(rectAnchor(a));
    };
    scroller?.addEventListener("scroll", follow, { passive: true });
    return () => scroller?.removeEventListener("scroll", follow);
  }, []);

  // A press anywhere else closes, and lands where it was aimed.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  /** The formula's text, committed by whoever owns it: its field, or the block read back. */
  const commit = (anchor: Node, field: HTMLElement | null) => {
    if (field) field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    else reRead({ rangeCount: 1, anchorNode: anchor });
  };

  /** Close with the caret before or after the formula; an emptied one goes. */
  const finish = (side: "before" | "after") => {
    const a = atom();
    onClose();
    if (!a?.parentNode) return;
    const field = ownField(a);
    // The caret's own root: the field, or the block's text.
    const el = field ?? block();
    if (!el) return;
    const at = caretOffsetAt(el, a.parentNode, [...a.parentNode.childNodes].indexOf(a));
    if (!(a.getAttribute("data-math") ?? "").trim()) {
      a.remove();
      commit(el, field);
      placeCaret(el, at);
      return;
    }
    placeCaret(el, side === "after" ? at + 1 : at);
  };

  const onInput = () => {
    const a = atom();
    const ta = fieldRef.current;
    if (!a || !ta) return;
    fit();
    a.setAttribute("data-math", ta.value);
    drawAtom(a);
    commit(a, ownField(a));
    setAnchor(rectAnchor(a));
  };

  const latex = useLatexCompletion(fieldRef, onInput);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const k = e.key.toLowerCase();
    // Undo and redo are the note's (useAppKeyboard); every other key is the field's.
    if ((e.metaKey || e.ctrlKey) && (k === "z" || k === "y")) return;
    e.stopPropagation();
    // The `\` menu first, while it is offering.
    if (latex.onKeyDown(e)) return;
    const collapsed = ta.selectionStart === ta.selectionEnd;
    if (e.key === "Escape" || (e.key === "Enter" && e.shiftKey)) {
      e.preventDefault();
      finish("after");
    } else if (e.key === "Enter") {
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && collapsed && !e.shiftKey && ta.selectionStart === 0) {
      e.preventDefault();
      finish("before");
    } else if (
      e.key === "ArrowRight" &&
      collapsed &&
      !e.shiftKey &&
      ta.selectionEnd === ta.value.length
    ) {
      e.preventDefault();
      finish("after");
    }
  };

  return createPortal(
    <div
      ref={panelRef}
      className="motion-pop inline-math-source"
      data-note-field=""
      role="group"
      aria-label="Formula"
      style={{
        position: "fixed",
        zIndex: Z.CONTEXT_MENU,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        maxWidth: columnWidth,
        display: "flex",
        alignItems: "flex-start",
        background: theme.BG.elevated,
        border: `1px solid ${theme.BG.divider}`,
        borderRadius: MENU_RADIUS,
        boxShadow: theme.modalShadow,
      }}
    >
      <textarea
        ref={fieldRef}
        aria-label="Formula source"
        placeholder={"Try x^2 or \\frac{a}{b}"}
        rows={1}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        onInput={() => {
          onInput();
          latex.refresh();
        }}
        onSelect={latex.refresh}
        onKeyDown={onKeyDown}
        style={{
          flex: "0 1 auto",
          minWidth: 0,
          maxWidth: "100%",
          border: 0,
          outline: "none",
          resize: "none",
          overflow: "hidden",
          background: "transparent",
          color: theme.TEXT.primary,
          font: `13.5px/1.6 ${MONO}`,
          padding: "10px 14px",
          margin: 0,
        }}
      />
      <button
        ref={doneRef}
        type="button"
        className="settings-button math-done"
        aria-keyshortcuts="Shift+Enter"
        {...tip.handlers}
        onMouseDown={(e) => {
          e.preventDefault();
          tip.handlers.onMouseDown();
        }}
        onClick={() => finish("after")}
        style={{
          flex: "none",
          height: 28,
          margin: "7px 6px 6px 0",
          padding: "0 10px",
          borderRadius: 8,
          border: `1px solid ${theme.button.border}`,
          background: theme.button.bg,
          color: theme.TEXT.primary,
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        Done
      </button>
      {tip.shown && <Tooltip label="Done" shortcut={SHIFT_ENTER} anchor={doneRef.current} />}
      <LatexMenu completion={latex} />
    </div>,
    document.body,
  );
}
