import { useSyncExternalStore } from "react";

/**
 * EXPERIMENT (2026-09-27), switched from the dev panel (`pnpm dev:tweak`):
 * how the writing column meets a wide window. Once one is judged, the other
 * two and this switch go.
 *
 * - `fixed`: one width, centred; the spare room is margin (Notion's way).
 * - `scale`: past half a large screen the whole note grows together, type,
 *   spacing and column, up to SCALE_MAX, so a line holds the same words and
 *   full screen reads as the half-screen view, larger (iA Writer's way).
 * - `wider`: the column alone grows, to WIDER_MAX; lines get longer.
 */
export type ColumnFit = "fixed" | "scale" | "wider";

/** The column's width at rest, gutters included. */
export const COL_MAX = 720;
/** Pane width (CSS px) where growing starts, and where it is spent. */
const GROW_FROM = 900;
const GROW_TO = 1500;
const SCALE_MAX = 1.12;
const WIDER_MAX = 820;

const LS_KEY = "boojy-dev-column-fit";
let current: ColumnFit = "fixed";
if (import.meta.env.DEV) {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === "scale" || saved === "wider") current = saved;
  } catch {}
}
const listeners = new Set<() => void>();

export function setColumnFit(next: ColumnFit): void {
  current = next;
  try {
    localStorage.setItem(LS_KEY, next);
  } catch {}
  for (const listener of listeners) listener();
}

export const getColumnFit = (): ColumnFit => current;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useColumnFit(): ColumnFit {
  return useSyncExternalStore(subscribe, getColumnFit, getColumnFit);
}

/** How far through the growing range a pane of `pane` CSS px is, 0 to 1. */
const grown = (pane: number) =>
  Math.min(1, Math.max(0, (pane - GROW_FROM) / (GROW_TO - GROW_FROM)));

/**
 * The column for a pane `pane` CSS px wide: its `maxWidth` and `zoom` (both
 * in the column's own pixels, as CSS applies them) and the left margin that
 * centres it, in the column's own pixels too (a zoomed element's margin is
 * zoomed with it).
 */
export function columnGeometry(
  fit: ColumnFit,
  pane: number,
): { maxWidth: number; zoom: number; marginLeft: number } {
  const zoom = fit === "scale" ? 1 + (SCALE_MAX - 1) * grown(pane) : 1;
  const maxWidth = fit === "wider" ? COL_MAX + (WIDER_MAX - COL_MAX) * grown(pane) : COL_MAX;
  const marginLeft = Math.max(0, (pane - maxWidth * zoom) / 2) / zoom;
  return { maxWidth, zoom, marginLeft };
}
