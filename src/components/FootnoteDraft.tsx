import { type MutableRefObject, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useExitGhost } from "../hooks/useExitGhost";
import type { DraftRect, FootnoteDraft } from "../utils/footnoteDraft";
import { MENU_RADIUS, TOUCH } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { isPhone } from "../utils/platform";

/**
 * Under a `[^` typed where no footnote can go (a cell, a callout): says so,
 * muted, never focused, taking no key. Plain text on the page's ground, so
 * it reads as a remark, never as a control.
 */
export function FootnoteUnavailable({ rect, text }: { rect: DraftRect; text: string }) {
  const { theme } = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  const pos = useMenuPosition(ref, true, rect, { gapY: 4 });
  return createPortal(
    <div
      ref={ref}
      data-testid="footnote-unavailable"
      role="note"
      style={{
        position: "fixed",
        zIndex: Z.CONTEXT_MENU,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
        padding: "1px 2px",
        background: theme.BG.editor,
        color: theme.TEXT.muted,
        fontSize: 12,
        lineHeight: "18px",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>,
    document.body,
  );
}

interface PanelProps {
  draft: FootnoteDraft;
  number: number | undefined;
  draftText: MutableRefObject<string>;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * A new footnote's text, under its reference: Done or Enter writes it (with
 * its reference, if not typed) in one commit; Escape writes nothing; a press
 * elsewhere writes it if it holds text. Its title is what the note will show,
 * [n], the label beside it in grey when the label is not that number.
 */
export function FootnoteDraftPanel({ draft, number, draftText, onDone, onCancel }: PanelProps) {
  const { theme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  useExitGhost(panelRef);
  const pos = useMenuPosition(panelRef, true, draft.rect, { gapY: 6 });
  const h = isPhone ? TOUCH : 32;
  const label = draft.kind === "typed" ? draft.label : "";
  const showLabel = label && label !== String(number);

  useLayoutEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      onDone();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onDone]);

  return createPortal(
    <div
      ref={panelRef}
      className="motion-pop"
      data-note-field=""
      role="group"
      aria-label="New footnote"
      data-testid="footnote-draft"
      style={{
        position: "fixed",
        zIndex: Z.CONTEXT_MENU,
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: 300,
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
      <div
        data-testid="footnote-draft-title"
        style={{ fontSize: 12, lineHeight: "16px", color: theme.TEXT.secondary, padding: "0 2px" }}
      >
        New footnote [{number ?? "?"}]
        {showLabel && <span style={{ color: theme.TEXT.muted, marginLeft: 8 }}>{label}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input
          ref={fieldRef}
          aria-label="Footnote text"
          placeholder="Write the footnote…"
          spellCheck
          onChange={(e) => {
            draftText.current = e.currentTarget.value;
          }}
          onKeyDown={(e) => {
            // The field's editing keys are its own; the app's shortcuts (⌘P,
            // ⌘[) still reach the shell, and the note's undo stays the note's.
            const k = e.key.toLowerCase();
            if ((e.metaKey || e.ctrlKey) && !["a", "c", "v", "x"].includes(k)) return;
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              onDone();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
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
            fontSize: 13.5,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          className="settings-button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDone}
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
    </div>,
    document.body,
  );
}
