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
 * - `wider`: the column alone grows, to `wideCap`; lines get longer.
 *
 * Two dials ride with it: `wideCap` (the widest the wider column gets) and
 * `leftShare` (how much of the spare room goes left of the column: 0.5
 * centres it, less sits it nearer the sidebar).
 */
export type Fit = "fixed" | "scale" | "wider";
export interface ColumnFit {
  fit: Fit;
  wideCap: number;
  leftShare: number;
}
export const DEFAULT_COLUMN_FIT: ColumnFit = { fit: "fixed", wideCap: 820, leftShare: 0.5 };

/** The column's width at rest, gutters included. */
export const COL_MAX = 720;
/** Pane width (CSS px) where growing starts, and where it is spent. */
const GROW_FROM = 900;
const GROW_TO = 1500;
const SCALE_MAX = 1.12;

const LS_KEY = "boojy-dev-column-fit-v2";
let current: ColumnFit = DEFAULT_COLUMN_FIT;
if (import.meta.env.DEV) {
  try {
    current = { ...DEFAULT_COLUMN_FIT, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {}
}
const listeners = new Set<() => void>();

export function setColumnFit(next: Partial<ColumnFit>): void {
  current = { ...current, ...next };
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(current));
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
  { fit, wideCap, leftShare }: ColumnFit,
  pane: number,
): { maxWidth: number; zoom: number; marginLeft: number } {
  const zoom = fit === "scale" ? 1 + (SCALE_MAX - 1) * grown(pane) : 1;
  const maxWidth = fit === "wider" ? COL_MAX + (wideCap - COL_MAX) * grown(pane) : COL_MAX;
  const marginLeft = (Math.max(0, pane - maxWidth * zoom) * leftShare) / zoom;
  return { maxWidth, zoom, marginLeft };
}

/** True when the column is today's: one width, centred (CSS alone places it). */
export const isDefaultFit = (f: ColumnFit) => f.fit === "fixed" && f.leftShare === 0.5;
