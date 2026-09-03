/**
 * TEMPORARY PROTOTYPE SCAFFOLDING — delete this whole directory once the
 * block-drag model is chosen (2026-09-03 live comparison on localhost:5173).
 *
 * Two models are wired side by side:
 *   "hold"   — the existing press-and-hold-400ms on the block text, polished
 *   "handle" — a hover-revealed grip in the left gutter; hold-to-drag removed
 *
 * The mode lives in localStorage so it survives HMR reloads, and is read
 * through `getDragMode()` from imperative code (useBlockDrag) and through
 * `useDragMode()` from components (BlockDragHandle, the switch itself).
 */
import { useSyncExternalStore } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";

const KEY = "boojy-drag-proto";
export const DRAG_MODES = ["hold", "handle"];

let current = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return DRAG_MODES.includes(v) ? v : "hold";
  } catch {
    return "hold";
  }
})();
const listeners = new Set();

export function getDragMode() {
  return current;
}

export function setDragMode(mode) {
  if (!DRAG_MODES.includes(mode) || mode === current) return;
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  for (const l of listeners) l();
}

function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDragMode() {
  return useSyncExternalStore(subscribe, getDragMode, getDragMode);
}

/** Bottom-right pill, dev builds only. Click flips the model. */
export function DragProtoSwitch() {
  const mode = useDragMode();
  const { theme } = useTheme();
  if (!import.meta.env.DEV) return null;
  const next = mode === "hold" ? "handle" : "hold";
  return (
    <button
      type="button"
      onClick={() => setDragMode(next)}
      title={`Block drag prototype — click to switch to "${next}"`}
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: Z.OVERLAY,
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${theme.BG.divider}`,
        background: theme.BG.elevated,
        color: theme.TEXT.secondary,
        boxShadow: theme.dragShadow,
        font: "inherit",
        fontSize: 12,
        cursor: "pointer",
        display: "flex",
        gap: 6,
        alignItems: "center",
      }}
    >
      <span style={{ color: theme.TEXT.muted }}>drag</span>
      <span style={{ color: theme.TEXT.primary, fontWeight: 600 }}>{mode}</span>
    </button>
  );
}
