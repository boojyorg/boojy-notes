import { useState, useCallback, useRef } from "react";
import { useTheme } from "../hooks/useTheme";
import { useLayout } from "../context/LayoutContext";
import { useNoteDataActions } from "../context/NoteDataContext";
import { useSettings } from "../context/SettingsContext";
import { UndoIcon, RedoIcon, SidebarToggleIcon, HelpIcon, HamburgerIcon, PlusIcon } from "./Icons";
import HelpDropdown from "./HelpDropdown";
import PaneTabBar from "./PaneTabBar";
import boojyN from "/assets/boojy-notes-text-N.png";
import boojyTes from "/assets/boojy-notes.text-tes.png";

const hBg = (el, c) => {
  el.style.background = c;
};

function WordCountTooltip({ wordCount, charCount, charCountNoSpaces, readingTime }) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const [show, setShow] = useState(false);
  return (
    <div
      style={{ position: "relative", flexShrink: 0 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        style={{
          fontSize: 12,
          color: TEXT.secondary,
          padding: "0 4px",
          whiteSpace: "nowrap",
          cursor: "default",
        }}
      >
        {wordCount} words
      </span>
      {show && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 11,
            color: TEXT.secondary,
            whiteSpace: "nowrap",
            zIndex: 100,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          }}
        >
          <div>{charCount} characters</div>
          <div>{charCountNoSpaces} characters (no spaces)</div>
          <div>~{readingTime} min read</div>
        </div>
      )}
    </div>
  );
}

export default function TopBar({
  tabs,
  activeNote,
  noteData,
  newTabId,
  closingTabs,
  setActiveNote,
  closeTab,
  syncState,
  syncDotStyle,
  note,
  wordCount,
  charCount,
  charCountNoSpaces,
  readingTime,
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
  isMobile,
  createNote,
  noteTitle,
}) {
  const {
    chromeBg,
    accentColor,
    topBarEdge,
    tabFlip,
    activeTabBg,
    sidebarWidth,
    rightPanelWidth,
    collapsed,
    setCollapsed,
    rightPanel,
    setRightPanel,
    sidebarHandles,
    rightPanelHandles,
    isDragging,
    startDrag,
    startRightDrag,
  } = useLayout();
  const { canUndo, canRedo, undo, redo } = useNoteDataActions();
  const { setSettingsOpen, setSettingsTab } = useSettings();
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const [helpOpen, setHelpOpen] = useState(false);
  const helpBtnRef = useRef(null);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // ── Mobile top bar ──────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div
        style={{
          height: 48,
          background: chromeBg,
          boxShadow:
            topBarEdge === "A" || topBarEdge === "B" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
          borderBottom:
            topBarEdge === "A" || topBarEdge === "C" ? `1px solid ${BG.divider}25` : "none",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          zIndex: 2,
          position: "relative",
          padding: "0 8px",
          gap: 4,
        }}
      >
        {/* Hamburger */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 12,
            borderRadius: 5,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            transition: "background 0.15s, color 0.15s",
            flexShrink: 0,
          }}
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <HamburgerIcon size={19} />
        </button>

        {/* Logo — tap opens settings */}
        <button
          data-testid="settings-button"
          onClick={() => {
            setSettingsOpen(true);
            setSettingsTab("profile");
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 2px",
            display: "flex",
            alignItems: "center",
            gap: 3,
            flexShrink: 0,
          }}
          title={`Settings \u00b7 Sync: ${syncState}`}
        >
          <img src={boojyN} alt="" style={{ height: 20 }} draggable="false" />
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              background:
                syncState === "conflict"
                  ? "#f59e0b"
                  : syncState === "offline"
                    ? "#9ca3af"
                    : syncState === "error"
                      ? "#ef4444"
                      : accentColor,
              flexShrink: 0,
            }}
          />
          <img src={boojyTes} alt="" style={{ height: 18 }} draggable="false" />
        </button>

        {/* Center — note title */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: "center",
            fontSize: 13,
            fontWeight: 500,
            color: TEXT.primary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            padding: "0 4px",
          }}
        >
          {noteTitle || ""}
        </div>

        {/* Right — undo, redo, new note */}
        <button
          onClick={undo}
          style={{
            background: "none",
            border: "none",
            cursor: canUndo ? "pointer" : "default",
            padding: 12,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            opacity: canUndo ? 1 : 0.3,
            flexShrink: 0,
          }}
        >
          <UndoIcon size={19} />
        </button>
        <button
          onClick={redo}
          style={{
            background: "none",
            border: "none",
            cursor: canRedo ? "pointer" : "default",
            padding: 12,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            opacity: canRedo ? 1 : 0.3,
            flexShrink: 0,
          }}
        >
          <RedoIcon size={19} />
        </button>
        <button
          onClick={() => createNote && createNote(null)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 12,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            flexShrink: 0,
          }}
          title="New note"
        >
          <PlusIcon size={19} />
        </button>
      </div>
    );
  }

  // ── Desktop top bar ───────────────────────────────────────────────────
  return (
    <div
      style={{
        height: 44,
        background: chromeBg,
        boxShadow: topBarEdge === "A" || topBarEdge === "B" ? "0 2px 8px rgba(0,0,0,0.3)" : "none",
        borderBottom:
          topBarEdge === "A" || topBarEdge === "C" ? `1px solid ${BG.divider}25` : "none",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        zIndex: 2,
        position: "relative",
      }}
    >
      {/* Top-left — logo, undo, redo, sidebar toggle */}
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
        <div
          style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, marginRight: 4 }}
        >
          <img src={boojyN} alt="" style={{ height: 23.5 }} draggable="false" />
          <button
            data-testid="settings-button"
            onClick={() => {
              setSettingsOpen(true);
              setSettingsTab("profile");
            }}
            style={syncDotStyle()}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            title={`Settings \u00b7 Sync: ${syncState}`}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                background:
                  syncState === "conflict"
                    ? "#f59e0b"
                    : syncState === "offline"
                      ? "#9ca3af"
                      : syncState === "error"
                        ? "#ef4444"
                        : accentColor,
              }}
            />
          </button>
          <img src={boojyTes} alt="" style={{ height: 21 }} draggable="false" />
        </div>
        {/* Spacer — inherits drag from parent */}
        <div style={{ flex: 1, minWidth: 0 }} />
        <button
          onClick={undo}
          title="Undo (Ctrl+Z)"
          style={{
            background: "none",
            border: "none",
            cursor: canUndo ? "pointer" : "default",
            padding: "5px 4px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            opacity: canUndo ? 1 : 0.3,
            transition: "background 0.15s, color 0.15s, opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            if (canUndo) {
              hBg(e.currentTarget, BG.surface);
              e.currentTarget.style.color = TEXT.primary;
            }
          }}
          onMouseLeave={(e) => {
            hBg(e.currentTarget, "transparent");
            e.currentTarget.style.color = TEXT.secondary;
          }}
        >
          <UndoIcon />
        </button>
        <button
          onClick={redo}
          title="Redo (Ctrl+Shift+Z)"
          style={{
            background: "none",
            border: "none",
            cursor: canRedo ? "pointer" : "default",
            padding: "5px 4px",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            color: TEXT.secondary,
            opacity: canRedo ? 1 : 0.3,
            transition: "background 0.15s, color 0.15s, opacity 0.15s",
          }}
          onMouseEnter={(e) => {
            if (canRedo) {
              hBg(e.currentTarget, BG.surface);
              e.currentTarget.style.color = TEXT.primary;
            }
          }}
          onMouseLeave={(e) => {
            hBg(e.currentTarget, "transparent");
            e.currentTarget.style.color = TEXT.secondary;
          }}
        >
          <RedoIcon />
        </button>
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
          const rightPad = 20; // padding: 0 10px 0 10px
          const leftExtra = collapsed ? sidebarWidth + sidebarPad : sidebarPad;
          const rightExtra = rightPanel ? rightPad : rightPanelWidth + rightPad;
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

      {/* Top-right drag handle */}
      <div
        ref={(el) => {
          if (el) rightPanelHandles.current[0] = el;
        }}
        onMouseDown={startRightDrag}
        style={{
          width: 4,
          cursor: "col-resize",
          background: chromeBg,
          flexShrink: 0,
          transition: "background 0.15s",
          alignSelf: "stretch",
        }}
        onMouseEnter={() =>
          rightPanelHandles.current.forEach((h) => h && (h.style.background = ACCENT.primary))
        }
        onMouseLeave={() => {
          if (!isDragging.current) {
            rightPanelHandles.current[0] &&
              (rightPanelHandles.current[0].style.background = chromeBg);
            rightPanelHandles.current[1] &&
              (rightPanelHandles.current[1].style.background = BG.editor);
          }
        }}
      />

      {/* Top-right — panel toggle, word count */}
      <div
        style={{
          width: rightPanelWidth,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 4,
          padding: "0 10px 0 10px",
          height: "100%",
          borderLeft: `1px solid ${BG.divider}`,
        }}
      >
        <button
          onClick={() => setRightPanel(!rightPanel)}
          title="Toggle right panel (\u2318\\)"
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
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            hBg(e.currentTarget, BG.surface);
            e.currentTarget.style.color = TEXT.primary;
          }}
          onMouseLeave={(e) => {
            hBg(e.currentTarget, "transparent");
            e.currentTarget.style.color = TEXT.secondary;
          }}
        >
          <svg width="16.5" height="16.5" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <rect
              x="1.5"
              y="2.5"
              width="13"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path d="M10 2.5V13.5" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
        {note && (
          <WordCountTooltip
            wordCount={wordCount}
            charCount={charCount}
            charCountNoSpaces={charCountNoSpaces}
            readingTime={readingTime}
          />
        )}
        {/* Spacer — inherits drag from parent */}
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            ref={helpBtnRef}
            onClick={() => setHelpOpen((v) => !v)}
            title="Quick reference"
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
          >
            <HelpIcon />
          </button>
          <HelpDropdown open={helpOpen} onClose={closeHelp} toggleRef={helpBtnRef} />
        </div>
      </div>
    </div>
  );
}
