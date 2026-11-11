import type { FileOps } from "./files";

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
}

/** The first location: the storage's own top level. */
export const MAIN = "main";
const LIST = "state/locations.json";
/** An id is part of a path: letters and digits only. */
const ID = /^[a-z0-9]+$/;
const alone = (): Locations => ({ open: MAIN, list: [{ id: MAIN }] });

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
  open: boolean;
}

/** Where a location keeps its files in the phone's storage: "" for the first. */
export const prefixOf = (id: string) => (id === MAIN ? "" : `locations/${id}/`);

/**
 * The list as kept; the first location alone before one was written, or when
 * it can't be read: the app then opens the notes it always had, and another
 * location's files stay where they are. An open location that is not listed
 * is the first listed.
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
    if (!list.length) return alone();
    return { open: seen.has(kept.open) ? kept.open : list[0].id, list };
  } catch {
    return alone();
  }
}

export async function writeLocations(root: FileOps, locations: Locations) {
  for (const { id } of locations.list) {
    if (!ID.test(id)) throw new Error(`"${id}" can't name a storage location`);
  }
  await root.write(LIST, new TextEncoder().encode(JSON.stringify(locations)));
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
