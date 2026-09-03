import { useState, useCallback, useEffect, useRef } from "react";

const LS_KEY = "boojy_onboarding_seen";

const HINTS = [
  { id: "slash-commands", text: "Type / for commands" },
  { id: "wikilinks", text: "Try [[ to link notes", minNotes: 2 },
  { id: "tags", text: "Use #tags to organise", minNotes: 3 },
];

function loadSeen() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function useOnboardingHints({ noteCount, isEditorFocused }) {
  const [seen, setSeen] = useState(loadSeen);
  const [activeHint, setActiveHint] = useState(null);
  const timerRef = useRef(null);

  // Don't show hints to experienced users
  const shouldShow = noteCount < 10 && isEditorFocused;

  useEffect(() => {
    if (!shouldShow) {
      setActiveHint(null);
      return;
    }

    // Find the first unseen hint that matches conditions
    const hint = HINTS.find((h) => {
      if (seen.includes(h.id)) return false;
      if (h.minNotes && noteCount < h.minNotes) return false;
      return true;
    });

    setActiveHint(hint || null);
  }, [shouldShow, seen, noteCount]);

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    if (!activeHint) return;
    timerRef.current = setTimeout(() => {
      dismissHint(activeHint.id);
    }, 8000);
    return () => clearTimeout(timerRef.current);
  }, [activeHint]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismissHint = useCallback((id) => {
    setSeen((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
    setActiveHint(null);
  }, []);

  return { activeHint, dismissHint };
}
