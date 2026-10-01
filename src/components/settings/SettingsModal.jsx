import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { useSettings } from "../../context/SettingsContext";
import { useExitGhost } from "../../hooks/useExitGhost";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { atScale } from "../../utils/uiScale";
import { fontWeight } from "../../tokens/typography";
import AppearanceTab from "./AppearanceTab";
import UpdatesTab from "./UpdatesTab";
import StorageTab from "./StorageTab";
import SettingsFooter from "./SettingsFooter";
import { SCRIM, SectionTitle, SettingsRule, dialogSurface } from "./SettingsPrimitives";
import { CloseIcon, SettingsIcon } from "../Icons";
import { ChromeButton } from "../EditorChrome";

/** Settings' width: room for a long notes-folder path beside its button. */
export const SETTINGS_WIDTH = 540;

export default function SettingsModal({
  isDesktop,
  vaults,
  switchVault,
  addVault,
  forgetVault,
  revealVault,
}) {
  const { settingsOpen, setSettingsOpen, uiScale } = useSettings();

  // The scale the pane opened at. While it is open the app resizes under every
  // press of Interface size, but the pane itself keeps the size and place it
  // opened with: a panel that grows as you press the button inside it moves
  // that button out from under the pointer (judged live twice, Tyr,
  // 2026-09-19). It is not excluded from the scale — the next time it opens it
  // is drawn at whatever the scale is then. Captured in a layout effect, so the
  // first paint of an open pane is already at its own scale.
  const [openedAt, setOpenedAt] = useState(uiScale);
  useLayoutEffect(() => {
    if (settingsOpen) setOpenedAt(uiScale);
    // Deliberately not on uiScale: the capture is the *opening*, and a scale
    // change while the pane is open must not move it.
  }, [settingsOpen]);

  const { theme } = useTheme();
  const { TEXT } = theme;

  const modalRef = useRef(null);
  // Scrim and pane are siblings, so each leaves its own copy (useExitGhost).
  const scrimRef = useRef(null);
  const centreRef = useRef(null);

  useFocusTrap(modalRef, settingsOpen, "container");
  useExitGhost(scrimRef, settingsOpen);
  useExitGhost(centreRef, settingsOpen);

  // Settings closes itself on Escape, as every other surface does; the app
  // shell's handler never needs to know it is open. On the document, so it
  // runs before the shell's window listener, and only for an Escape nothing
  // above it has taken.
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setSettingsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [settingsOpen, setSettingsOpen]);

  if (!settingsOpen) return null;

  // One pane on the search palette's surface: Appearance, the
  // notes folder and Updates, parted by rules, then the quiet version line.
  // No navigation and no branding block; the cog beside the title is the one
  // glyph, the same one the ··· menu gives Settings.
  return (
    <>
      {/* Scrim: the palette's, no blur */}
      <div
        ref={scrimRef}
        className="motion-fade"
        onClick={() => setSettingsOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: Z.SETTINGS, background: SCRIM }}
      />

      {/* The pane is centred by a wrapper rather than by `translate(-50%, -50%)`
          on itself: a transform would make the pane the containing block for
          anything `fixed` inside it, and the wrapper is also what lets the pane
          carry a zoom of its own without fighting percentage offsets. It takes
          no pointer events, so a click beside the pane still reaches the scrim
          and closes Settings. */}
      <div
        ref={centreRef}
        className="motion-from-center"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.SETTINGS_INNER,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          ref={modalRef}
          // Grows in by `scale`, which is `none` at rest, so it never makes
          // the pane a containing block for `fixed` children (a transform would).
          className="motion-pop motion-from-center"
          role="dialog"
          aria-modal="true"
          aria-label="Settings"
          data-settings-pane=""
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          style={{
            pointerEvents: "auto",
            // Its own scale, held at the one it opened with: `zoom` nests
            // multiplicatively, so this cancels the difference exactly (measured
            // 2026-09-19: 540×200 at the same place at 50%, 100% and 200%). The
            // local `--ui-scale` keeps the viewport-unit maths below resolving
            // against the pane's own scale rather than the app's (`atScale`).
            zoom: openedAt === uiScale ? undefined : openedAt / uiScale,
            "--ui-scale": openedAt / 100,
            width: SETTINGS_WIDTH,
            // Divided by the scale: `vw`/`vh` ignore the zoom the UI scale is
            // made of, so at 200% this pane was twice the window and its header
            // sat above the top edge (2026-09-19).
            maxWidth: atScale("100vw - 32px"),
            maxHeight: atScale("100vh - 48px"),
            boxSizing: "border-box",
            padding: "20px 28px",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            outline: "none",
            ...dialogSurface(theme),
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              height: 32,
              margin: "0 -8px 20px 0",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 17,
                fontWeight: fontWeight.semibold,
                color: TEXT.primary,
              }}
            >
              <span style={{ display: "inline-flex", color: TEXT.secondary }}>
                <SettingsIcon size={18} />
              </span>
              <span>Settings</span>
            </div>
            <ChromeButton
              label="Close"
              ariaLabel="Close settings"
              onClick={() => setSettingsOpen(false)}
            >
              <CloseIcon />
            </ChromeButton>
          </div>

          <AppearanceTab SectionHeader={SectionTitle} />
          {isDesktop && (
            <>
              <SettingsRule />
              <StorageTab
                isDesktop={isDesktop}
                SectionHeader={SectionTitle}
                vaults={vaults}
                switchVault={switchVault}
                addVault={addVault}
                forgetVault={forgetVault}
                revealVault={revealVault}
              />
              <SettingsRule />
              <UpdatesTab isDesktop={isDesktop} SectionHeader={SectionTitle} />
            </>
          )}
          <SettingsFooter />
        </div>
      </div>
    </>
  );
}
