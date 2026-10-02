import { useMemo } from "react";
import type { VaultView } from "../utils/otherFiles";
import { AttachmentsIcon, OtherFileIcon, SettingsIcon, VaultIcon } from "./Icons";
import Menu, { type MenuAnchor, type MenuItem } from "./Menu";

/**
 * The storage-location menu, under the sidebar's location name (or ⌘O):
 * which location is open, and what the tree shows besides notes. A switcher
 * only: adding, removing and revealing a location are
 * Settings' (Manage storage locations…), because a location is added rarely
 * and switched often. Each row has its glyph and the Sort menu's grammar: a
 * chosen row carries the check on the right in the mark colour, a missing
 * location is muted and says so. Code calls a location a vault. The file
 * toggles are this location's own (a Drive folder full of PDFs can hide them
 * while another shows them).
 */

export interface VaultMenuEntry {
  path: string;
  name: string;
  current: boolean;
  exists: boolean;
  cloud: boolean;
}

interface VaultMenuProps {
  anchor: MenuAnchor;
  vaults: VaultMenuEntry[];
  view: VaultView;
  setView: (next: VaultView) => void;
  onSwitch: (path: string) => void;
  /** Settings, at the storage locations: where one is added, removed or revealed. */
  onManage: () => void;
  onClose: () => void;
  /** Opened by ⌘O: the open vault's row starts active, as a keyboard menu's first row does. */
  fromKeyboard?: boolean;
}

export default function VaultMenu({
  anchor,
  vaults,
  view,
  setView,
  onSwitch,
  onManage,
  onClose,
  fromKeyboard = false,
}: VaultMenuProps) {
  const items = useMemo<MenuItem[]>(
    () => [
      ...vaults.map(
        (v): MenuItem => ({
          testId: `vault-menu-vault:${v.path}`,
          label: v.name,
          role: "menuitemradio",
          icon: <VaultIcon cloud={v.cloud} missing={!v.exists} />,
          checked: v.current,
          disabled: !v.exists && !v.current,
          hint: v.exists ? undefined : "Not found",
          action: () => {
            onClose();
            if (!v.current) onSwitch(v.path);
          },
        }),
      ),
      {
        testId: "vault-menu-otherFiles",
        label: "Show other files",
        role: "menuitemcheckbox",
        icon: <OtherFileIcon />,
        checked: view.otherFiles,
        rule: true,
        action: () => setView({ ...view, otherFiles: !view.otherFiles }),
      },
      {
        testId: "vault-menu-attachments",
        label: "Show attachments",
        role: "menuitemcheckbox",
        icon: <AttachmentsIcon />,
        checked: view.attachments,
        action: () => setView({ ...view, attachments: !view.attachments }),
      },
      {
        testId: "vault-menu-manage",
        label: "Manage storage locations…",
        role: "menuitem",
        icon: <SettingsIcon />,
        rule: true,
        action: () => {
          onClose();
          onManage();
        },
      },
    ],
    [vaults, view, setView, onSwitch, onManage, onClose],
  );

  return (
    <Menu
      label="Storage location"
      idPrefix="vault-item"
      anchor={anchor}
      gapY={4}
      minWidth={220}
      maxWidth={320}
      // Opened by ⌘O: the open vault's row starts active, as a keyboard
      // menu's first row does.
      initialActive={
        fromKeyboard
          ? Math.max(
              0,
              vaults.findIndex((v) => v.current),
            )
          : -1
      }
      onClose={onClose}
      items={items}
    />
  );
}
