import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { SidebarToggleIcon } from "./Icons";
import PaneTabBar from "./PaneTabBar";
import boojyWordmark from "/assets/boojy-notes-wordmark.png";

const hBg = (el, c) => {
  el.style.background = c;
};

export default function TopBarDesktop({
  tabs,
  activeNote,
  noteData,
  newTabId,
  closingTabs,
  setActiveNote,
  closeTab,
  syncState,
  tabScrollRef,
  tabAreaWidth,
  splitMode,
  onTabPointerDown,
  panes,
  activePaneId,
  dividerPosition,
  setActiveNoteForPane,
  setActivePaneId,
  setTabsForPane,
  closePaneIfEmpty,
}) {
  const {
    chromeBg,
    topBarEdge,
    tabFlip,
    activeTabBg,
    sidebarWidth,
    collapsed,
    setCollapsed,
    sidebarHandles,
    isDragging,
    startDrag,
  } = useLayout();
  const { setSettingsOpen, setSettingsTab } = useSettings();
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;

  // ── Desktop top bar ───────────────────────────────────────────────────
  return (
    <div
      style={{
        height: 48,
        background: chromeBg,
        boxShadow: topBarEdge === "A" || topBarEdge === "B" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
        borderBottom:
          topBarEdge === "A" || topBarEdge === "C" ? `1px solid ${BG.divider}25` : "none",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        zIndex: Z.TOPBAR_INNER,
        position: "relative",
      }}
    >
      {/* Top-left — logo, sidebar toggle */}
      <div
        style={{
          width: sidebarWidth,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 8px 0 14px",
          height: "100%",
          gap: 4,
          transition: "width 0.2s ease",
        }}
      >
        <button
          data-testid="settings-button"
          onClick={() => {
            setSettingsOpen(true);
            setSettingsTab("profile");
          }}
          aria-label="Notes \u2014 open settings"
          title="Settings"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            marginRight: 4,
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          <img src={boojyWordmark} alt="" style={{ height: 23.5 }} draggable="false" />
        </button>
        <span
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            overflow: "hidden",
            clip: "rect(0,0,0,0)",
            whiteSpace: "nowrap",
          }}
        >
          {syncState === "syncing"
            ? "Syncing"
            : syncState === "synced"
              ? "Sync complete"
              : syncState === "offline"
                ? "Offline"
                : syncState === "error"
                  ? "Sync error"
                  : syncState === "conflict"
                    ? "Sync conflict detected"
                    : ""}
        </span>
        {/* Spacer — inherits drag from parent */}
        <div style={{ flex: 1, minWidth: 0 }} />
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 5,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={(e) => {
            hBg(e.currentTarget, BG.surface);
            e.currentTarget.style.color = TEXT.primary;
          }}
          onMouseLeave={(e) => {
            hBg(e.currentTarget, "transparent");
            e.currentTarget.style.color = TEXT.secondary;
          }}
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <SidebarToggleIcon />
        </button>
      </div>
      <div
        ref={(el) => {
          if (el) sidebarHandles.current[0] = el;
        }}
        onMouseDown={startDrag}
        style={{
          width: 4,
          cursor: "col-resize",
          background: chromeBg,
          borderRight: `1px solid ${BG.divider}`,
          flexShrink: 0,
          transition: "background 0.15s",
          alignSelf: "stretch",
        }}
        onMouseEnter={() =>
          sidebarHandles.current.forEach((h) => h && (h.style.background = ACCENT.primary))
        }
        onMouseLeave={() => {
          if (!isDragging.current)
            sidebarHandles.current.forEach((h) => h && (h.style.background = chromeBg));
        }}
      />

      {/* Top-middle — tabs */}
      {splitMode === "vertical" && panes ? (
        (() => {
          const closePaneTab = (paneId) => (e, id) => {
            e.stopPropagation();
            const pane = panes[paneId];
            setTabsForPane(paneId, (prev) => prev.filter((t) => t !== id));
            if (pane?.activeNote === id) {
              const remaining = (pane?.tabs || []).filter((t) => t !== id);
              setActiveNoteForPane(paneId, remaining[remaining.length - 1] || null);
            }
            setTimeout(() => closePaneIfEmpty(paneId), 200);
          };
          // Correct tab divider position to align with editor split divider.
          // TopBar sidebar/right-panel sections are wider than main area counterparts
          // due to padding/border differences, so percentage flex-basis needs a px offset.
          const sidebarPad = 22; // padding: 0 8px 0 14px
          const leftExtra = collapsed ? sidebarWidth + sidebarPad : sidebarPad;
          // Editor area has no right panel and no top-right cluster, so the tab
          // strip runs to the right edge — nothing shortens it on that side.
          const rightExtra = 0;
          const totalExtra = leftExtra + rightExtra;
          const correction = (dividerPosition / 100) * totalExtra - leftExtra;
          return (
            <div
              style={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden", height: "100%" }}
            >
              <PaneTabBar
                tabs={panes.left?.tabs || []}
                activeNote={panes.left?.activeNote}
                noteData={noteData}
                newTabId={newTabId}
                closingTabs={closingTabs}
                setActiveNote={(noteId) => {
                  setActivePaneId("left");
                  setActiveNoteForPane("left", noteId);
                }}
                closeTab={closePaneTab("left")}
                tabFlip={tabFlip}
                activeTabBg={activeTabBg}
                chromeBg={chromeBg}
                tabAreaWidth={tabAreaWidth * (dividerPosition / 100)}
                tabScrollRef={null}
                onTabPointerDown={onTabPointerDown}
                paneId="left"
                style={{
                  flex: `0 0 calc(${dividerPosition}% + ${correction}px)`,
                  overflow: "auto",
                }}
              />
              <div
                style={{
                  width: 4,
                  background: chromeBg,
                  borderRight: `1px solid ${BG.divider}`,
                  flexShrink: 0,
                  alignSelf: "stretch",
                  boxSizing: "border-box",
                }}
              />
              <PaneTabBar
                tabs={panes.right?.tabs || []}
                activeNote={panes.right?.activeNote}
                noteData={noteData}
                newTabId={newTabId}
                closingTabs={closingTabs}
                setActiveNote={(noteId) => {
                  setActivePaneId("right");
                  setActiveNoteForPane("right", noteId);
                }}
                closeTab={closePaneTab("right")}
                tabFlip={tabFlip}
                activeTabBg={activeTabBg}
                chromeBg={chromeBg}
                tabAreaWidth={tabAreaWidth * ((100 - dividerPosition) / 100)}
                tabScrollRef={null}
                onTabPointerDown={onTabPointerDown}
                paneId="right"
                style={{
                  flex: `0 0 calc(${100 - dividerPosition}% - ${correction}px)`,
                  overflow: "auto",
                }}
              />
            </div>
          );
        })()
      ) : splitMode === "horizontal" && panes ? (
        (() => {
          const closeTopTab = (e, id) => {
            e.stopPropagation();
            const pane = panes.top;
            setTabsForPane("top", (prev) => prev.filter((t) => t !== id));
            if (pane?.activeNote === id) {
              const remaining = (pane?.tabs || []).filter((t) => t !== id);
              setActiveNoteForPane("top", remaining[remaining.length - 1] || null);
            }
            setTimeout(() => closePaneIfEmpty("top"), 200);
          };
          return (
            <PaneTabBar
              tabs={panes.top?.tabs || []}
              activeNote={panes.top?.activeNote}
              noteData={noteData}
              newTabId={newTabId}
              closingTabs={closingTabs}
              setActiveNote={(noteId) => {
                setActivePaneId("top");
                setActiveNoteForPane("top", noteId);
              }}
              closeTab={closeTopTab}
              tabFlip={tabFlip}
              activeTabBg={activeTabBg}
              chromeBg={chromeBg}
              tabAreaWidth={tabAreaWidth}
              tabScrollRef={tabScrollRef}
              onTabPointerDown={onTabPointerDown}
              paneId="top"
            />
          );
        })()
      ) : (
        <PaneTabBar
          tabs={tabs}
          activeNote={activeNote}
          noteData={noteData}
          newTabId={newTabId}
          closingTabs={closingTabs}
          setActiveNote={setActiveNote}
          closeTab={closeTab}
          tabFlip={tabFlip}
          activeTabBg={activeTabBg}
          chromeBg={chromeBg}
          tabAreaWidth={tabAreaWidth}
          tabScrollRef={tabScrollRef}
          onTabPointerDown={onTabPointerDown}
          paneId="left"
        />
      )}
    </div>
  );
}
