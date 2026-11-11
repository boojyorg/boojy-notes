import type { FileOps } from "./files";
import { syncFolderName, syncFolderPath } from "./syncFolder";

/**
 * The phone's storage locations: each a set of notes with its own vault,
 * Recently Deleted, note ids and Dropbox connection, one of them open at a
 * time. The app is built for the open one (`install.ts`) and started again to
 * open another, so the vault, its queue and sync's worker stay single.
 *
 * **The first location is the one the phone always had, where it always
 * was**: its files stay at the storage's own `vault/`, `state/` and
 * `deleted/`. Every other location keeps the same three under
 * `locations/<id>/`. So an install from before locations needs nothing moved,
 * and holds no list until a second location is added.
 */
export interface Location {
  id: string;
  /** The name it was given; without one it is named after where its notes are. */
  name?: string;
}

export interface Locations {
  /** The location the app opens. */
  open: string;
  list: Location[];
  /**
   * The list was there and could not be read, so this is the first location
   * alone, to open by: never written back, which would drop the others.
   */
  damaged?: true;
}

/** The first location: the storage's own top level. */
export const MAIN = "main";
const LIST = "state/locations.json";
/** An id is part of a path: letters and digits only. */
const ID = /^[a-z0-9]+$/;
const alone = (): Locations => ({ open: MAIN, list: [{ id: MAIN }] });
const unread = (): Locations => ({ ...alone(), damaged: true });

/** A new location's id: random, never its name, which can change and can be another's later. */
export function newLocationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `l${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Why `name` can't be a new location's, or null: it needs one, and one no other row shows. */
export function nameProblem(name: string, taken: string[]): string | null {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return "Give it a name.";
  return taken.some((t) => t.trim().toLowerCase() === wanted)
    ? "Another location has this name."
    : null;
}

/** A location as Home and Settings list it. */
export interface LocationRow {
  id: string;
  name: string;
  /** It was given a name; without one it follows the Dropbox folder it syncs with. */
  named: boolean;
  open: boolean;
  /** The Dropbox folder it syncs with ("" is the app folder itself); null with none. */
  dropbox: string | null;
  /** The folder its notes are in on the phone, as a person reads it; null inside the app. */
  phone: string | null;
}

/** Where a location's notes are, in one line: in Dropbox if it syncs, else on the phone. */
export const whereOf = ({ dropbox, phone }: LocationRow) =>
  dropbox !== null ? syncFolderPath(dropbox) : (phone ?? "Inside the app");

/** Everything under `dir`, then `dir` itself; nothing when it isn't there. */
export async function removeTree(files: FileOps, dir: string): Promise<void> {
  for (const entry of await files.list(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.kind === "dir") await removeTree(files, path);
    else await files.remove(path);
  }
  if (await files.exists(dir)) await files.rmdir(dir);
}

/**
 * A location's own files in the app's storage go: its note ids, bin, sync
 * record and sign-in, and the notes of one kept inside the app. A folder it
 * kept its notes in is outside the app's storage, and is not touched. The
 * first location's are the storage's own top level, less the list itself.
 */
export async function removeLocationFiles(root: FileOps, id: string) {
  if (id !== MAIN) return removeTree(root, `locations/${id}`);
  for (const entry of await root.list("")) {
    if (entry.name === "locations") continue;
    if (entry.name !== "state") {
      if (entry.kind === "dir") await removeTree(root, entry.name);
      else await root.remove(entry.name);
      continue;
    }
    for (const kept of await root.list("state")) {
      if (`state/${kept.name}` === LIST) continue;
      if (kept.kind === "dir") await removeTree(root, `state/${kept.name}`);
      else await root.remove(`state/${kept.name}`);
    }
  }
}

/**
 * The rows with the open one as sync has it now (`folder`: its Dropbox
 * folder, null with none, undefined where sync isn't known): where it is, and
 * its name when it has none of its own. A connect or disconnect then shows at
 * once; a closed location's can't change while it is closed.
 */
export function liveRows(rows: LocationRow[], folder: string | null | undefined): LocationRow[] {
  if (folder === undefined) return rows;
  return rows.map((row) =>
    row.open
      ? {
          ...row,
          dropbox: folder,
          name: row.named ? row.name : folder === null ? "Phone" : syncFolderName(folder),
        }
      : row,
  );
}

/** Where a location keeps its files in the phone's storage: "" for the first. */
export const prefixOf = (id: string) => (id === MAIN ? "" : `locations/${id}/`);

/**
 * The list as kept; the first location alone before one was written, or when
 * it can't be read (`damaged`): the app then opens the notes it always had,
 * and another location's files stay where they are. An open location that is
 * not listed is the first listed.
 */
export async function readLocations(root: FileOps): Promise<Locations> {
  try {
    const bytes = await root.read(LIST);
    if (!bytes) return alone();
    const kept = JSON.parse(new TextDecoder().decode(bytes));
    const seen = new Set<string>();
    const list: Location[] = [];
    for (const entry of Array.isArray(kept?.list) ? kept.list : []) {
      if (typeof entry?.id !== "string" || !ID.test(entry.id) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      list.push(
        typeof entry.name === "string" ? { id: entry.id, name: entry.name } : { id: entry.id },
      );
    }
    if (!list.length) return unread();
    return { open: seen.has(kept.open) ? kept.open : list[0].id, list };
  } catch {
    return unread();
  }
}

export async function writeLocations(root: FileOps, { open, list, damaged }: Locations) {
  if (damaged) {
    throw new Error(
      "The list of storage locations couldn't be read. Restart the app and try again.",
    );
  }
  for (const { id } of list) {
    if (!ID.test(id)) throw new Error(`"${id}" can't name a storage location`);
  }
  await root.write(LIST, new TextEncoder().encode(JSON.stringify({ open, list })));
}

/**
 * `files` as one location sees it: every path under `prefix`. The vault and
 * sync keep asking for `vault/…` and `state/…` and never know which location
 * they are.
 */
export function scopedFiles(files: FileOps, prefix: string): FileOps {
  if (!prefix) return files;
  const at = (path: string) => prefix + path;
  const walk = files.walk?.bind(files);
  const readMany = files.readMany?.bind(files);
  return {
    list: (dir) => files.list(at(dir)),
    read: (path) => files.read(at(path)),
    write: (path, bytes) => files.write(at(path), bytes),
    rename: (from, to) => files.rename(at(from), at(to)),
    remove: (path) => files.remove(at(path)),
    mkdir: (path) => files.mkdir(at(path)),
    rmdir: (path) => files.rmdir(at(path)),
    exists: (path) => files.exists(at(path)),
    mtime: (path) => files.mtime(at(path)),
    recover: (dir) => files.recover(at(dir)),
    ...(walk && { walk: (dir: string) => walk(at(dir)) }),
    ...(readMany && { readMany: (paths: string[]) => readMany(paths.map(at)) }),
  };
}
