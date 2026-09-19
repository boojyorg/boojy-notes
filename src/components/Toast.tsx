import { useState } from "react";
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
export default function Toast({ message, kind = "error", icon, onDismiss, theme }: ToastProps) {
  const persists = toastPersists(kind);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      // A receipt is news; anything waiting to be dismissed is worth
      // interrupting a screen reader for, and nothing else is.
      role={persists ? "alert" : "status"}
      aria-live={persists ? "assertive" : "polite"}
      data-toast-kind={kind}
      onClick={persists ? undefined : onDismiss}
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
        cursor: persists ? "default" : "pointer",
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
      <span>{message}</span>
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
