import { useState } from "react";
import { BG, TEXT, ACCENT } from "../constants/colors";
import { UndoIcon, RedoIcon, SidebarToggleIcon, CloseIcon } from "./Icons";

const hBg = (el, c) => {
  el.style.background = c;
};

function WordCountTooltip({ wordCount, charCount, charCountNoSpaces, readingTime }) {
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
  chromeBg,
  accentColor,
  topBarEdge,
  tabFlip,
  activeTabBg,
  sidebarWidth,
  rightPanelWidth,
  collapsed,
  setCollapsed,
  canUndo,
  canRedo,
  undo,
  redo,
  tabs,
  activeNote,
  noteData,
  newTabId,
  closingTabs,
  setActiveNote,
  closeTab,
  setSettingsOpen,
  setSettingsTab,
  syncState,
  syncDotStyle,
  rightPanel,
  setRightPanel,
  note,
  wordCount,
  charCount,
  charCountNoSpaces,
  readingTime,
  startDrag,
  startRightDrag,
  isDragging,
  sidebarHandles,
  rightPanelHandles,
  tabScrollRef,
  tabAreaWidth,
}) {
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
          <img
            src="/assets/boojy-notes-text-N.png"
            alt=""
            style={{ height: 23.5 }}
            draggable="false"
          />
          <button
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
                background: accentColor,
              }}
            />
          </button>
          <img
            src="/assets/boojy-notes.text-tes.png"
            alt=""
            style={{ height: 21 }}
            draggable="false"
          />
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
      <div
        ref={tabScrollRef}
        className="tab-scroll"
        style={{
          display: "flex",
          alignItems: "stretch",
          flex: 1,
          overflow: "auto",
          height: "100%",
          background: tabFlip ? activeTabBg : "transparent",
        }}
      >
        {(() => {
          const tabW = Math.min(200, Math.max(100, tabAreaWidth / Math.max(1, tabs.length)));
          return tabs.flatMap((tId, i) => {
            const t = noteData[tId];
            if (!t) return [];
            const act = activeNote === tId;
            const els = [];
            els.push(
              <div
                key={`div-${tId}`}
                style={{
                  width: i === 0 ? 1 : 2,
                  background: BG.divider,
                  opacity: 0.6,
                  alignSelf: "stretch",
                  flexShrink: 0,
                }}
              />,
            );
            const isNew = newTabId === tId;
            const isClosing = closingTabs.has(tId);
            els.push(
              <button
                key={tId}
                className={`tab-btn${act ? " tab-active" : ""}`}
                onClick={() => {
                  if (!isClosing) setActiveNote(tId);
                }}
                style={{
                  background: tabFlip
                    ? act
                      ? chromeBg
                      : activeTabBg
                    : act
                      ? activeTabBg
                      : "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "0 8px 0 10px",
                  width: tabW,
                  minWidth: tabW,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  color: act ? TEXT.primary : TEXT.secondary,
                  fontSize: 13.5,
                  fontFamily: "inherit",
                  fontWeight: act ? 600 : 400,
                  whiteSpace: "nowrap",
                  transition: "background 0.15s, color 0.15s",
                  height: "100%",
                  overflow: "hidden",
                  animation: isNew
                    ? "tabSlideIn 0.2s ease forwards"
                    : isClosing
                      ? "tabSlideOut 0.18s ease forwards"
                      : "none",
                }}
                onMouseEnter={(e) => {
                  if (!act) {
                    hBg(e.currentTarget, BG.elevated);
                    e.currentTarget.style.color = TEXT.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!act) {
                    hBg(e.currentTarget, "transparent");
                    e.currentTarget.style.color = act ? TEXT.primary : TEXT.secondary;
                  }
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {t.title}
                </span>
                <span
                  className="tab-close"
                  onClick={(e) => closeTab(e, tId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    color: TEXT.secondary,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = BG.surface;
                    e.currentTarget.style.color = TEXT.primary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = TEXT.secondary;
                  }}
                >
                  <CloseIcon />
                </span>
              </button>,
            );
            if (i === tabs.length - 1) {
              els.push(
                <div
                  key="div-end"
                  style={{
                    width: 2,
                    background: BG.divider,
                    opacity: 0.6,
                    alignSelf: "stretch",
                    flexShrink: 0,
                  }}
                />,
              );
            }
            return els;
          });
        })()}
      </div>

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
        {note && <WordCountTooltip wordCount={wordCount} charCount={charCount} charCountNoSpaces={charCountNoSpaces} readingTime={readingTime} />}
        {/* Spacer — inherits drag from parent */}
        <div style={{ flex: 1 }} />
      </div>
    </div>
  );
}
