import { useState } from "react";

export function useNoteNavigation({ activeNote, setActiveNote, tabs, setTabs, expanded, setExpanded }) {
  const [newTabId, setNewTabId] = useState(null);
  const [closingTabs, setClosingTabs] = useState(new Set());

  const toggle = (n) => setExpanded((p) => ({ ...p, [n]: !p[n] }));

  const openNote = (id) => {
    setActiveNote(id);
    if (!tabs.includes(id)) {
      setTabs([...tabs, id]);
      setNewTabId(id);
      setTimeout(() => setNewTabId(null), 250);
    }
  };

  const closeTab = (e, id) => {
    e.stopPropagation();
    setClosingTabs(prev => new Set([...prev, id]));
    setTimeout(() => {
      setClosingTabs(prev => { const next = new Set(prev); next.delete(id); return next; });
      setTabs(prev => prev.filter(t => t !== id));
      if (activeNote === id) {
        const next = tabs.filter(t => t !== id);
        setActiveNote(next[next.length - 1] || null);
      }
    }, 180);
  };

  return { toggle, openNote, closeTab, newTabId, closingTabs };
}
