// A file that is not a note, shown in the note's place: which ones can be
// shown, how big a page is drawn, what each file remembers, and the link to
// one of its pages. Pure, so the viewer and its tests share one reading.

import type { OtherFile } from "../types/global";
import { baseName, splitExtension } from "./otherFiles";
import { parseWikilinkTarget } from "./wikilinkTarget";

/** How a file is shown: drawn as pages, as a picture, or as a card saying it can't be. */
export type FileViewKind = "pdf" | "picture" | "card";

/** Pictures Chromium draws (HEIC and TIFF it cannot, so they get the card). */
const PICTURES = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"]);

export function fileViewKind(name: string): FileViewKind {
  const ext = splitExtension(name).ext.slice(1).toLowerCase();
  if (ext === "pdf") return "pdf";
  return PICTURES.has(ext) ? "picture" : "card";
}

// ── Zoom ─────────────────────────────────────────────────────────────────

/** Fit Width, Fit Page (a picture's Fit), or a percentage of the page's own size. */
export type Zoom = { mode: "fitWidth" } | { mode: "fitPage" } | { mode: "pct"; pct: number };

export const FIT_WIDTH: Zoom = { mode: "fitWidth" };
export const FIT_PAGE: Zoom = { mode: "fitPage" };
export const ACTUAL_SIZE: Zoom = { mode: "pct", pct: 100 };

/**
 * Fit Width stops here, in CSS pixels: on a wide window a slide drawn edge to
 * edge was larger than anyone reads at, so a page sits centred with margins
 * as a note's column does. A landscape page may run wider than a portrait one.
 */
export const FIT_WIDTH_CAP = { landscape: 880, portrait: 760 };

/** The steps − and + walk, in per cent of the page's own size. */
export const ZOOM_STEPS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];

/**
 * The width a page is drawn at, in CSS pixels. `page` is its own size (a
 * PDF's points, a picture's pixels: 100%); `room` the pane's, less margins.
 * A picture is never enlarged by a fit (`fitNeverEnlarges`); a page is.
 */
export function pageWidth(
  zoom: Zoom,
  page: { width: number; height: number },
  room: { width: number; height: number },
  fitNeverEnlarges = false,
): number {
  if (zoom.mode === "pct") return (page.width * zoom.pct) / 100;
  const cap = page.width >= page.height ? FIT_WIDTH_CAP.landscape : FIT_WIDTH_CAP.portrait;
  const enlarge = fitNeverEnlarges ? page.width : Number.POSITIVE_INFINITY;
  const fitWidth = Math.min(room.width, cap, enlarge);
  if (zoom.mode === "fitWidth") return fitWidth;
  return Math.min(fitWidth, (room.height * page.width) / page.height);
}

/** The percentage a drawn width is of the page's own width, rounded for the label. */
export const zoomPercent = (drawnWidth: number, ownWidth: number) =>
  Math.round((drawnWidth / ownWidth) * 100);

/** One step in (+1) or out (-1) from `pct`, along `ZOOM_STEPS`; the ends hold. */
export function stepZoom(pct: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > pct + 0.5) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((s) => s < pct - 0.5) ?? ZOOM_STEPS[0];
}

/** Whether `zoom` is the mode a menu row stands for, for its tick. */
export function sameZoom(a: Zoom, b: Zoom): boolean {
  if (a.mode !== b.mode) return false;
  return a.mode !== "pct" || a.pct === (b as { pct: number }).pct;
}

// ── What each file remembers ──────────────────────────────────────────────

/**
 * Each file's zoom and page, per vault, in this machine's storage, never in
 * the vault: opening a file is not editing it. The newest are kept, so a
 * vault full of PDFs never grows the store without end.
 */
export const VIEW_KEY = "boojy-file-view";
export const VIEW_MAX = 200;

export interface FileViewState {
  zoom: Zoom;
  page: number;
}

type Store = Record<string, Record<string, FileViewState>>;

function readStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_KEY) || "null");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function validZoom(z: unknown): Zoom | null {
  if (!z || typeof z !== "object") return null;
  const mode = (z as { mode?: unknown }).mode;
  if (mode === "fitWidth" || mode === "fitPage") return { mode };
  const pct = (z as { pct?: unknown }).pct;
  if (mode === "pct" && typeof pct === "number" && pct > 0) return { mode, pct };
  return null;
}

/** What `rel` was left at in this vault, or null for a file never opened. */
export function readFileView(vaultKey: string, rel: string): FileViewState | null {
  const entry = readStore()[vaultKey]?.[rel];
  const zoom = validZoom(entry?.zoom);
  if (!zoom) return null;
  const page =
    Number.isInteger(entry?.page) && (entry?.page as number) > 0 ? (entry?.page as number) : 1;
  return { zoom, page };
}

/** Keep `rel`'s zoom and page, newest last; the oldest go past `VIEW_MAX`. */
export function writeFileView(vaultKey: string, rel: string, view: FileViewState): void {
  const store = readStore();
  const files = { ...(store[vaultKey] || {}) };
  delete files[rel];
  files[rel] = view;
  const keys = Object.keys(files);
  for (const key of keys.slice(0, Math.max(0, keys.length - VIEW_MAX))) delete files[key];
  store[vaultKey] = files;
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(store));
  } catch {}
}

// ── Links to a file, and to one of its pages ──────────────────────────────

/**
 * The shortest target that names this file and no other: its name, or its
 * vault-relative path when another file shares the name (Obsidian's rule,
 * as `linkTargetFor` for notes).
 */
export function fileLinkTarget(rel: string, files: OtherFile[]): string {
  const name = baseName(rel);
  const lower = name.toLowerCase();
  const namesake = files.some((f) => f.path !== rel && baseName(f.path).toLowerCase() === lower);
  return namesake ? rel : name;
}

/** `[[Lecture 3.pdf#page=12]]`: the link Copy Link to This Page writes. */
export const pageLink = (rel: string, page: number, files: OtherFile[]) =>
  `[[${fileLinkTarget(rel, files)}#page=${page}]]`;

/** The page a link's `#page=N` asks for, or null. */
export function linkedPage(subpath: string | null): number | null {
  const m = subpath?.match(/^page=(\d+)$/i);
  const n = m ? Number(m[1]) : 0;
  return n > 0 ? n : null;
}

/**
 * The file a `[[target]]` names, with the page it asks for: by its path when
 * the target gives a folder, else by its name when exactly one file has it.
 * Null when the target names no file (or several), so the note's own reading
 * takes over. A target ending in `.md` names a note, never a file.
 */
export function fileForTarget(
  target: string,
  files: OtherFile[],
): { path: string; page: number | null } | null {
  const { name, folder, subpath } = parseWikilinkTarget(target);
  if (!name || !splitExtension(name).ext || /\.md$/i.test(target.split("#")[0].trim())) return null;
  const lower = name.toLowerCase();
  const wanted = folder ? `${folder}/${name}`.toLowerCase() : null;
  const matches = files.filter((f) =>
    wanted ? f.path.toLowerCase() === wanted : baseName(f.path).toLowerCase() === lower,
  );
  return matches.length === 1 ? { path: matches[0].path, page: linkedPage(subpath) } : null;
}

/**
 * Words selected on a PDF page as a Markdown quote that says where they came
 * from: each line of the selection quoted as the page drew it, then the page's
 * link, so the note keeps the words and the way back (Obsidian reads it too).
 */
export function quoteWithLink(text: string, link: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return [...lines.map((l) => `> ${l}`), `> — ${link}`].join("\n");
}
