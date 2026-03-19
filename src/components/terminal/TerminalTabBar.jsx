import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../hooks/useTheme";
import { isElectron } from "../../utils/platform";
import { CloseIcon } from "../Icons";
import { spacing } from "../../tokens/spacing";
import { radius } from "../../tokens/radius";

const hBg = (el, c) => {
  el.style.background = c;
};

export default function TerminalTabBar({
  terminals,
  activeTerminalId,
  setActiveTerminalId,
  activeTabBg,
  chromeBg,
  onNewTerminal,
  onNewAITab,
  onCloseTerminal,
  onRenameTerminal,
  onClearTerminal,
  onRestartTerminal,
}) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const scrollRef = useRef(null);
  const [areaWidth, setAreaWidth] = useState(400);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [ctxMenu, setCtxMenu] = useState(null);
  const renameInputRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAreaWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Close context menu on click-outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [ctxMenu]);

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const finishRename = () => {
    if (renamingId && renameValue.trim()) {
      onRenameTerminal(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const tabW = Math.min(200, Math.max(100, areaWidth / Math.max(1, terminals.length)));

  // Can show terminal buttons?
  const canTerminal = isElectron && !!window.electronAPI?.terminal;

  return (
    <div
      style={{
        height: 32,
        display: "flex",
        alignItems: "stretch",
        borderBottom: `1px solid ${BG.divider}`,
        flexShrink: 0,
        position: "relative",
        background: BG.editor,
      }}
    >
      <div
        ref={scrollRef}
        className="tab-scroll"
        style={{
          display: "flex",
          alignItems: "stretch",
          flex: 1,
          overflow: "auto",
          height: "100%",
        }}
      >
        {terminals.map((t, i) => {
          const act = activeTerminalId === t.id;
          const isAI = t.type === "ai";
          return [
            <div
              key={`div-${t.id}`}
              style={{
                width: i === 0 ? 1 : 2,
                background: BG.divider,
                opacity: 0.6,
                alignSelf: "stretch",
                flexShrink: 0,
              }}
            />,
            <button
              key={t.id}
              onClick={() => setActiveTerminalId(t.id)}
              onDoubleClick={() => {
                setRenamingId(t.id);
                setRenameValue(t.title);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxMenu({ id: t.id, type: t.type, x: e.clientX, y: e.clientY });
              }}
              style={{
                background: act ? activeTabBg : "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0 6px 0 10px",
                width: tabW,
                minWidth: tabW,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                color: act ? TEXT.primary : TEXT.secondary,
                fontSize: 12,
                fontFamily: "inherit",
                fontWeight: act ? 600 : 400,
                whiteSpace: "nowrap",
                transition: "background 0.15s, color 0.15s",
                height: "100%",
                overflow: "hidden",
                animation: "tabSlideIn 0.2s ease forwards",
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
                  e.currentTarget.style.color = TEXT.secondary;
                }
              }}
            >
              {/* Tab type icon */}
              {isAI ? (
                <span
                  style={{
                    flexShrink: 0,
                    marginRight: 5,
                    opacity: 0.7,
                    fontSize: 11,
                    lineHeight: 1,
                  }}
                >
                  &#10022;
                </span>
              ) : (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ flexShrink: 0, marginRight: 5, opacity: 0.7 }}
                >
                  <path
                    d="M4 5L7 8L4 11"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M8.5 11H12"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                  textAlign: "left",
                }}
              >
                {renamingId === t.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={finishRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") finishRename();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: TEXT.primary,
                      fontSize: 12,
                      fontFamily: "inherit",
                      fontWeight: 600,
                      width: "100%",
                      outline: "none",
                      padding: 0,
                    }}
                  />
                ) : (
                  t.title
                )}
              </span>
              <span
                className="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTerminal(t.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 16,
                  borderRadius: radius.sm,
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
            // End divider after last tab
            i === terminals.length - 1 && (
              <div
                key="div-end"
                style={{
                  width: 2,
                  background: BG.divider,
                  opacity: 0.6,
                  alignSelf: "stretch",
                  flexShrink: 0,
                }}
              />
            ),
          ];
        })}
      </div>

      {/* New tab buttons — [>_] for terminal, [✦] for AI */}
      <div style={{ display: "flex", flexShrink: 0 }}>
        {canTerminal && (
          <button
            onClick={onNewTerminal}
            title="New terminal"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 6px",
              display: "flex",
              alignItems: "center",
              color: TEXT.muted,
              fontSize: 12,
              flexShrink: 0,
              transition: "color 0.15s, background 0.15s",
              fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = TEXT.primary;
              e.currentTarget.style.background = BG.elevated;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = TEXT.muted;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 5L7 8L4 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M8.5 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button
          onClick={onNewAITab}
          title="New AI chat"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0 6px",
            display: "flex",
            alignItems: "center",
            color: TEXT.muted,
            fontSize: 14,
            flexShrink: 0,
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = TEXT.primary;
            e.currentTarget.style.background = BG.elevated;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = TEXT.muted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          &#10022;
        </button>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
            background: BG.elevated,
            border: `1px solid ${BG.divider}`,
            borderRadius: radius.default,
            padding: `${spacing.xs}px 0`,
            zIndex: 1000,
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            minWidth: 140,
            fontSize: 12,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(ctxMenu.type === "terminal"
            ? [
                {
                  label: "Rename",
                  action: () => {
                    setRenamingId(ctxMenu.id);
                    setRenameValue(terminals.find((t) => t.id === ctxMenu.id)?.title || "");
                  },
                },
                { label: "Clear", action: () => onClearTerminal(ctxMenu.id) },
                { label: "Restart", action: () => onRestartTerminal(ctxMenu.id) },
                { sep: true },
                { label: "Kill", action: () => onCloseTerminal(ctxMenu.id), color: "#FF5C57" },
              ]
            : [
                {
                  label: "Rename",
                  action: () => {
                    setRenamingId(ctxMenu.id);
                    setRenameValue(terminals.find((t) => t.id === ctxMenu.id)?.title || "");
                  },
                },
                { sep: true },
                { label: "Close", action: () => onCloseTerminal(ctxMenu.id), color: "#FF5C57" },
              ]
          ).map((item, i) =>
            item.sep ? (
              <div
                key={i}
                style={{ height: 1, background: BG.divider, margin: `${spacing.xs}px 0` }}
              />
            ) : (
              <div
                key={i}
                onClick={() => {
                  item.action();
                  setCtxMenu(null);
                }}
                style={{
                  padding: "6px 14px",
                  cursor: "pointer",
                  color: item.color || TEXT.primary,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = BG.surface;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {item.label}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
