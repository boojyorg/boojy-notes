import { useEffect, useState } from "react";
import TerminalTabBar from "./TerminalTabBar";
import TerminalInstance from "./TerminalInstance";
import TerminalSearchBar from "./TerminalSearchBar";
import { useTheme } from "../../hooks/useTheme";
import { useLayout } from "../../context/LayoutContext";
import { isElectron } from "../../utils/platform";
import { fontSize } from "../../tokens/typography";

export default function TerminalPanel({
  terminals,
  activeTerminalId,
  setActiveTerminalId,
  xtermInstances,
  createTerminal,
  closeTerminal,
  renameTerminal,
  restartTerminal,
  clearTerminal,
  markExited,
  isOpen,
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;
  const { chromeBg, activeTabBg } = useLayout();
  const [searchOpen, setSearchOpen] = useState(false);

  // Auto-create first tab when panel opens with none (desktop terminal only)
  useEffect(() => {
    if (isOpen && terminals.length === 0 && isElectron && window.electronAPI?.terminal) {
      createTerminal();
    }
  }, [isOpen]);

  // Get the active tab object
  const activeTab = terminals.find((t) => t.id === activeTerminalId);
  const isActiveTerminal = activeTab?.type === "terminal" || (!activeTab?.type && activeTab);

  // Keyboard shortcuts when terminal focused
  useEffect(() => {
    const handler = (e) => {
      if (!isOpen || !isActiveTerminal) return;
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+F — search in terminal
      if (mod && e.key === "f") {
        const active = document.activeElement;
        const termContainer = document.querySelector("[data-terminal-panel]");
        if (termContainer?.contains(active) || active?.closest?.(".xterm")) {
          e.preventDefault();
          setSearchOpen((v) => !v);
        }
      }
      // Cmd+K — clear terminal (when terminal focused)
      if (mod && e.key === "k") {
        const active = document.activeElement;
        if (active?.closest?.(".xterm") && activeTerminalId) {
          e.preventDefault();
          clearTerminal(activeTerminalId);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, activeTerminalId, clearTerminal, isActiveTerminal]);

  // Close search when switching tabs
  useEffect(() => {
    setSearchOpen(false);
  }, [activeTerminalId]);

  const activeSearchAddon = activeTerminalId
    ? xtermInstances.current.get(activeTerminalId)?.searchAddon
    : null;

  if (!isOpen) return null;

  return (
    <div
      data-terminal-panel
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        position: "relative",
        background: BG.editor,
      }}
    >
      <TerminalTabBar
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        setActiveTerminalId={setActiveTerminalId}
        activeTabBg={activeTabBg}
        chromeBg={chromeBg}
        onNewTerminal={() => createTerminal()}
        onCloseTerminal={closeTerminal}
        onRenameTerminal={renameTerminal}
        onClearTerminal={clearTerminal}
        onRestartTerminal={restartTerminal}
      />

      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: BG.editor }}>
        {/* Terminal instances — only render terminal type tabs */}
        {terminals
          .filter((t) => t.type === "terminal" || !t.type)
          .map((t) => (
            <TerminalInstance
              key={t.id}
              terminalId={t.id}
              isVisible={activeTerminalId === t.id}
              chromeBg={chromeBg}
              xtermInstances={xtermInstances}
              onExited={markExited}
            />
          ))}

        {terminals.length === 0 && (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: TEXT.muted,
              fontSize: fontSize.sm,
              height: "100%",
            }}
          >
            No tabs open
          </div>
        )}

        {searchOpen && activeSearchAddon && (
          <TerminalSearchBar searchAddon={activeSearchAddon} onClose={() => setSearchOpen(false)} />
        )}
      </div>
    </div>
  );
}
