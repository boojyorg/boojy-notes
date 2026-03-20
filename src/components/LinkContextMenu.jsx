import { useEffect } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

function MenuItem({ label, onClick }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  return (
    <div
      onClick={onClick}
      style={{
        padding: "6px 12px",
        fontSize: 12,
        color: TEXT.primary,
        cursor: "pointer",
        borderRadius: 4,
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = BG.hover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {label}
    </div>
  );
}

export default function LinkContextMenu({
  position,
  linkType,
  url: _url,
  onOpen,
  onCopy,
  onEdit,
  onRemove,
  onCreate,
  onDismiss,
}) {
  const { theme } = useTheme();
  const { BG } = theme;

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onDismiss();
    };
    const handleClick = (e) => {
      if (!e.target.closest(".link-context-menu")) onDismiss();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onDismiss]);

  if (!position) return null;

  return (
    <div
      className="link-context-menu"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 8,
        padding: 4,
        minWidth: 180,
        zIndex: Z.CONTEXT_MENU,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        backdropFilter: "blur(12px)",
      }}
    >
      {linkType === "external" && (
        <>
          <MenuItem label="Open Link" onClick={onOpen} />
          <MenuItem label="Copy URL" onClick={onCopy} />
          <MenuItem label="Edit Link" onClick={onEdit} />
          <MenuItem label="Remove Link" onClick={onRemove} />
        </>
      )}
      {linkType === "wikilink" && (
        <>
          <MenuItem label="Open Note" onClick={onOpen} />
          <MenuItem label="Copy Note Title" onClick={onCopy} />
          <MenuItem label="Edit Link" onClick={onEdit} />
          <MenuItem label="Remove Link" onClick={onRemove} />
        </>
      )}
      {linkType === "wikilink-broken" && (
        <>
          <MenuItem label="Create Note" onClick={onCreate} />
          <MenuItem label="Edit Link" onClick={onEdit} />
          <MenuItem label="Remove Link" onClick={onRemove} />
        </>
      )}
    </div>
  );
}
