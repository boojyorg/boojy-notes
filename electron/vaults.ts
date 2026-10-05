import fs from "node:fs";
import path from "node:path";

/**
 * The vaults the app has opened, for the sidebar's vault menu and Settings.
 * One vault is open at a time; the list only remembers where the others are.
 * Shown A–Z by name, never by recency, so a switch does not reshuffle the
 * rows under the pointer; every surface reads this one order. A vault may
 * carry a label, its name in the app alone: the folder on disk keeps its own
 * (Obsidian or a sync service may point at it). A missing vault stays
 * listed (an unplugged drive comes back) and is never recreated; only
 * Settings removes one from the list, and never from disk.
 */

export type VaultEntry = {
  path: string;
  /** The name the app shows: the label given in Settings, else the folder's own name. */
  name: string;
  /** The folder's own name on disk. */
  folderName: string;
  current: boolean;
  exists: boolean;
  /** Inside a cloud-synced folder (iCloud Drive, Dropbox, Google Drive, OneDrive). */
  cloud: boolean;
};

const CLOUD_MARKERS = [
  `${path.sep}Library${path.sep}Mobile Documents${path.sep}`,
  `${path.sep}Library${path.sep}CloudStorage${path.sep}`,
  `${path.sep}Dropbox${path.sep}`,
  // Windows: OneDrive (personal, or `OneDrive - Company`), Google Drive's
  // mirrored `My Drive`, iCloud for Windows.
  `${path.sep}OneDrive${path.sep}`,
  `${path.sep}OneDrive - `,
  `${path.sep}My Drive${path.sep}`,
  `${path.sep}iCloudDrive${path.sep}`,
];

export const isCloudPath = (dir: string) =>
  CLOUD_MARKERS.some((marker) => `${path.resolve(dir)}${path.sep}`.includes(marker));

const same = (a: string, b: string) => path.resolve(a) === path.resolve(b);

/** Labels by vault path, keyed as `same` compares: a vault's name in the app alone. */
export type VaultLabels = Record<string, string>;

const labelsOf = (labels: unknown): VaultLabels =>
  labels && typeof labels === "object" ? (labels as VaultLabels) : {};

/**
 * The labels with `dir` named `name`: one line, trimmed. Empty, or the
 * folder's own name, clears it, so the row goes back to what Finder says.
 */
export function labelVault(labels: unknown, dir: string, name: unknown): VaultLabels {
  const next = { ...labelsOf(labels) };
  const key = path.resolve(dir);
  const label = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (!label || label === path.basename(key)) delete next[key];
  else next[key] = label;
  return next;
}

/** The labels without `dir`'s: a vault removed from the list forgets its name. */
export function unlabelVault(labels: unknown, dir: string): VaultLabels {
  const next = { ...labelsOf(labels) };
  delete next[path.resolve(dir)];
  return next;
}

/** Finder's order: case and accents ignored, `Year 2` before `Year 10`. */
const byName = (a: VaultEntry, b: VaultEntry) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
  a.path.localeCompare(b.path);

/** The list with `dir` in it: appended when new, otherwise unchanged. */
export function rememberVault(list: string[] | undefined, dir: string): string[] {
  const known = Array.isArray(list) ? list.filter((p) => typeof p === "string") : [];
  return known.some((p) => same(p, dir)) ? known : [...known, dir];
}

/** The list without `dir`. The open vault is never forgotten. */
export function forgetVault(list: string[] | undefined, dir: string, current: string): string[] {
  const known = rememberVault(list, current);
  if (same(dir, current)) return known;
  return known.filter((p) => !same(p, dir));
}

/** Whether `dir` is one the app has opened: the only paths the renderer may switch to. */
export const isKnownVault = (list: string[] | undefined, dir: string) =>
  Array.isArray(list) && list.some((p) => same(p, dir));

export function vaultEntries(
  list: string[] | undefined,
  current: string,
  labels?: unknown,
): VaultEntry[] {
  const named = labelsOf(labels);
  return rememberVault(list, current)
    .map((p) => {
      const folderName = path.basename(p) || p;
      return {
        path: p,
        name: named[path.resolve(p)] || folderName,
        folderName,
        current: same(p, current),
        exists: fs.existsSync(p),
        cloud: isCloudPath(p),
      };
    })
    .sort(byName);
}
