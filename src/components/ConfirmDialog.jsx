import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";

/**
 * Themed confirmation dialog for destructive/irreversible actions.
 * Driven by the Overlay context's `confirmState` + `resolveConfirm`.
 * Resolves the pending requestConfirm() promise with true (confirm) or false (cancel).
 *
 * confirm shape: { title, message, confirmLabel?, cancelLabel?, danger? }
 *
 * Enter activates the focused button, natively (review 2026-09-07, §4.1): a
 * destructive dialog opens with Cancel focused, so Enter cancels until the
 * user Tabs to the other button; a plain one opens on Confirm. Before this a
 * window listener confirmed on any Enter, whatever held focus, so the
 * "safer" default was no protection at all. The dialog takes only Escape.
 * Focus is placed once per dialog and Tab stays inside it.
 */
export default function ConfirmDialog({ confirm, accentColor, onConfirm, onCancel }) {
  const { theme } = useTheme();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const danger = confirm?.danger;
  // The callbacks are fresh arrows every render; read through a ref so the
  // effect below runs once per dialog rather than refocusing the default
  // button on every app re-render (a toast expiring undid a Tab).
  const handlers = useRef({ onConfirm, onCancel });
  handlers.current = { onConfirm, onCancel };

  useFocusTrap(dialogRef, !!confirm);

  useEffect(() => {
    if (!confirm) return;
    // For destructive actions, focus Cancel by default (safer); otherwise focus Confirm.
    (danger ? cancelRef.current : confirmRef.current)?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handlers.current.onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirm, danger]);

  if (!confirm) return null;

  const confirmBg = danger ? theme.SEMANTIC.error : accentColor;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: Z.CONFIRM,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 0.15s ease",
      }}
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={confirm.title || "Confirm"}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: theme.modalBg,
          borderRadius: 14,
          padding: "28px 32px",
          boxShadow: theme.modalShadow,
          maxWidth: 400,
          width: "90%",
          textAlign: "center",
        }}
      >
        <h3
          style={{
            margin: "0 0 10px",
            fontSize: 17,
            fontWeight: 600,
            color: theme.TEXT.primary,
          }}
        >
          {confirm.title || "Are you sure?"}
        </h3>
        {confirm.message && (
          <p
            style={{
              margin: "0 0 22px",
              fontSize: 14,
              color: theme.TEXT.secondary,
              lineHeight: 1.5,
            }}
          >
            {confirm.message}
          </p>
        )}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: `1px solid ${theme.BG.divider}`,
              background: "transparent",
              color: theme.TEXT.secondary,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirm.cancelLabel || "Cancel"}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              padding: "8px 20px",
              borderRadius: 8,
              border: "none",
              background: confirmBg,
              // danger uses SEMANTIC.error (dark in both themes); accent needs the themed pair
              color: danger ? "#fff" : theme.ACCENT.onAccent,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confirm.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
