import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

/**
 * Themed confirmation dialog for destructive/irreversible actions.
 * Driven by the Overlay context's `confirmState` + `resolveConfirm`.
 * Resolves the pending requestConfirm() promise with true (confirm) or false (cancel).
 *
 * confirm shape: { title, message, confirmLabel?, cancelLabel?, danger? }
 */
export default function ConfirmDialog({ confirm, accentColor, onConfirm, onCancel }) {
  const { theme } = useTheme();
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const danger = confirm?.danger;

  useEffect(() => {
    if (!confirm) return;
    // For destructive actions, focus Cancel by default (safer); otherwise focus Confirm.
    (danger ? cancelRef.current : confirmRef.current)?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [confirm, danger, onConfirm, onCancel]);

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
              color: "#fff",
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
