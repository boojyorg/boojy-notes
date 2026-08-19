import { useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { filterSlashCommands } from "../constants/data";
import { SlashCommandIcon } from "./Icons";

/** Row height is icon (20) + 7px above and below. */
const ROW_PAD_Y = 7;
const ICON_COL = 20;
const MENU_WIDTH = 300;

export default function SlashMenu({ slashMenu, setSlashMenu, executeSlashCommand }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef(null);
  useFocusTrap(menuRef, !!slashMenu);

  // Tier rule lives in filterSlashCommands so this list and the arrow-key list
  // in useKeyboardHandlers can never drift apart.
  const filtered = slashMenu ? filterSlashCommands(slashMenu.filter) : [];

  // rect is the slash block's rect; the menu opens 4px below it and flips
  // above it near the bottom of the viewport instead of running off-screen.
  const anchor = slashMenu
    ? {
        top: slashMenu.rect.top,
        bottom: slashMenu.rect.bottom ?? slashMenu.rect.top,
        left: slashMenu.rect.left,
        right: slashMenu.rect.right ?? slashMenu.rect.left,
      }
    : null;
  const pos = useMenuPosition(menuRef, !!slashMenu, anchor, {
    gapY: 4,
    reflowKey: filtered.length,
  });

  if (!slashMenu) return null;

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: Z.MENU_BACKDROP }}
        onMouseDown={() => setSlashMenu(null)}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Slash commands"
        style={{
          position: "fixed",
          top: pos?.top ?? (slashMenu.rect.bottom ?? slashMenu.rect.top) + 4,
          left: pos?.left ?? slashMenu.rect.left,
          zIndex: Z.DROPDOWN,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: 10,
          padding: "6px 0",
          minWidth: MENU_WIDTH,
          boxShadow: theme.modalShadow,
          animation: "slideUp 0.12s ease",
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: "10px 16px", color: TEXT.muted, fontSize: 12 }}>
            No matching commands
          </div>
        ) : (
          filtered.map((cmd, i) => {
            const selected = i === slashMenu.selectedIndex;
            return (
              <div
                key={cmd.id}
                role="menuitem"
                aria-selected={selected}
                onClick={() => {
                  executeSlashCommand(slashMenu.noteId, slashMenu.blockIndex, cmd);
                  setSlashMenu(null);
                }}
                onMouseEnter={() =>
                  setSlashMenu((prev) => (prev ? { ...prev, selectedIndex: i } : null))
                }
                style={{
                  padding: `${ROW_PAD_Y}px 12px`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  background: selected ? BG.hover : "transparent",
                  transition: "background 0.12s",
                }}
              >
                <div
                  style={{
                    width: ICON_COL,
                    height: ICON_COL,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: selected ? ACCENT.primary : TEXT.muted,
                  }}
                >
                  <SlashCommandIcon name={cmd.icon} />
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: TEXT.primary, flex: 1 }}>
                  {cmd.label}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
