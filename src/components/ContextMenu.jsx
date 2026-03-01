import { BG, TEXT, SEMANTIC } from "../constants/colors";

const hBg = (el, c) => { el.style.background = c; };

export default function ContextMenu({
  ctxMenu, setCtxMenu,
  openNote, duplicateNote, deleteNote, deleteFolder, createNote,
  setRenamingFolder, restoreNote, permanentDeleteNote, titleRef,
}) {
  if (!ctxMenu) return null;

  const items = ctxMenu.type === "trash" ? [
    { label: "Restore", action: () => { restoreNote(ctxMenu.id); setCtxMenu(null); } },
    { label: "Delete permanently", action: () => { permanentDeleteNote(ctxMenu.id); setCtxMenu(null); }, danger: true },
  ] : ctxMenu.type === "note" ? [
    { label: "Rename", action: () => { openNote(ctxMenu.id); setCtxMenu(null); setTimeout(() => { if (titleRef.current) { titleRef.current.focus(); const sel = window.getSelection(); sel.selectAllChildren(titleRef.current); } }, 60); } },
    { label: "Duplicate", action: () => { duplicateNote(ctxMenu.id); setCtxMenu(null); } },
    { label: "Delete", action: () => { deleteNote(ctxMenu.id); setCtxMenu(null); }, danger: true },
  ] : [
    { label: "New note here", action: () => { createNote(ctxMenu.id); setCtxMenu(null); } },
    { label: "Rename", action: () => { setRenamingFolder(ctxMenu.id); setCtxMenu(null); } },
    { label: "Delete folder", action: () => { deleteFolder(ctxMenu.id); setCtxMenu(null); }, danger: true },
  ];

  return (
    <>
      <div onClick={() => setCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 250 }} />
      <div style={{
        position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 300,
        background: BG.elevated, border: `1px solid ${BG.divider}`,
        borderRadius: 8, padding: "4px 0", minWidth: 160,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        animation: "fadeIn 0.1s ease",
      }}>
        {items.map((item) => (
          <button key={item.label}
            onClick={item.action}
            style={{
              width: "100%", background: "none", border: "none",
              padding: "7px 14px", cursor: "pointer",
              color: item.danger ? SEMANTIC.error : TEXT.primary,
              fontSize: 12.5, fontFamily: "inherit", textAlign: "left",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => hBg(e.currentTarget, BG.surface)}
            onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
          >{item.label}</button>
        ))}
      </div>
    </>
  );
}
