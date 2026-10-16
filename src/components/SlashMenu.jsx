import { useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { useExitGhost } from "../hooks/useExitGhost";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS, TOUCH } from "../constants/layout";
import { isPhone } from "../utils/platform";
import { filterSlashCommands } from "../constants/data";
import { cssZoom } from "../utils/domHelpers";
import { menuRoom } from "../phone/menuRoom";
import { SlashCommandIcon } from "./Icons";

/** Row height is icon (20) + 7px above and below; a touch target on the phone. */
const ICON_COL = 20;
const ROW_PAD_Y = isPhone ? (TOUCH - ICON_COL) / 2 : 7;
const MENU_WIDTH = 300;
/**
 * The typed-shortcut hint at the right of a row. Mono so `#`, `##`, `###` read
 * as syntax rather than a smudge; muted, and it stays muted on the selected row,
 * where only the glyph takes the accent. It is a footnote, never the choice.
 */
const HINT_FONT = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";
const HINT_SIZE = 12;

export default function SlashMenu({ slashMenu, setSlashMenu, executeSlashCommand }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef(null);
  useFocusTrap(menuRef, !!slashMenu);
  useExitGhost(menuRef, !!slashMenu);

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

  // The phone's room is the band between the note's header and the bar above
  // the keyboard: the menu takes its side of the line, up to four and a half
  // rows (the half says the list scrolls), and never covers either edge.
  const phone = isPhone ? phonePlace(slashMenu.rect) : null;

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: Z.MENU_BACKDROP }}
        onMouseDown={() => setSlashMenu(null)}
      />
      <div
        className="motion-pop"
        ref={menuRef}
        // A suggestion list under the caret, which keeps focus: a listbox of
        // options (a menuitem cannot be "selected"), the highlight announced
        // through aria-selected.
        role="listbox"
        aria-label="Slash commands"
        style={{
          position: "fixed",
          ...(phone
            ? {
                left: 12,
                right: 12,
                maxHeight: phone.height,
                overflowY: "auto",
                ...(phone.side === "below" ? { top: phone.top } : { bottom: phone.bottom }),
              }
            : {
                top: pos?.top ?? (slashMenu.rect.bottom ?? slashMenu.rect.top) + 4,
                left: pos?.left ?? slashMenu.rect.left,
              }),
          zIndex: Z.DROPDOWN,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          minWidth: phone ? undefined : MENU_WIDTH,
          boxShadow: theme.modalShadow,
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
                id={`slash-option-${i}`}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  executeSlashCommand(slashMenu.noteId, slashMenu.blockIndex, cmd);
                  setSlashMenu(null);
                }}
                onMouseMove={() =>
                  setSlashMenu((prev) =>
                    prev && prev.selectedIndex !== i ? { ...prev, selectedIndex: i } : prev,
                  )
                }
                style={{
                  // 8px inside the menu's 4px inset: the glyph keeps the 12px
                  // it had from the edge when the rows ran edge to edge.
                  padding: `${ROW_PAD_Y}px 8px`,
                  borderRadius: MENU_ROW_RADIUS,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  cursor: "pointer",
                  background: selected ? BG.hover : "transparent",
                  transition: "background var(--motion-fast)",
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
                    color: selected ? ACCENT.text : TEXT.muted,
                  }}
                >
                  <SlashCommandIcon name={cmd.icon} />
                </div>
                <div
                  style={{
                    fontSize: isPhone ? 15 : 13,
                    fontWeight: 500,
                    color: TEXT.primary,
                    flex: 1,
                  }}
                >
                  {cmd.label}
                </div>
                {cmd.hint ? (
                  <span
                    data-testid="slash-hint"
                    aria-hidden="true"
                    style={{
                      fontFamily: HINT_FONT,
                      fontSize: HINT_SIZE,
                      color: TEXT.muted,
                      flexShrink: 0,
                      whiteSpace: "pre",
                    }}
                  >
                    {cmd.hint}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/**
 * The phone's place for the menu, as styles: measured in the viewport's
 * pixels and divided by the UI scale, as every measured distance is.
 */
function phonePlace(rect) {
  const zoom = cssZoom(document.documentElement) || 1;
  const head = document.querySelector('[data-testid="note-path-row"]');
  const bar = document.querySelector('[data-testid="phone-key-bar"]');
  const gap = 4 * zoom;
  const lineBottom = rect.bottom ?? rect.top;
  const room = menuRoom({
    lineTop: rect.top,
    lineBottom,
    bandTop: head ? head.getBoundingClientRect().bottom : 0,
    bandBottom: bar ? bar.getBoundingClientRect().top : window.innerHeight,
    cap: (4.5 * TOUCH + 2 * MENU_PAD) * zoom,
    gap,
  });
  return {
    side: room.side,
    height: room.height / zoom,
    top: (lineBottom + gap) / zoom,
    bottom: (window.innerHeight - rect.top + gap) / zoom,
  };
}
