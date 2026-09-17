import { useEffect, useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { useSettings } from "../../context/SettingsContext";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { spacing } from "../../tokens/spacing";
import { fontWeight } from "../../tokens/typography";
import AppearanceTab from "./AppearanceTab";
import UpdatesTab from "./UpdatesTab";
import StorageTab from "./StorageTab";
import SettingsFooter from "./SettingsFooter";
import { SCRIM, SectionTitle, SettingsRule, dialogSurface } from "./SettingsPrimitives";
import { ChevronLeftIcon, CloseIcon, SettingsIcon } from "../Icons";
import { ChromeButton } from "../EditorChrome";

/** Settings' width: room for a long notes-folder path beside its button. */
export const SETTINGS_WIDTH = 540;

export default function SettingsModal({
  isMobile,
  isDesktop,
  notesDir,
  changeNotesDir,
  revealNotesDir,
}) {
  const { settingsOpen, setSettingsOpen } = useSettings();

  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const modalRef = useRef(null);

  useFocusTrap(modalRef, settingsOpen, "container");

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

  // Mobile card wrapper for grouped settings rows
  const MobileCard = ({ children }) => (
    <div
      style={{
        background: BG.surface || theme.overlay(0.04),
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: spacing.sm,
        padding: `${spacing.sm}px ${spacing.md}px`,
      }}
    >
      {children}
    </div>
  );

  // Mobile section header — uppercase, small, accent
  const MobileSectionHeader = ({ title }) => (
    <div
      style={{
        fontSize: 11,
        fontWeight: fontWeight.semibold,
        color: ACCENT.text,
        textTransform: "uppercase",
        letterSpacing: 1.2,
        padding: `${spacing.xl}px 0 ${spacing.sm}px`,
      }}
    >
      {title}
    </div>
  );

  // ── Mobile layout ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.SETTINGS_INNER,
          background: BG.darkest,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            minHeight: 48,
            background: BG.darkest,
            display: "flex",
            alignItems: "center",
            gap: spacing.sm,
            padding: "env(safe-area-inset-top, 0px) 4px 0 4px",
            borderBottom: `1px solid ${theme.overlay(0.06)}`,
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => setSettingsOpen(false)}
            style={{
              background: "none",
              border: "none",
              padding: 12,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: TEXT.secondary,
            }}
            aria-label="Back"
          >
            <ChevronLeftIcon size={20} />
          </button>
          <span style={{ fontSize: 16, fontWeight: fontWeight.semibold, color: TEXT.primary }}>
            Settings
          </span>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: `0 ${spacing.lg}px`,
            WebkitOverflowScrolling: "touch",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <MobileSectionHeader title="Appearance" />
          <MobileCard>
            <AppearanceTab SectionHeader={() => null} />
          </MobileCard>

          {isDesktop && (
            <>
              <MobileSectionHeader title="Notes folder" />
              <MobileCard>
                <StorageTab
                  isDesktop={isDesktop}
                  notesDir={notesDir}
                  changeNotesDir={changeNotesDir}
                  revealNotesDir={revealNotesDir}
                  SectionHeader={() => null}
                />
              </MobileCard>
            </>
          )}

          {isDesktop && (
            <>
              <MobileSectionHeader title="Updates" />
              <MobileCard>
                <UpdatesTab isDesktop={isDesktop} SectionHeader={() => null} />
              </MobileCard>
            </>
          )}

          <div style={{ padding: `0 0 ${spacing.xl}px` }}>
            <SettingsFooter />
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────
  // One pane on the search palette's surface (2026-09-17): Appearance, the
  // notes folder and Updates, parted by rules, then the quiet version line.
  // No navigation and no branding block; the cog beside the title is the one
  // glyph, the same one the ··· menu gives Settings.
  return (
    <>
      {/* Scrim: the palette's, no blur */}
      <div
        onClick={() => setSettingsOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: Z.SETTINGS, background: SCRIM }}
      />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: Z.SETTINGS_INNER,
          width: SETTINGS_WIDTH,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 48px)",
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
              notesDir={notesDir}
              changeNotesDir={changeNotesDir}
              revealNotesDir={revealNotesDir}
              SectionHeader={SectionTitle}
            />
            <SettingsRule />
            <UpdatesTab isDesktop={isDesktop} SectionHeader={SectionTitle} />
          </>
        )}
        <SettingsFooter />
      </div>
    </>
  );
}
