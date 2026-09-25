import { useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { ChromeButton } from "../EditorChrome";
import { CloseIcon } from "../Icons";
import { Tooltip, useTooltip } from "../Tooltip";
import { tagPillGround } from "../../styles/tagPill";
import { locationPath, splitLocation } from "../../utils/storageLocations";
import { SHOW_IN_FOLDER_LABEL, SmallButton } from "./SettingsPrimitives";

/**
 * Settings → Storage locations (2026-09-25, Tyr's direction over several
 * rounds of mockups): a small table, one row per location. The folder's name
 * leads, then where it lives, muted, 8px on, as one phrase with no glyph
 * (the path says iCloud Drive, "Not found" says gone). The phrase is the
 * Show in Finder control and takes the hover grey, its path lifting to full
 * ink: Active is teal, so grey means only "this can be clicked". On the
 * right, `Active` in the accent's tint (a mode that is on), or `Use` in the
 * same shape; then × on the pane's edge. Use and × wait for hover or
 * keyboard focus, the ×'s place kept so nothing moves as it appears. × is on
 * every row, the open one included, unless it is the only location left to
 * switch to; it asks first (BoojyNotes' removeVault), and removing the open
 * one switches to another.
 * Add folder… adds without switching. Code calls a location a vault.
 */

/** Active and Use share one slot and one shape: a pair, one on and one off. */
const SLOT_W = 64;
const SLOT_SHAPE = {
  boxSizing: "border-box",
  height: 26,
  minWidth: SLOT_W,
  padding: "0 12px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 500,
};

function LocationRow({ v, removable, withRemove, switchVault, forgetVault, revealVault }) {
  const { theme } = useTheme();
  const { TEXT, ACCENT } = theme;
  const tip = useTooltip();
  const ref = useRef(null);
  const missing = !v.exists;
  const { parent } = splitLocation(v.path);
  return (
    <div
      className="settings-location"
      data-testid="settings-location-row"
      style={{ display: "contents" }}
    >
      {/* Name and place are one phrase and one Show in Finder control, its
          hover ground hugging the words. */}
      <button
        ref={ref}
        type="button"
        className="settings-location-reveal"
        aria-label={`${v.name}, ${missing ? "not found" : locationPath(v.path)}`}
        aria-disabled={missing || undefined}
        onClick={missing ? undefined : () => revealVault?.(v.path)}
        {...(missing ? {} : tip.handlers)}
        style={{
          gridColumn: 1,
          justifySelf: "start",
          maxWidth: "calc(100% + 12px)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
          height: 32,
          margin: "0 -6px",
          padding: "0 6px",
          border: "none",
          borderRadius: 8,
          background: "transparent",
          fontFamily: "inherit",
          textAlign: "left",
          cursor: missing ? "default" : "pointer",
        }}
      >
        <span
          style={{
            fontSize: 14,
            color: missing ? TEXT.muted : TEXT.primary,
            flexShrink: 0,
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {v.name}
        </span>
        {/* Cut from its left, so the folder nearest the location stays. */}
        <span
          className="settings-location-path"
          style={{
            minWidth: 0,
            fontSize: 13,
            color: TEXT.muted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            direction: "rtl",
            textAlign: "left",
          }}
        >
          {missing ? "Not found" : `\u200E${parent}\u200E`}
        </span>
      </button>
      {tip.shown && !missing && (
        <Tooltip
          label={SHOW_IN_FOLDER_LABEL}
          anchor={ref.current}
          placement="below"
          testId="path-tooltip"
        />
      )}
      <span
        style={{
          gridColumn: 2,
          display: "flex",
          justifyContent: "flex-end",
          width: SLOT_W,
        }}
      >
        {v.current ? (
          // A mode that is on: the accent's tint, the one surface it may have
          // (the lit Markdown-view button's wash and ink), in Use's own shape.
          <span
            data-testid="location-active"
            style={{
              ...SLOT_SHAPE,
              border: "1px solid transparent",
              background: tagPillGround(theme),
              color: ACCENT.text,
            }}
          >
            Active
          </span>
        ) : (
          !missing && (
            <span className="settings-location-action">
              <SmallButton
                aria-label={`Use ${v.name}`}
                onClick={() => switchVault?.(v.path)}
                style={SLOT_SHAPE}
              >
                Use
              </SmallButton>
            </span>
          )
        )}
      </span>
      {withRemove && (
        <span style={{ gridColumn: 3, display: "flex", width: 32 }}>
          {removable && (
            <span className="settings-location-action" style={{ display: "flex" }}>
              <ChromeButton
                label="Remove from Boojy Notes"
                ariaLabel={`Remove ${v.name} from Boojy Notes`}
                onClick={() => forgetVault?.(v)}
              >
                <CloseIcon size={16} />
              </ChromeButton>
            </span>
          )}
        </span>
      )}
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
  revealVault,
}) {
  if (!isDesktop) return null;
  // The open location can be removed only when there is another to switch to.
  const canSwitchAway = vaults.some((o) => !o.current && o.exists);
  const removable = (v) => !v.current || canSwitchAway;
  const withRemove = vaults.some(removable);
  return (
    <div
      data-settings-section="storage"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <SectionHeader title="Storage locations" />
      <div
        role="list"
        aria-label="Storage locations"
        style={{
          display: "grid",
          // The name-and-place phrase, the Active / Use slot, then × on the
          // pane's right edge (hover only, its place always kept).
          gridTemplateColumns: `minmax(0, 1fr) auto${withRemove ? " auto" : ""}`,
          columnGap: 8,
          rowGap: 2,
          alignItems: "center",
        }}
      >
        {vaults.map((v) => (
          <LocationRow
            key={v.path}
            v={v}
            removable={removable(v)}
            withRemove={withRemove}
            switchVault={switchVault}
            forgetVault={forgetVault}
            revealVault={revealVault}
          />
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <SmallButton onClick={() => addVault?.()}>Add folder…</SmallButton>
      </div>
    </div>
  );
}
