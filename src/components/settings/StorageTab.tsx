import {
  type ComponentType,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTheme } from "../../hooks/useTheme";
import {
  CheckIcon,
  CloseIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RevealIcon,
  SwitchIcon,
  VaultIcon,
} from "../Icons";
import Menu, { type MenuAnchor, type MenuItem } from "../Menu";
import { Tooltip, useTooltip } from "../Tooltip";
import { locationPath, type StorageLocation as VaultEntry } from "../../utils/storageLocations";
import { SHOW_IN_FOLDER_LABEL, SmallButton } from "./SettingsPrimitives";

/**
 * Settings → Storage locations: one row per location, A–Z (the main process
 * sorts). A row is its glyph (a folder on this Mac, a cloud for a synced one,
 * a crossed folder for one not found), its name, where it is, muted, cut in
 * the middle so both the place and the folder's own name stay, then the tick
 * on the open one in its own column, and ··· on hover or focus. A click on a
 * row switches to it, as the sidebar's menu does (the menu's Switch to is the
 * keyboard's way: a row holding the ··· cannot itself be a button). The ··· (or a
 * right-click) opens Switch to, Rename…, Show in Finder, Remove from list…;
 * an action that cannot work on a row is left out, never greyed. Rename is
 * the name in the app alone (electron/vaults.ts); the folder keeps its own.
 * Code calls a location a vault.
 */

interface StorageTabProps {
  isDesktop: boolean;
  SectionHeader: ComponentType<{ title: string }>;
  vaults?: VaultEntry[];
  switchVault?: (dir: string) => void;
  addVault?: () => void;
  forgetVault?: (vault: VaultEntry) => void;
  renameVault?: (dir: string, name: string) => Promise<void> | void;
  revealVault?: (dir: string) => void;
}

/** The path, split so the middle is cut: where it lives, then its folder. */
function splitPath(dir: string) {
  const shown = locationPath(dir);
  const cut = Math.max(shown.lastIndexOf("/"), shown.lastIndexOf("\\"));
  return cut <= 0
    ? { head: "", tail: shown }
    : { head: shown.slice(0, cut), tail: shown.slice(cut) };
}

interface RowProps {
  v: VaultEntry;
  editing: boolean;
  menuOpen: boolean;
  onMenu: (v: VaultEntry, anchor: MenuAnchor, keyboard: boolean) => void;
  /** Present only where a click can switch: not the open one, not a missing one. */
  onSwitch?: () => void;
  /** `byKey`: Enter or Escape, after which the keyboard stays with the row. */
  onRename: (v: VaultEntry, name: string | null, byKey: boolean) => void;
  moreRef: (el: HTMLButtonElement | null) => void;
}

function LocationRow({ v, editing, menuOpen, onMenu, onSwitch, onRename, moreRef }: RowProps) {
  const { theme } = useTheme();
  const { TEXT, ACCENT, BG } = theme;
  const missing = !v.exists;
  const { head, tail } = splitPath(v.path);
  const headRef = useRef<HTMLSpanElement>(null);
  const pathRef = useRef<HTMLSpanElement>(null);
  const tip = useTooltip();
  const [cut, setCut] = useState(false);

  // Enter, Escape and the blur that follows either end the edit once.
  const ended = useRef(false);
  useEffect(() => {
    if (editing) ended.current = false;
  }, [editing]);
  const end = (name: string | null, byKey: boolean) => {
    if (ended.current) return;
    ended.current = true;
    onRename(v, name, byKey);
  };

  const openFromButton = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    // A click with no pointer (Enter or Space on the button) starts on a row.
    onMenu(v, { top: r.top, bottom: r.bottom, left: r.left, right: r.right }, e.detail === 0);
  };

  return (
    <div
      role="listitem"
      className={`settings-location${menuOpen ? " is-open" : ""}`}
      data-testid="settings-location-row"
      data-location-path={v.path}
      aria-label={`${v.name}, ${missing ? "not found" : locationPath(v.path)}${v.current ? ", in use" : ""}`}
      onClick={(e) => {
        // The ··· and the rename field are their own controls.
        if (editing || (e.target as Element).closest("button, input")) return;
        onSwitch?.();
      }}
      style={{ cursor: onSwitch && !editing ? "pointer" : undefined }}
      onContextMenu={(e) => {
        if (editing) return;
        e.preventDefault();
        onMenu(v, { top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX }, false);
      }}
    >
      <span className="settings-location-glyph" style={{ color: TEXT.muted, display: "flex" }}>
        <VaultIcon cloud={v.cloud} missing={missing} />
      </span>
      {editing ? (
        <>
          <input
            autoFocus
            className="settings-location-field"
            aria-label={`Name for ${v.folderName} in Boojy Notes`}
            defaultValue={v.name}
            placeholder={v.folderName}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                end(e.currentTarget.value, true);
              } else if (e.key === "Escape") {
                // The field's key: Settings stays open.
                e.preventDefault();
                e.stopPropagation();
                end(null, true);
              }
            }}
            onBlur={(e) => end(e.currentTarget.value, false)}
            style={{
              minWidth: 0,
              width: 160,
              height: 26,
              boxSizing: "border-box",
              margin: "0 0 0 -7px",
              padding: "0 6px",
              border: `1px solid ${BG.divider}`,
              borderRadius: 6,
              background: BG.editor,
              color: TEXT.primary,
              font: "inherit",
              fontSize: 14,
            }}
          />
          <span className="settings-location-path" style={{ color: TEXT.muted }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              The folder on disk keeps its name.
            </span>
          </span>
        </>
      ) : (
        <>
          <span
            className="settings-location-name"
            style={{ color: missing ? TEXT.muted : TEXT.primary }}
          >
            {v.name}
          </span>
          <span
            ref={pathRef}
            className="settings-location-path"
            style={{ color: TEXT.muted }}
            onMouseEnter={() => {
              const h = headRef.current;
              setCut(!!h && h.scrollWidth > h.clientWidth);
              tip.handlers.onMouseEnter?.();
            }}
            onMouseLeave={tip.handlers.onMouseLeave}
          >
            <span ref={headRef} style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {head}
            </span>
            <span style={{ flex: "none" }}>{tail}</span>
            {missing && <span style={{ flex: "none" }}>&nbsp;· Not found</span>}
          </span>
          {tip.shown && cut && (
            <Tooltip label={locationPath(v.path)} anchor={pathRef.current} placement="below" />
          )}
        </>
      )}
      <span
        style={{ display: "flex", color: ACCENT.primary }}
        data-testid={v.current ? "location-current" : undefined}
      >
        {v.current && <CheckIcon />}
      </span>
      <button
        ref={moreRef}
        type="button"
        className="settings-location-more"
        aria-label={`${v.name} options`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        hidden={editing}
        onClick={openFromButton}
        style={{ color: menuOpen ? TEXT.primary : undefined }}
      >
        <MoreHorizontalIcon size={16} />
      </button>
    </div>
  );
}

export default function StorageTab({
  isDesktop,
  SectionHeader,
  vaults = [],
  switchVault,
  addVault,
  forgetVault,
  renameVault,
  revealVault,
}: StorageTabProps) {
  const [menu, setMenu] = useState<{
    path: string;
    anchor: MenuAnchor;
    keyboard: boolean;
  } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const moreButtons = useRef(new Map<string, HTMLButtonElement>());
  // After a rename the row may move to its new A–Z place: the keyboard
  // stays with the location, on its ···.
  const [refocus, setRefocus] = useState<string | null>(null);
  useEffect(() => {
    if (!refocus) return;
    moreButtons.current.get(refocus)?.focus({ preventScroll: true });
    setRefocus(null);
  }, [refocus]);

  if (!isDesktop) return null;
  // The open location can be removed only when there is another to switch to.
  const canSwitchAway = vaults.some((o) => !o.current && o.exists);
  const removable = (v: VaultEntry) => !v.current || canSwitchAway;

  const menuVault = menu ? vaults.find((v) => v.path === menu.path) : undefined;
  const close = () => setMenu(null);
  const itemsFor = (v: VaultEntry): MenuItem[] => {
    const items: MenuItem[] = [];
    if (!v.current && v.exists)
      items.push({
        label: "Switch to",
        icon: <SwitchIcon />,
        testId: "location-switch",
        action: () => {
          close();
          switchVault?.(v.path);
        },
      });
    items.push({
      label: "Rename…",
      icon: <PencilIcon />,
      testId: "location-rename",
      action: () => {
        close();
        setEditing(v.path);
      },
    });
    if (v.exists)
      items.push({
        label: SHOW_IN_FOLDER_LABEL,
        icon: <RevealIcon />,
        testId: "location-reveal",
        action: () => {
          close();
          revealVault?.(v.path);
        },
      });
    if (removable(v))
      items.push({
        label: "Remove from list…",
        icon: <CloseIcon size={16} />,
        testId: "location-remove",
        rule: items.length > 1,
        action: () => {
          close();
          forgetVault?.(v);
        },
      });
    return items;
  };

  const rename = async (v: VaultEntry, name: string | null, byKey: boolean) => {
    setEditing(null);
    if (name !== null && name.trim() !== v.name) await renameVault?.(v.path, name);
    // A click elsewhere ended it: focus is where that click put it.
    if (byKey) setRefocus(v.path);
  };

  return (
    <div
      data-settings-section="storage"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <SectionHeader title="Storage locations" />
      <div role="list" aria-label="Storage locations" className="settings-locations">
        {vaults.map((v) => (
          <LocationRow
            key={v.path}
            v={v}
            editing={editing === v.path}
            menuOpen={menu?.path === v.path}
            onMenu={(row, anchor, keyboard) => setMenu({ path: row.path, anchor, keyboard })}
            onSwitch={!v.current && v.exists ? () => switchVault?.(v.path) : undefined}
            onRename={rename}
            moreRef={(el) => {
              if (el) moreButtons.current.set(v.path, el);
              else moreButtons.current.delete(v.path);
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <SmallButton onClick={() => addVault?.()}>Add folder…</SmallButton>
      </div>
      {menu && menuVault && (
        <Menu
          label={`${menuVault.name} options`}
          idPrefix="location-item"
          overSettings
          testId="location-menu"
          anchor={menu.anchor}
          align="end"
          gapY={4}
          minWidth={200}
          initialActive={menu.keyboard ? 0 : -1}
          onClose={close}
          items={itemsFor(menuVault)}
        />
      )}
    </div>
  );
}
