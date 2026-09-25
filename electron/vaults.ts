import fs from "node:fs";
import path from "node:path";

/**
 * The vaults the app has opened, for the sidebar's vault menu and File → Open
 * Recent. One vault is open at a time; the list only remembers where the
 * others are. It keeps the order they were first opened, never recency, so a
 * switch does not reshuffle the rows under the pointer. A missing vault stays
 * listed (an unplugged drive comes back) and is never recreated; only
 * Settings removes one from the list, and never from disk.
 */

export type VaultEntry = {
  path: string;
  /** The folder's own name: the sidebar's label, as a note's title is its filename. */
  name: string;
  current: boolean;
  exists: boolean;
  /** Inside a cloud-synced folder (iCloud Drive, Dropbox, Google Drive, OneDrive). */
  cloud: boolean;
};

const CLOUD_MARKERS = [
  `${path.sep}Library${path.sep}Mobile Documents${path.sep}`,
  `${path.sep}Library${path.sep}CloudStorage${path.sep}`,
  `${path.sep}Dropbox${path.sep}`,
];

export const isCloudPath = (dir: string) =>
  CLOUD_MARKERS.some((marker) => `${path.resolve(dir)}${path.sep}`.includes(marker));

const same = (a: string, b: string) => path.resolve(a) === path.resolve(b);

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

export function vaultEntries(list: string[] | undefined, current: string): VaultEntry[] {
  return rememberVault(list, current).map((p) => ({
    path: p,
    name: path.basename(p) || p,
    current: same(p, current),
    exists: fs.existsSync(p),
    cloud: isCloudPath(p),
  }));
}
