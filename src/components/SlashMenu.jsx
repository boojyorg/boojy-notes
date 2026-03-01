import { BG, TEXT } from "../constants/colors";
import { SLASH_COMMANDS } from "../constants/data";

export default function SlashMenu({ slashMenu, setSlashMenu, executeSlashCommand }) {
  if (!slashMenu) return null;

  const filtered = SLASH_COMMANDS.filter(c =>
    c.label.toLowerCase().includes(slashMenu.filter.toLowerCase())
  );

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 199 }}
           onMouseDown={() => setSlashMenu(null)} />
      <div style={{
        position: "fixed",
        top: slashMenu.rect.top,
        left: slashMenu.rect.left,
        zIndex: 200,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: 10,
        padding: "6px 0",
        minWidth: 220,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        animation: "slideUp 0.12s ease",
      }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "10px 16px", color: TEXT.muted, fontSize: 12 }}>
            No matching commands
          </div>
        ) : (
          filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => {
                executeSlashCommand(slashMenu.noteId, slashMenu.blockIndex, cmd);
                setSlashMenu(null);
              }}
              onMouseEnter={() => setSlashMenu(prev => prev ? { ...prev, selectedIndex: i } : null)}
              style={{
                padding: "8px 14px",
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer",
                background: i === slashMenu.selectedIndex ? BG.surface : "transparent",
                transition: "background 0.12s",
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 6,
                background: BG.dark, border: `1px solid ${BG.divider}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, color: TEXT.secondary,
              }}>
                {cmd.icon}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXT.primary }}>{cmd.label}</div>
                <div style={{ fontSize: 11, color: TEXT.muted }}>{cmd.desc}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
