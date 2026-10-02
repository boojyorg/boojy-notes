import { useTheme } from "../hooks/useTheme";
import { SLASH_COMMANDS } from "../constants/data";
import Menu, { type MenuAnchor, type MenuItem } from "./Menu";
import { shortcutLabel } from "./Tooltip";
import { ClipboardIcon, CopyIcon, SlashCommandIcon, TrashIcon, TurnIntoIcon } from "./Icons";

/** The kinds Turn into offers, by `/` menu id, in the menu bar's order. */
const TURN_INTO_IDS = ["text", "h1", "h2", "h3", "bullet", "numbered", "checkbox", "blockquote"];
export const TURN_INTO = TURN_INTO_IDS.map((id) => {
  const c = SLASH_COMMANDS.find((cmd) => cmd.id === id);
  if (!c) throw new Error(`no slash command ${id}`);
  return { type: c.type, label: c.label, icon: c.icon };
});
/** The text kinds a block can be turned from (H4–H6 included: they turn into the listed ones). */
export const TURNABLE = new Set([...TURN_INTO.map((k) => k.type), "h4", "h5", "h6"]);

/** A block kind's name, as the `/` menu says it (a paragraph is Text). */
export function kindLabel(type: string): string {
  return SLASH_COMMANDS.find((c) => c.type === type)?.label ?? "Block";
}

/** Air between the grip and the menu. */
const MENU_GAP = 4;

interface BlockMenuProps {
  /** Viewport rect of the grip (or where it stands): the menu opens beside it. */
  anchor: MenuAnchor;
  /** The selected blocks' types, in order. */
  types: string[];
  onTurnInto: (type: string) => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * The grip's menu (the gutter grip's click, a right-click on it, or Shift+F10
 * on a selection): what is selected, then Turn into, Duplicate, Copy and
 * Delete. Like the right-click menu it never takes focus (the editor keeps
 * it, so the caret and the selection stay put). The keys it shows work while
 * it is open. Turn into opens its kinds to the side (`Menu`'s submenu).
 */
export default function BlockMenu({
  anchor,
  types,
  onTurnInto,
  onDuplicate,
  onCopy,
  onDelete,
  onClose,
}: BlockMenuProps) {
  const { theme } = useTheme();
  // Beside the grip, never over the block it acts on: to its left, top edges
  // level (Notion's place), or to its right when the margin has no room.
  // Said to positionMenu as a line at the grip's top whose right end is the
  // grip's left side and whose left end is its right side: `align: "end"`
  // puts the menu's right edge on the first, and the flip takes the second.
  const side = {
    top: anchor.top,
    bottom: anchor.top,
    left: anchor.right + MENU_GAP,
    right: anchor.left - MENU_GAP,
  };

  const same = types.every((t) => t === types[0]) ? types[0] : null;
  const heading = types.length === 1 ? kindLabel(types[0]) : `${types.length} blocks`;

  const items: MenuItem[] = [];
  if (types.some((t) => TURNABLE.has(t))) {
    items.push({
      label: "Turn into",
      icon: <TurnIntoIcon />,
      submenu: TURN_INTO.map((kind) => ({
        label: kind.label,
        icon: <SlashCommandIcon name={kind.icon} />,
        role: "menuitemradio",
        checked: kind.type === same,
        action: () => onTurnInto(kind.type),
      })),
    });
  }
  items.push(
    // Copy before Duplicate, as in the note's ··· menu.
    { label: "Copy", icon: <ClipboardIcon />, action: onCopy, hint: shortcutLabel({ key: "C" }) },
    {
      label: "Duplicate",
      icon: <CopyIcon />,
      action: onDuplicate,
      hint: shortcutLabel({ key: "D" }),
    },
    { label: "Delete", icon: <TrashIcon />, action: onDelete, hint: "⌫", danger: true },
  );

  // The shortcuts the rows show, answered while the menu holds the keys.
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    const run =
      mod && !e.shiftKey && !e.altKey && e.code === "KeyD"
        ? onDuplicate
        : mod && !e.shiftKey && !e.altKey && e.code === "KeyC"
          ? onCopy
          : !mod && (e.key === "Backspace" || e.key === "Delete")
            ? onDelete
            : null;
    run?.();
    return !!run;
  };

  return (
    <Menu
      items={items}
      label="Block options"
      idPrefix="block-menu-item"
      anchor={side}
      align="end"
      onClose={onClose}
      minWidth={200}
      className="block-menu"
      takesFocus={false}
      onKey={onKey}
      selectionSurface
      header={
        <div
          aria-hidden="true"
          style={{
            padding: "5px 10px 4px",
            fontSize: 11.5,
            fontWeight: 500,
            color: theme.TEXT.muted,
          }}
        >
          {heading}
        </div>
      }
    />
  );
}
