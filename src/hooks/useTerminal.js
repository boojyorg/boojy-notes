import { useState, useRef, useCallback, useEffect } from "react";

let tabIdCounter = 0;

export function useTerminal() {
  const [terminals, setTerminals] = useState([]);
  const [activeTerminalId, setActiveTerminalId] = useState(null);
  const xtermInstances = useRef(new Map()); // id → { terminal, fitAddon, searchAddon }

  const createTerminal = useCallback(() => {
    const id = `tab-${++tabIdCounter}`;
    const entry = { id, title: "zsh" };
    setTerminals((prev) => [...prev, entry]);
    setActiveTerminalId(id);
    return entry;
  }, []);

  const closeTerminal = useCallback((id) => {
    // Instance will unmount when removed from state → kills its own PTY
    xtermInstances.current.delete(id);
    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      setActiveTerminalId((curId) => {
        if (curId !== id) return curId;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  }, []);

  const renameTerminal = useCallback((id, title) => {
    setTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)));
  }, []);

  const restartTerminal = useCallback(
    (id) => {
      // Close the tab, then create a new one
      closeTerminal(id);
      // Use setTimeout so the old instance unmounts first
      setTimeout(() => createTerminal(), 50);
    },
    [closeTerminal, createTerminal],
  );

  const clearTerminal = useCallback((id) => {
    const inst = xtermInstances.current.get(id);
    if (inst?.terminal) inst.terminal.clear();
  }, []);

  const markExited = useCallback((id) => {
    setTerminals((prev) => prev.map((t) => (t.id === id ? { ...t, isExited: true } : t)));
  }, []);

  // Cleanup all PTYs on unmount
  useEffect(() => {
    return () => {
      const api = window.electronAPI?.terminal;
      if (api) api.killAll().catch(() => {});
    };
  }, []);

  return {
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
  };
}
