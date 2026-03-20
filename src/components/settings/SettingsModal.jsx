import { useRef } from "react";
import { useTheme } from "../../hooks/useTheme";
import { Z } from "../../constants/zIndex";
import { useSettings } from "../../context/SettingsContext";
import { useLayout } from "../../context/LayoutContext";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";
import { fontSize, fontWeight } from "../../tokens/typography";
import ProfileTab from "./ProfileTab";
import AppearanceTab from "./AppearanceTab";
import EditorTab from "./EditorTab";
import AITab from "./AITab";
import ExportTab from "./ExportTab";
import { BrandingFooter, ContentFooter } from "./AboutTab";

export default function SettingsModal({
  isMobile,
  syncState,
  lastSynced,
  storageUsed,
  storageLimitMB,
  onSync,
  noteData,
  setActiveNote,
  isDesktop,
  notesDir,
  changeNotesDir,
  onAIKeyTest,
}) {
  const { settingsOpen, setSettingsOpen, settingsTab, setSettingsTab, user } = useSettings();

  const { accentColor } = useLayout();

  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  const loggedIn = !!user;

  const modalRef = useRef(null);
  const contentRef = useRef(null);
  const sectionRefs = useRef({});
  const scrollingTo = useRef(false);

  useFocusTrap(modalRef, settingsOpen);

  if (!settingsOpen) return null;

  const SidebarIcon = ({ type, color }) => {
    const props = {
      width: 16,
      height: 16,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color,
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
    if (type === "profile")
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M5.5 21a6.5 6.5 0 0 1 13 0" />
        </svg>
      );
    if (type === "sync")
      return (
        <svg {...props}>
          <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
        </svg>
      );
    if (type === "storage")
      return (
        <svg {...props}>
          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" />
          <path d="M21 7H3l2-4h14l2 4z" />
          <line x1="12" y1="11" x2="12" y2="15" />
        </svg>
      );
    if (type === "appearance")
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    if (type === "ai")
      return (
        <svg {...props}>
          <path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" />
          <path d="M18 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
        </svg>
      );
    if (type === "updates")
      return (
        <svg {...props}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      );
    return null;
  };

  const sidebarItems = [
    { id: "profile", label: "Profile" },
    ...(isDesktop ? [{ id: "storage", label: "Storage" }] : []),
    ...(loggedIn ? [{ id: "sync", label: "Sync" }] : []),
    { id: "appearance", label: "Appearance" },
    { id: "ai", label: "AI" },
    ...(isDesktop ? [{ id: "updates", label: "Updates" }] : []),
  ];

  const scrollToSection = (id) => {
    setSettingsTab(id);
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (el && container) {
      scrollingTo.current = true;
      container.scrollTo({ top: el.offsetTop - 24, behavior: "smooth" });
      setTimeout(() => {
        scrollingTo.current = false;
      }, 400);
    }
  };

  const handleScroll = () => {
    if (scrollingTo.current) return;
    const container = contentRef.current;
    if (!container) return;
    const scrollTop = container.scrollTop + 40;
    const ids = sidebarItems.map((item) => item.id);
    let active = "profile";
    for (const id of ids) {
      const el = sectionRefs.current[id];
      if (el && el.offsetTop <= scrollTop) active = id;
    }
    setSettingsTab(active);
  };

  const SectionHeader = ({ title }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: spacing.lg }}>
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

  return (
    <>
      {/* Backdrop — desktop only */}
      {!isMobile && (
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
      )}

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        style={
          isMobile
            ? {
                position: "fixed",
                inset: 0,
                zIndex: Z.SETTINGS_INNER,
                background: BG.darkest,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
            : {
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: Z.SETTINGS_INNER,
                width: 640,
                maxHeight: 480,
                background: theme.modalBg,
                border: `1px solid ${theme.overlay(0.06)}`,
                borderRadius: radius.xl,
                boxShadow: theme.modalShadow,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
        }
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isMobile ? "flex-start" : "center",
            padding: isMobile ? `${spacing.md}px ${spacing.lg}px` : spacing.lg,
            position: "relative",
            borderBottom: `1px solid ${theme.overlay(0.06)}`,
            flexShrink: 0,
            gap: isMobile ? spacing.md : 0,
          }}
        >
          {isMobile ? (
            <button
              onClick={() => setSettingsOpen(false)}
              style={{
                background: "none",
                border: "none",
                padding: spacing.sm,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                color: TEXT.secondary,
                fontSize: fontSize.xxl,
              }}
            >
              {"\u2190"}
            </button>
          ) : null}
          <span
            style={{ fontSize: fontSize.xxl, fontWeight: fontWeight.semibold, color: TEXT.primary }}
          >
            Settings
          </span>
          {!isMobile && (
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
              {"\u2715"}
            </button>
          )}
        </div>

        {/* Body: sidebar + content (desktop) or just content (mobile) */}
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          {/* Sidebar — desktop only */}
          {!isMobile && (
            <div
              style={{
                width: 160,
                flexShrink: 0,
                padding: `${spacing.lg}px ${spacing.md}px`,
                borderRight: `1px solid ${theme.overlay(0.06)}`,
                display: "flex",
                flexDirection: "column",
                gap: spacing.xs,
              }}
            >
              {sidebarItems.map((item) => {
                const active = settingsTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => scrollToSection(item.id)}
                    style={{
                      height: 36,
                      borderRadius: radius.md,
                      paddingLeft: spacing.md,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.medium,
                      background: active ? `${ACCENT.primary}1A` : "transparent",
                      border: "none",
                      color: active ? ACCENT.primary : TEXT.secondary,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "background 0.15s, color 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = theme.overlay(0.03);
                        e.currentTarget.style.color = TEXT.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = TEXT.secondary;
                      }
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <SidebarIcon type={item.id} color={active ? ACCENT.primary : TEXT.muted} />
                    </span>
                    {item.label}
                  </button>
                );
              })}
              {/* Spacer */}
              <div style={{ flex: 1 }} />
              {/* Sidebar footer — branding */}
              <BrandingFooter />
            </div>
          )}

          {/* Content area */}
          <div
            ref={contentRef}
            onScroll={isMobile ? undefined : handleScroll}
            style={{
              flex: 1,
              padding: isMobile ? `${spacing.lg}px ${spacing.xl}px` : spacing.xxl,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              ...(isMobile ? { WebkitOverflowScrolling: "touch" } : {}),
            }}
          >
            {/* --- Profile & Sync --- */}
            <div ref={(el) => (sectionRefs.current.profile = el)}>
              <ProfileTab
                isMobile={isMobile}
                syncState={syncState}
                lastSynced={lastSynced}
                storageUsed={storageUsed}
                storageLimitMB={storageLimitMB}
                onSync={onSync}
                noteData={noteData}
                setActiveNote={setActiveNote}
                SectionHeader={SectionHeader}
              />
            </div>

            {/* --- Notes folder (desktop only) --- */}
            <div ref={(el) => (sectionRefs.current.storage = el)}>
              <ExportTab
                isDesktop={isDesktop}
                notesDir={notesDir}
                changeNotesDir={changeNotesDir}
                SectionHeader={SectionHeader}
              />
            </div>

            {/* --- Appearance --- */}
            <div ref={(el) => (sectionRefs.current.appearance = el)}>
              <AppearanceTab SectionHeader={SectionHeader} />
            </div>

            {/* --- Editor & Updates --- */}
            <div ref={(el) => (sectionRefs.current.updates = el)}>
              <EditorTab isDesktop={isDesktop} SectionHeader={SectionHeader} />
            </div>

            {/* ─── AI ─── */}
            <div ref={(el) => (sectionRefs.current.ai = el)}>
              <AITab
                isDesktop={isDesktop}
                onAIKeyTest={onAIKeyTest}
                SectionHeader={SectionHeader}
              />
            </div>

            {/* Content footer */}
            <ContentFooter isMobile={isMobile} />
          </div>
        </div>
      </div>
    </>
  );
}
