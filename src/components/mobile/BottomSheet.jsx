import { useEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";

/**
 * Mobile bottom sheet — slides up from bottom with dim overlay.
 * Tap overlay or swipe down to dismiss.
 */
export default function BottomSheet({ open, onClose, children }) {
  const { theme } = useTheme();
  const sheetRef = useRef(null);
  const startY = useRef(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e) => {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    // Swipe down by 60px → dismiss
    if (dy > 60) {
      startY.current = null;
      onClose();
    }
  };

  const handleTouchEnd = () => {
    startY.current = null;
  };

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: Z.BOTTOM_SHEET_OVERLAY,
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: theme.BG.standard,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          zIndex: Z.BOTTOM_SHEET,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          animation: "slideUpSheet 0.2s ease-out",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 6px" }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: theme.BG.divider,
            }}
          />
        </div>

        {children}
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes slideUpSheet {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
