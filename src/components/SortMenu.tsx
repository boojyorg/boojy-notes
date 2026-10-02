import { SORT_ALPHA, SORT_RECENT } from "../utils/noteSort";
import { ClockIcon, SortAlphaIcon } from "./Icons";
import Menu, { type MenuAnchor } from "./Menu";

/**
 * The Notes row's Sort menu: two radio items, the chosen one ticked.
 * Folders are always first and alphabetical; the choice orders notes alone,
 * at the root and inside every folder.
 *
 * Deliberately absent: "Collapse all folders" (folders toggle on click and
 * stay as left across launches). The vault's own items (switching, what the
 * tree shows besides notes) are the vault menu's, under the vault's name
 * (`VaultMenu`): Sort orders the list, it never filters it.
 */

interface SortMenuProps {
  /** Anchor rect of the Sort button (viewport coordinates). */
  anchor: MenuAnchor;
  sortMode: string;
  setSortMode: (mode: string) => void;
  onClose: () => void;
}

const MODES = [
  { label: "Most recent", mode: SORT_RECENT, icon: <ClockIcon /> },
  { label: "Alphabetical", mode: SORT_ALPHA, icon: <SortAlphaIcon /> },
];

export default function SortMenu({ anchor, sortMode, setSortMode, onClose }: SortMenuProps) {
  return (
    <Menu
      label="Sort notes"
      idPrefix="sort-item"
      anchor={anchor}
      gapY={4}
      minWidth={200}
      checkTestId="sort-check"
      onClose={onClose}
      items={MODES.map(({ label, mode, icon }) => ({
        label,
        icon,
        role: "menuitemradio",
        checked: sortMode === mode,
        action: () => {
          setSortMode(mode);
          onClose();
        },
      }))}
    />
  );
}
