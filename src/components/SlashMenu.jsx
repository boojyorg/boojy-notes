import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { SLASH_COMMANDS } from "../constants/data";

export default function SlashMenu({ slashMenu, setSlashMenu, executeSlashCommand }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  if (!slashMenu) return null;

  const filtered = SLASH_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(slashMenu.filter.toLowerCase()),
  );

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: Z.MENU_BACKDROP }}
        onMouseDown={() => setSlashMenu(null)}
      />
      <div
        role="menu"
        aria-label="Slash commands"
        style={{
          position: "fixed",
          top: slashMenu.rect.top,
          left: slashMenu.rect.left,
          zIndex: Z.DROPDOWN,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 10,
          padding: "6px 0",
          minWidth: 220,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          animation: "slideUp 0.12s ease",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "10px 16px", color: TEXT.muted, fontSize: 12 }}>
            No matching commands
          </div>
        ) : (
          filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              role="menuitem"
              aria-selected={i === slashMenu.selectedIndex}
              onClick={() => {
                executeSlashCommand(slashMenu.noteId, slashMenu.blockIndex, cmd);
                setSlashMenu(null);
              }}
              onMouseEnter={() =>
                setSlashMenu((prev) => (prev ? { ...prev, selectedIndex: i } : null))
              }
              style={{
                padding: "6px 12px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                background: i === slashMenu.selectedIndex ? BG.surface : "transparent",
                transition: "background 0.12s",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: BG.dark,
                  border: `1px solid ${BG.divider}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  color: TEXT.secondary,
                  flexShrink: 0,
                }}
              >
                {cmd.icon}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: TEXT.primary, flex: 1 }}>
                {cmd.label}
              </div>
              {cmd.desc && (
                <div
                  style={{
                    fontSize: 11,
                    color: TEXT.muted,
                    fontFamily: "monospace",
                    flexShrink: 0,
                  }}
                >
                  {cmd.desc}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
