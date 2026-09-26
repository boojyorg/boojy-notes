import { useEffect, useRef, useState } from "react";
import { type ToastKind, toastPersists } from "../hooks/useToast";
import { CloseIcon, ToastIcon } from "./Icons";

interface ToastTheme {
  BG: { elevated: string; divider: string; surface: string };
  TEXT: { primary: string; muted: string };
  ACCENT: { text: string };
  SEMANTIC: { error: string; warning: string };
  modalShadow: string;
}

interface ToastProps {
  message: string;
  kind?: ToastKind;
  icon?: string;
  onDismiss: () => void;
  theme: ToastTheme;
  /** Its words name something the user can name (a save point): click them to type one. */
  nameable?: boolean;
  editing?: boolean;
  onStartEditing?: () => void;
  onEndEditing?: (name: string | null) => void;
  /** Pointed at: a receipt waits rather than fading under the pointer. */
  onHold?: (held: boolean) => void;
  /** One thing it offers to do about what it reports (Undo), then it goes. */
  action?: { label: string; run: () => void };
}

/** The mark a kind carries when the message does not ask for its own. */
const KIND_GLYPH: Record<ToastKind, string> = {
  done: "check",
  notice: "info",
  warning: "warning",
  error: "error",
};

/**
 * What colour the mark is. The message itself is always the ordinary ink: the
 * meaning lives in one 16px glyph, not in a coloured slab (the info toast used
 * to be a 360px fill of the accent — the largest accent surface in the app,
 * against the rule that accent is never a desktop surface — with white text on
 * it at about 2:1; 2026-09-19).
 */
function markColour(kind: ToastKind, theme: ToastTheme): string {
  if (kind === "error") return theme.SEMANTIC.error;
  if (kind === "warning") return theme.SEMANTIC.warning;
  if (kind === "notice") return theme.ACCENT.text;
  return theme.TEXT.muted;
}

/**
 * One notification: the menus' own surface, a mark, a line of prose.
 *
 * A receipt (`done`) fades by itself and a click anywhere on it takes it away
 * early. Everything else stays until it is dismissed, so its own × is the way
 * out and the message can be selected and copied rather than being a click
 * target the user may not have finished reading.
 */
export default function Toast({
  message,
  kind = "error",
  icon,
  onDismiss,
  theme,
  nameable = false,
  editing = false,
  onStartEditing,
  onEndEditing,
  onHold,
  action,
}: ToastProps) {
  const persists = toastPersists(kind);
  const [hovered, setHovered] = useState(false);
  const [wordsHovered, setWordsHovered] = useState(false);
  const [draft, setDraft] = useState("");
  // Where the writing was when the name field took the keys, to put it back
  // exactly there (focused without scrolling the note) when the field closes.
  const returnTo = useRef<{ el: HTMLElement | null; range: Range | null } | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const sel = window.getSelection();
    returnTo.current = {
      el: document.activeElement as HTMLElement | null,
      range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null,
    };
    setDraft("");
    field.current?.focus({ preventScroll: true });
  }, [editing]);

  const endEditing = (name: string | null) => {
    // Enter moves focus back to the note, and that blur must not end it twice.
    const back = returnTo.current;
    if (!back) return;
    returnTo.current = null;
    onEndEditing?.(name);
    if (back?.el && document.contains(back.el)) {
      back.el.focus({ preventScroll: true });
      if (back.range) {
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(back.range);
      }
    }
  };

  return (
    <div
      onMouseEnter={() => onHold?.(true)}
      onMouseLeave={() => {
        if (!editing) onHold?.(false);
      }}
      // A receipt is news; anything waiting to be dismissed is worth
      // interrupting a screen reader for, and nothing else is.
      role={persists ? "alert" : "status"}
      aria-live={persists ? "assertive" : "polite"}
      data-toast-kind={kind}
      onClick={persists || nameable || action ? undefined : onDismiss}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        background: theme.BG.elevated,
        border: `1px solid ${theme.BG.divider}`,
        borderRadius: 12,
        padding: persists ? "10px 8px 10px 12px" : "10px 14px 10px 12px",
        color: theme.TEXT.primary,
        fontSize: 13,
        lineHeight: 1.45,
        maxWidth: 360,
        // The menus' own shadow, not the tooltip chip's none: a chip labels the
        // control it points at, while this floats free over the sheet — and in
        // Light the elevated ground *is* the sheet's white, so without it the
        // receipt was a hairline outline on white (judged live 2026-09-19).
        boxShadow: theme.modalShadow,
        cursor: persists || nameable || action ? "default" : "pointer",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "flex",
          alignItems: "center",
          // The mark sits on the first line's centre, whatever the message wraps to.
          height: `calc(13px * 1.45)`,
          flexShrink: 0,
          color: markColour(kind, theme),
        }}
      >
        <ToastIcon name={icon || KIND_GLYPH[kind]} />
      </span>
      {editing ? (
        <input
          ref={field}
          value={draft}
          placeholder="Name this save point"
          aria-label="Save point name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              endEditing(draft.trim() || null);
            } else if (e.key === "Escape") {
              e.preventDefault();
              endEditing(null);
            }
          }}
          onBlur={() => endEditing(draft.trim() || null)}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            font: "inherit",
            color: theme.TEXT.primary,
            width: 200,
            padding: 0,
          }}
        />
      ) : nameable ? (
        <button
          type="button"
          aria-label={`${message}. Name this save point`}
          onClick={onStartEditing}
          onMouseEnter={() => setWordsHovered(true)}
          onMouseLeave={() => setWordsHovered(false)}
          style={{
            border: "none",
            font: "inherit",
            color: "inherit",
            textAlign: "left",
            cursor: "text",
            padding: "0 4px",
            margin: "0 -4px",
            borderRadius: 4,
            background: wordsHovered ? theme.BG.surface : "transparent",
          }}
        >
          {message}
        </button>
      ) : (
        <span>{message}</span>
      )}
      {action && (
        <button
          type="button"
          onClick={() => {
            action.run();
            onDismiss();
          }}
          style={{
            border: "none",
            background: "transparent",
            font: "inherit",
            fontWeight: 600,
            color: theme.ACCENT.text,
            cursor: "pointer",
            padding: "0 4px",
            margin: "0 -4px 0 4px",
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          {action.label}
        </button>
      )}
      {persists && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 22,
            height: 22,
            marginTop: -1,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: hovered ? theme.BG.surface : "transparent",
            color: hovered ? theme.TEXT.primary : theme.TEXT.muted,
            cursor: "pointer",
            transition: "background 0.12s, color 0.12s",
          }}
        >
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}
