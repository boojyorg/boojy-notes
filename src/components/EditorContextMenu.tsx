import Menu, { type MenuAnchor, type MenuItem } from "./Menu";
import { shortcutLabel } from "./Tooltip";
import {
  CopyIcon,
  CutIcon,
  OpenLinkIcon,
  OpenNoteIcon,
  PasteIcon,
  PencilIcon,
  TidyTableIcon,
  TrashIcon,
  UnlinkIcon,
} from "./Icons";

/** Air between the painted selection and the menu (more reads detached, none touching). */
const MENU_GAP = 2;

/** What was right-clicked, when it was a link. */
export type ContextLinkKind = "external" | "wikilink" | "wikilink-broken";

interface EditorContextMenuProps {
  /**
   * Viewport rect the menu hangs under: the line of the selection (or link)
   * under the pointer, so the menu opens below the words it acts on and
   * left-aligned with them, as a native text menu does; flipped above when
   * there is no room.
   */
  anchor: MenuAnchor;
  link: ContextLinkKind | null;
  onOpenLink: () => void;
  onCopyLink: () => void;
  onEditLink: () => void;
  onRemoveLink: () => void;
  /** Cut and Copy act on a selection; with only a caret there is nothing to take. */
  canCutCopy: boolean;
  /** Desktop only: a page cannot read the clipboard from a menu item. */
  canPaste: boolean;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  /** Given in a table cell whose columns are not lined up: lines them up. */
  onTidyTable?: () => void;
  /** Given in a table cell: the table's own last item, under a rule. */
  onDeleteTable?: () => void;
  onClose: () => void;
}

/**
 * The editor's right-click menu (Electron supplies none): a link's own actions
 * when the pointer is on a link, then Cut, Copy and Paste with their
 * shortcuts, as Notion's and every native text menu has.
 *
 * In a table cell it is the same menu, with Tidy table (only while its
 * columns are not lined up) and Delete table last under a rule:
 * the table's rows and columns are arranged from its grips (TableHandles),
 * and this is the one pointer path to removing the whole table.
 *
 * It never takes focus (`Menu`'s `takesFocus={false}`): the editor keeps it,
 * so the selection stays the ordinary blue a drag gives. A disabled row is
 * muted, is skipped by the arrows and does nothing on a click.
 */
export default function EditorContextMenu({
  anchor,
  link,
  onOpenLink,
  onCopyLink,
  onEditLink,
  onRemoveLink,
  canCutCopy,
  canPaste,
  onCut,
  onCopy,
  onPaste,
  onTidyTable,
  onDeleteTable,
  onClose,
}: EditorContextMenuProps) {
  const items: MenuItem[] = [];
  if (link === "external") {
    items.push(
      { label: "Open link", icon: <OpenLinkIcon />, action: onOpenLink },
      { label: "Copy link", icon: <CopyIcon />, action: onCopyLink },
      { label: "Edit link…", icon: <PencilIcon />, action: onEditLink },
      { label: "Remove link", icon: <UnlinkIcon />, action: onRemoveLink },
    );
  } else if (link === "wikilink") {
    items.push(
      { label: "Open note", icon: <OpenNoteIcon />, action: onOpenLink },
      { label: "Copy note name", icon: <CopyIcon />, action: onCopyLink },
      { label: "Edit link…", icon: <PencilIcon />, action: onEditLink },
      { label: "Remove link", icon: <UnlinkIcon />, action: onRemoveLink },
    );
  } else if (link === "wikilink-broken") {
    // A link that names no note, or two: the picker does the fixing.
    items.push(
      { label: "Fix link…", icon: <PencilIcon />, action: onEditLink },
      { label: "Remove link", icon: <UnlinkIcon />, action: onRemoveLink },
    );
  }
  items.push(
    {
      label: "Cut",
      icon: <CutIcon />,
      action: onCut,
      hint: shortcutLabel({ key: "X" }),
      disabled: !canCutCopy,
      rule: items.length > 0,
    },
    {
      label: "Copy",
      icon: <CopyIcon />,
      action: onCopy,
      hint: shortcutLabel({ key: "C" }),
      disabled: !canCutCopy,
    },
    {
      label: "Paste",
      icon: <PasteIcon />,
      action: onPaste,
      hint: shortcutLabel({ key: "V" }),
      disabled: !canPaste,
    },
  );
  if (onTidyTable) {
    items.push({ label: "Tidy table", icon: <TidyTableIcon />, action: onTidyTable, rule: true });
  }
  if (onDeleteTable) {
    items.push({
      label: "Delete table",
      icon: <TrashIcon />,
      action: onDeleteTable,
      rule: !onTidyTable,
      danger: true,
    });
  }

  return (
    <Menu
      items={items}
      label={link ? "Link options" : "Edit"}
      idPrefix="editor-menu-item"
      anchor={anchor}
      gapY={MENU_GAP}
      onClose={onClose}
      minWidth={200}
      className="editor-context-menu"
      takesFocus={false}
    />
  );
}
