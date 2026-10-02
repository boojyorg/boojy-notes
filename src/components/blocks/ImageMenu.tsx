import { useCallback } from "react";
import { isMac } from "../../utils/platform";
import { CopyIcon, ExpandIcon, FolderIcon, RestoreIcon, TrashIcon } from "../Icons";
import Menu, { type MenuAnchor, type MenuItem } from "../Menu";

export type { MenuAnchor };

interface ImageMenuProps {
  /** Viewport rect: the pointer (a point) for a right-click, the ··· button for the bar. */
  anchor: MenuAnchor;
  /** The bar's ··· sits at the picture's right edge, so the menu's right edge meets it. */
  fromBar: boolean;
  /** Other rows in place of the image's own (a missing attachment's), with their label. */
  entries?: MenuItem[];
  label?: string;
  onView?: () => void;
  onCopy?: () => void;
  /** Desktop only: the web build has no folder to show. */
  onShowInFolder?: () => void;
  /** Only while the picture carries a width set by hand. */
  onOriginalSize?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

const noop = () => {};

/**
 * An image's menu, from a right-click on the picture or the hover bar's ···:
 * the shared menu (`Menu`), sentence-case labels with a Lucide glyph each,
 * Delete last under a rule and in the error ink.
 */
export default function ImageMenu({
  anchor,
  fromBar,
  entries,
  label = "Image options",
  onView,
  onCopy,
  onShowInFolder,
  onOriginalSize,
  onDelete,
  onClose,
}: ImageMenuProps) {
  const act = useCallback(
    (fn: () => void) => () => {
      onClose();
      fn();
    },
    [onClose],
  );

  const items: MenuItem[] = entries
    ? entries.map((e) => ({ ...e, action: act(e.action) }))
    : [
        { label: "View full size", icon: <ExpandIcon nav />, action: act(onView ?? noop) },
        { label: "Copy image", icon: <CopyIcon />, action: act(onCopy ?? noop) },
      ];
  if (!entries && onShowInFolder) {
    items.push({
      label: isMac ? "Show in Finder" : "Show in folder",
      icon: <FolderIcon />,
      action: act(onShowInFolder),
    });
  }
  if (!entries && onOriginalSize) {
    items.push({ label: "Original size", icon: <RestoreIcon />, action: act(onOriginalSize) });
  }
  if (!entries)
    items.push({
      label: "Delete",
      icon: <TrashIcon />,
      action: act(onDelete ?? noop),
      danger: true,
      rule: true,
    });

  return (
    <Menu
      label={label}
      idPrefix="image-menu-item"
      className="image-context-menu"
      anchor={anchor}
      gapY={fromBar ? 4 : undefined}
      align={fromBar ? "end" : undefined}
      minWidth={180}
      onClose={onClose}
      items={items}
    />
  );
}
