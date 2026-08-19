import { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useSidebar } from "../context/SidebarContext";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";
import { spacing } from "../tokens/spacing";
import { radius } from "../tokens/radius";
import { fontSize, fontWeight } from "../tokens/typography";

/**
 * Recently Deleted — the user-facing surface over the existing trash
 * implementation, reached from the sidebar wordmark menu now that Trash has
 * no permanent sidebar row on desktop. Restore/permanent-delete/empty reuse
 * the same handlers the old sidebar section and context menu used.
 */
export default function RecentlyDeletedModal({
  open,
  onClose,
  restoreNote,
  permanentDeleteNote,
  emptyAllTrash,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, SEMANTIC } = theme;
  const { trashedNotes } = useSidebar();

  const modalRef = useRef(null);
  useFocusTrap(modalRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const entries = Object.values(trashedNotes);

  const smallButton = (danger) => ({
    background: "none",
    border: `1px solid ${theme.overlay(0.08)}`,
    borderRadius: radius.default,
    color: danger ? SEMANTIC.error : TEXT.secondary,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: "inherit",
    padding: "3px 10px",
    cursor: "pointer",
    flexShrink: 0,
    transition: "background 0.12s",
  });

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.SETTINGS,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Recently Deleted"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: Z.SETTINGS_INNER,
          width: 400,
          maxHeight: "min(480px, calc(100vh - 48px))",
          background: theme.modalBg,
          border: `1px solid ${theme.overlay(0.06)}`,
          borderRadius: radius.xl,
          boxShadow: theme.modalShadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.lg,
            position: "relative",
            borderBottom: `1px solid ${theme.overlay(0.06)}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.semibold, color: TEXT.primary }}
          >
            Recently Deleted
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: "absolute",
              right: spacing.md,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: radius.md,
              background: "none",
              border: "none",
              color: TEXT.muted,
              fontSize: fontSize.xl,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = TEXT.secondary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = TEXT.muted)}
          >
            {"✕"}
          </button>
        </div>

        {/* List */}
        <div style={{ overflowY: "auto", padding: `${spacing.sm}px 0` }}>
          {entries.length === 0 ? (
            <div
              style={{
                padding: `${spacing.xxl}px ${spacing.lg}px`,
                textAlign: "center",
                color: TEXT.muted,
                fontSize: fontSize.md,
              }}
            >
              Nothing here — deleted notes wait here until you remove them for good.
            </div>
          ) : (
            entries.map((tn) => {
              const daysAgo = Math.floor((Date.now() - tn.deletedAt) / (1000 * 60 * 60 * 24));
              const ageLabel = daysAgo === 0 ? "today" : `${daysAgo}d ago`;
              return (
                <div
                  key={tn.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: spacing.sm,
                    padding: `6px ${spacing.lg}px`,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontSize: fontSize.md,
                      color: TEXT.primary,
                    }}
                  >
                    {tn.title || "Untitled"}
                  </span>
                  <span style={{ fontSize: fontSize.xs, color: TEXT.muted, flexShrink: 0 }}>
                    {ageLabel}
                  </span>
                  <button
                    onClick={() => restoreNote(tn.id)}
                    style={smallButton(false)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = BG.surface)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => permanentDeleteNote(tn.id)}
                    aria-label={`Delete ${tn.title || "Untitled"} permanently`}
                    style={smallButton(true)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = BG.surface)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    Delete
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {entries.length > 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: `${spacing.sm}px ${spacing.lg}px ${spacing.lg}px`,
              borderTop: `1px solid ${theme.overlay(0.06)}`,
              flexShrink: 0,
            }}
          >
            <button
              onClick={emptyAllTrash}
              style={{ ...smallButton(true), marginTop: spacing.sm }}
              onMouseEnter={(e) => (e.currentTarget.style.background = BG.surface)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              Delete All
            </button>
          </div>
        )}
      </div>
    </>
  );
}
