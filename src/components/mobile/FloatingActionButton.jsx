import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { PlusIcon } from "../Icons";

export default function FloatingActionButton({ onNewNote, onNewFolder }) {
  const { theme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menuOpen]);

  const handlePointerDown = () => {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setMenuOpen(true);
    }, 500);
  };

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current);
    if (!didLongPress.current && !menuOpen) {
      onNewNote();
    }
  };

  const handlePointerCancel = () => {
    clearTimeout(longPressTimer.current);
  };

  const menuItemStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    fontSize: 14,
    color: theme.TEXT.primary,
    background: "none",
    border: "none",
    cursor: "pointer",
    width: "100%",
    textAlign: "left",
    borderRadius: 8,
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        right: 16,
        zIndex: Z.FAB,
      }}
    >
      {menuOpen && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            bottom: 64,
            right: 0,
            background: theme.BG.standard,
            borderRadius: 12,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            border: `1px solid ${theme.BG.divider}`,
            padding: 4,
            minWidth: 160,
          }}
        >
          <button
            style={menuItemStyle}
            onClick={() => {
              setMenuOpen(false);
              onNewNote();
            }}
          >
            <span style={{ fontSize: 16 }}>📄</span> New Note
          </button>
          <button
            style={menuItemStyle}
            onClick={() => {
              setMenuOpen(false);
              onNewFolder();
            }}
          >
            <span style={{ fontSize: 16 }}>📁</span> New Folder
          </button>
        </div>
      )}

      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          background: theme.ACCENT.primary,
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          color: "#fff",
          touchAction: "none",
        }}
        aria-label="New note"
      >
        <PlusIcon size={24} />
      </button>
    </div>
  );
}
