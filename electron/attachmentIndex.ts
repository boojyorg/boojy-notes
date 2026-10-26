import fs from "node:fs";
import path from "node:path";
import { attachmentRef, pickAttachment } from "../src/utils/attachmentPath.js";
import { isDeletableOsCruft } from "./vaultFs.js";

/**
 * Which file an embed names, found as Obsidian finds it (`pickAttachment`):
 * the places a path spells are asked of the disk, live, so a file there wins
 * the moment it exists; only "any file of that name" reads an index.
 *
 * The index is every file in the vault that is not a note, by lowercased
 * name, with no cap: the sidebar's list stops at 5,000 files, and its display
 * limit must not decide whether a picture is found. It is built by one walk
 * the first time a name is looked up, not at launch, and kept by the watcher
 * (`fileWatcher.js`) and by the app's own saves; a vault switch drops it.
 */

let indexRoot: string | null = null;
let byName: Map<string, Set<string>> | null = null;

const toPosix = (rel: string) => rel.split(path.sep).join("/");
const isNoteName = (name: string) => name.toLowerCase().endsWith(".md");

/** The vault-relative POSIX path of `abs`, or null when it lies outside `notesDir`. */
function relIn(notesDir: string, abs: string): string | null {
  const rel = path.relative(path.resolve(notesDir), path.resolve(abs));
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? toPosix(rel) : null;
}

function add(rel: string) {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  if (!byName || name.startsWith(".") || isNoteName(name) || isDeletableOsCruft(name)) return;
  const key = name.toLowerCase();
  let paths = byName.get(key);
  if (!paths) byName.set(key, (paths = new Set()));
  paths.add(rel);
}

function build(notesDir: string) {
  indexRoot = notesDir;
  byName = new Map();
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), childRel);
      else if (entry.isFile()) add(childRel);
    }
  };
  walk(notesDir, "");
}

function indexFor(notesDir: string) {
  if (!byName || indexRoot !== notesDir) build(notesDir);
  return byName as Map<string, Set<string>>;
}

/** A file at this vault path, inside the vault. */
function fileAt(notesDir: string, rel: string): boolean {
  const root = path.resolve(notesDir);
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root + path.sep)) return false;
  return !!fs.statSync(abs, { throwIfNoEntry: false })?.isFile();
}

/**
 * The vault-relative path of the file `src` names for a note in `noteFolder`
 * (vault-relative, null at the root), or null when the vault holds none.
 * `markdown`: `src` is a `![](…)` address, read as a URL (`attachmentRef`).
 */
export function locateAttachment(
  notesDir: string,
  src: string,
  noteFolder: string | null = null,
  markdown = false,
): string | null {
  const ref = attachmentRef(src, markdown);
  if (!ref) return null;
  return pickAttachment(
    ref,
    noteFolder,
    (rel) => fileAt(notesDir, rel),
    (name) => [...(indexFor(notesDir).get(name) ?? [])].filter((rel) => fileAt(notesDir, rel)),
  );
}

/** Whether any file in the vault already has this name, ignoring case. */
export function nameTaken(notesDir: string, name: string): boolean {
  return !!indexFor(notesDir).get(name.toLowerCase())?.size;
}

/** A file appeared at `abs` (the watcher saw it, or the app wrote it). */
export function attachmentAdded(notesDir: string, abs: string) {
  if (indexRoot !== notesDir) return;
  const rel = relIn(notesDir, abs);
  if (rel) add(rel);
}

/** The file at `abs` went, or (`dir`) the directory at `abs` with everything in it. */
export function attachmentRemoved(notesDir: string, abs: string, dir = false) {
  if (!byName || indexRoot !== notesDir) return;
  const rel = relIn(notesDir, abs);
  if (!rel) return;
  if (!dir) {
    byName.get(rel.slice(rel.lastIndexOf("/") + 1).toLowerCase())?.delete(rel);
    return;
  }
  const under = `${rel}/`;
  for (const paths of byName.values()) {
    for (const p of paths) if (p.startsWith(under)) paths.delete(p);
  }
}

/** Forget the index (a vault switch); the next lookup walks the vault again. */
export function resetAttachmentIndex() {
  indexRoot = null;
  byName = null;
}
