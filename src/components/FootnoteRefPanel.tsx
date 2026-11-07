import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useExitGhost } from "../hooks/useExitGhost";
import { caretOffsetAt, placeCaret } from "../utils/domHelpers";
import { FOOTNOTE_REF_CLASS, FOOTNOTE_SRC_CLASS } from "../utils/footnotes";
import { MENU_RADIUS, TOUCH } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { isPhone } from "../utils/platform";
import { rectAnchor } from "./Menu";

/** Which reference is open: the nth in its block, found again after a repaint. */
export interface FootnoteRefTarget {
  blockId: string;
  index: number;
}

interface Props {
  target: FootnoteRefTarget;
  blockRefs: { current: Record<string, HTMLElement | null> };
  /** What the label points at, for the line under the field (`describeFootnote`). */
  describe: (label: string) => { label: string; missing?: boolean; sub?: string };
  /** Read a block back from the DOM and commit it at the text grain. */
  reRead: (sel: { rangeCount: number; anchorNode: Node }) => void;
  onClose: () => void;
}

/** A label as both readers take it: no whitespace, no `]`, never empty. */
const validLabel = (s: string) => /^[^\]\s]+$/.test(s);

const refsIn = (el: HTMLElement | null | undefined) =>
  el ? [...el.querySelectorAll<HTMLElement>(`.${FOOTNOTE_REF_CLASS}`)] : [];

/**
 * A sealed footnote reference's label, under it: which footnote it
 * points to. Each valid input rewrites the reference's source and reads the
 * block back (the editor's rule for a programmatic text edit); the line
 * under the field says what that label reaches. Enter, Escape, Done or a
 * press elsewhere closes, the caret after the reference. The phone reaches it
 * from a hold's menu; its field is a touch target and brings the keyboard.
 */
export default function FootnoteRefPanel({ target, blockRefs, describe, reRead, onClose }: Props) {
  const { theme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  useExitGhost(panelRef);

  const block = () => blockRefs.current[target.blockId] ?? null;
  const ref = () => refsIn(block())[target.index] ?? null;

  const [label, setLabel] = useState(() => ref()?.getAttribute("data-fn") ?? "");
  const [anchor, setAnchor] = useState(() => {
    const r = ref();
    return r ? rectAnchor(r) : null;
  });
  const pos = useMenuPosition(panelRef, true, anchor, { gapY: 6 });

  // Opened with the label selected, ready to retype.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on open
  useLayoutEffect(() => {
    const r = ref();
    if (!r) {
      onClose();
      return;
    }
    r.setAttribute("data-editing", "");
    fieldRef.current?.focus({ preventScroll: true });
    fieldRef.current?.select();
    return () => r.removeAttribute("data-editing");
  }, []);

  // A press anywhere else closes.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const finish = () => {
    const r = ref();
    onClose();
    const el = block();
    if (!r?.parentNode || !el) return;
    const at = caretOffsetAt(el, r.parentNode, [...r.parentNode.childNodes].indexOf(r));
    placeCaret(el, at + 1);
  };

  const onInput = (value: string) => {
    setLabel(value);
    const r = ref();
    if (!r || !validLabel(value)) return;
    r.setAttribute("data-fn", value);
    const src = r.querySelector(`.${FOOTNOTE_SRC_CLASS}`);
    if (src) src.textContent = `[^${value}]`;
    reRead({ rangeCount: 1, anchorNode: r });
    setAnchor(rectAnchor(r));
  };

  const valid = validLabel(label);
  const reaches = valid ? describe(label) : null;
  const h = isPhone ? TOUCH : 32;

  return createPortal(
    <div
      ref={panelRef}
      className="motion-pop footnote-ref-panel"
      data-note-field=""
      role="group"
      aria-label="Footnote reference"
      style={{
        position: "fixed",
        zIndex: Z.CONTEXT_MENU,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: 280,
        maxWidth: "calc(100vw - 32px)",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: theme.BG.elevated,
        border: `1px solid ${theme.BG.divider}`,
        borderRadius: MENU_RADIUS,
        boxShadow: theme.modalShadow,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: theme.TEXT.muted, fontSize: 13 }}>[^</span>
        <input
          ref={fieldRef}
          aria-label="Footnote label"
          value={label}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => onInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            const k = e.key.toLowerCase();
            if ((e.metaKey || e.ctrlKey) && (k === "z" || k === "y")) return;
            e.stopPropagation();
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              finish();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            height: h,
            padding: "0 8px",
            border: `1px solid ${theme.BG.divider}`,
            borderRadius: 6,
            outline: "none",
            background: "transparent",
            color: theme.TEXT.primary,
            font: "13.5px 'SF Mono', 'Fira Code', monospace",
          }}
        />
        <span style={{ color: theme.TEXT.muted, fontSize: 13 }}>]</span>
        <button
          type="button"
          className="settings-button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={finish}
          style={{
            height: h,
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
      </div>
      <div
        data-testid="footnote-ref-reaches"
        style={{
          fontSize: 12.5,
          lineHeight: "17px",
          color: reaches && !reaches.missing ? theme.TEXT.secondary : theme.TEXT.muted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          padding: "0 2px",
        }}
      >
        {!valid
          ? "A label has no spaces"
          : reaches?.missing
            ? "No footnote by this label yet"
            : reaches?.sub === "empty footnote"
              ? "An empty footnote"
              : reaches?.label.split("\n")[0]}
      </div>
    </div>,
    document.body,
  );
}
