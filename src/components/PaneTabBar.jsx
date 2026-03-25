import { useTheme } from "../hooks/useTheme";
import { CloseIcon } from "./Icons";

const hBg = (el, c) => {
  el.style.background = c;
};

export default function PaneTabBar({
  tabs,
  activeNote,
  noteData,
  newTabId,
  closingTabs,
  setActiveNote,
  closeTab,
  tabFlip,
  activeTabBg,
  chromeBg,
  tabAreaWidth,
  tabScrollRef,
  onTabPointerDown,
  paneId,
  variant = "topbar",
  style: styleProp,
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  const tabW = Math.min(200, Math.max(100, tabAreaWidth / Math.max(1, tabs.length)));

  const baseStyle =
    variant === "pane"
      ? { display: "flex", alignItems: "stretch", flexShrink: 0, height: 48, overflow: "auto" }
      : { display: "flex", alignItems: "stretch", flex: 1, overflow: "auto", height: "100%" };

  return (
    <div
      ref={tabScrollRef}
      className="tab-scroll"
      data-pane-tab-bar={paneId}
      role="tablist"
      aria-label="Open notes"
      style={{
        ...baseStyle,
        background: tabFlip ? activeTabBg : variant === "pane" ? chromeBg : "transparent",
        borderBottom: "none",
        boxSizing: "border-box",
        ...styleProp,
      }}
    >
      {tabs.flatMap((tId, i) => {
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
            data-tab-id={tId}
            role="tab"
            aria-selected={act}
            className={`tab-btn${act ? " tab-active" : ""}`}
            onClick={() => {
              if (!isClosing) setActiveNote(tId);
            }}
            onPointerDown={onTabPointerDown ? (e) => onTabPointerDown(e, tId, paneId) : undefined}
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
              {t.title || "Untitled"}
            </span>
            <span
              role="button"
              aria-label="Close tab"
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
      })}
    </div>
  );
}
