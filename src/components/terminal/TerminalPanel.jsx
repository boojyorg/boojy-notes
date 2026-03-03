import { useEffect, useState, useCallback } from "react";
import TerminalTabBar from "./TerminalTabBar";
import TerminalInstance from "./TerminalInstance";
import TerminalSearchBar from "./TerminalSearchBar";
import { BG, TEXT } from "../../constants/colors";

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
  chromeBg,
  activeTabBg,
  isOpen,
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  // Auto-create first terminal when panel opens with none
  useEffect(() => {
    if (isOpen && terminals.length === 0 && window.electronAPI?.terminal) {
      createTerminal();
    }
  }, [isOpen]);

  // Keyboard shortcuts when terminal focused
  useEffect(() => {
    const handler = (e) => {
      if (!isOpen) return;
      const mod = e.metaKey || e.ctrlKey;
      // Cmd+F — search in terminal
      if (mod && e.key === "f") {
        // Only intercept if a terminal element is focused
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
  }, [isOpen, activeTerminalId, clearTerminal]);

  // Close search when switching tabs
  useEffect(() => {
    setSearchOpen(false);
  }, [activeTerminalId]);

  const activeSearchAddon = activeTerminalId
    ? xtermInstances.current.get(activeTerminalId)?.searchAddon
    : null;

  if (!isOpen) return null;

  // No electron API — show placeholder
  if (!window.electronAPI?.terminal) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: TEXT.muted, fontSize: 12 }}>
        Terminal requires Electron
      </div>
    );
  }

  return (
    <div data-terminal-panel style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative", background: BG.editor }}>
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
        {terminals.map((t) => (
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
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            color: TEXT.muted, fontSize: 12, height: "100%",
          }}>
            No terminals open
          </div>
        )}

        {searchOpen && activeSearchAddon && (
          <TerminalSearchBar
            searchAddon={activeSearchAddon}
            onClose={() => setSearchOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
