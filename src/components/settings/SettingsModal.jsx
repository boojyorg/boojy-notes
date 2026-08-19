import { useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { useSettings } from "../../context/SettingsContext";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";
import AppearanceTab from "./AppearanceTab";
import UpdatesTab from "./UpdatesTab";
import ExportTab from "./ExportTab";
import { BrandingFooter, ContentFooter } from "./AboutTab";
import { ChevronLeftIcon } from "../Icons";

export default function SettingsModal({ isMobile, isDesktop, notesDir, changeNotesDir }) {
  const { settingsOpen, setSettingsOpen } = useSettings();

  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const modalRef = useRef(null);

  useFocusTrap(modalRef, settingsOpen);

  if (!settingsOpen) return null;

  const SectionHeader = ({ title, first }) => (
    // Each desktop section self-spaces from the one above via marginTop (the
    // first header is flush — the content area pads the top). Mobile passes
    // SectionHeader={() => null}, so this never affects the mobile layout.
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginTop: first ? 0 : spacing.xxxl,
        marginBottom: spacing.lg,
      }}
    >
      <span
        style={{
          fontSize: fontSize.xs,
          fontWeight: fontWeight.semibold,
          color: ACCENT.primary,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: `${ACCENT.primary}33` }} />
    </div>
  );

  // Mobile card wrapper for grouped settings rows
  const MobileCard = ({ children }) => (
    <div
      style={{
        background: BG.surface || theme.overlay(0.04),
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: spacing.sm,
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
        color: ACCENT.primary,
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
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.SETTINGS_INNER,
          background: BG.darkest,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
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
          {/* Appearance */}
          <MobileSectionHeader title="Appearance" />
          <MobileCard>
            <AppearanceTab SectionHeader={() => null} />
          </MobileCard>

          {/* Storage (desktop only) */}
          {isDesktop && (
            <>
              <MobileSectionHeader title="Storage" />
              <MobileCard>
                <ExportTab
                  isDesktop={isDesktop}
                  isMobile={isMobile}
                  notesDir={notesDir}
                  changeNotesDir={changeNotesDir}
                  SectionHeader={() => null}
                />
              </MobileCard>
            </>
          )}

          {/* Updates (desktop only) */}
          {isDesktop && (
            <>
              <MobileSectionHeader title="Updates" />
              <MobileCard>
                <UpdatesTab isDesktop={isDesktop} SectionHeader={() => null} />
              </MobileCard>
            </>
          )}

          {/* Footer links */}
          <div
            style={{
              padding: `${spacing.xl}px 0`,
              borderTop: `1px solid ${theme.overlay(0.06)}`,
              marginTop: spacing.lg,
            }}
          >
            <a
              href="https://boojy.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                padding: "12px 0",
                fontSize: 14,
                color: TEXT.secondary,
                textDecoration: "none",
              }}
            >
              About Boojy Notes
            </a>
          </div>

          {/* N●tes logo + version */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "8px 0 24px",
            }}
          >
            <BrandingFooter />
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop layout ────────────────────────────────────────────────
  // Single pane: Appearance, then Storage/Updates on desktop, then a quiet
  // About line. No navigation sidebar and no branding block — there is nothing
  // to navigate between, and the app already says which app it is.
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setSettingsOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: Z.SETTINGS,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: Z.SETTINGS_INNER,
          width: 440,
          maxHeight: "min(560px, calc(100vh - 48px))",
          background: theme.modalBg,
          border: `1px solid ${theme.overlay(0.06)}`,
          borderRadius: radius.xl,
          boxShadow: theme.modalShadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.lg,
            position: "relative",
            borderBottom: `1px solid ${theme.overlay(0.06)}`,
            flexShrink: 0,
          }}
        >
          <span
            style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.semibold, color: TEXT.primary }}
          >
            Settings
          </span>
          <button
            onClick={() => setSettingsOpen(false)}
            style={{
              position: "absolute",
              right: spacing.md,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              borderRadius: radius.md,
              background: "none",
              border: "none",
              color: TEXT.muted,
              fontSize: fontSize.xl,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = TEXT.secondary)}
            onMouseLeave={(e) => (e.currentTarget.style.color = TEXT.muted)}
          >
            {"✕"}
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: spacing.xxl,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <AppearanceTab SectionHeader={(props) => <SectionHeader {...props} first />} />
          <ExportTab
            isDesktop={isDesktop}
            isMobile={false}
            notesDir={notesDir}
            changeNotesDir={changeNotesDir}
            SectionHeader={SectionHeader}
          />
          <UpdatesTab isDesktop={isDesktop} SectionHeader={SectionHeader} />
          <ContentFooter />
        </div>
      </div>
    </>
  );
}
