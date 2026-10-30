import fs from "node:fs";
import path from "node:path";

/**
 * Notes opened from outside the app: Finder's Open With or a double-click
 * (macOS `open-file`), or a path on the command line (Windows and Linux, at
 * launch or in a second launch's `second-instance`).
 *
 * A request can arrive before the app is ready or before the window has
 * read its notes, so each waits here, in order, until the window asks for
 * them (`take-open-requests`) once its notes have loaded; later ones go
 * straight to it. Each is answered from the file's real path, so a symlink
 * or a path typed in another casing is the same file:
 * - `note`: inside a storage location, at `rel` (the note index's own
 *   spelling: relative to the location, the OS's separators);
 * - `outside`: in none of them;
 * - `missing`: not there, or not a file.
 */

export type OpenRequest =
  | { kind: "note"; vault: string; rel: string }
  | { kind: "outside"; path: string }
  | { kind: "missing"; path: string };

/** A note's file: the app reads and writes `.md` only. */
export const isNotePath = (p: string) => /\.md$/i.test(p);

/** The note paths among a launch's arguments, resolved against the directory it was run in. */
export function notePathsIn(argv: readonly string[], cwd: string): string[] {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith("-") && isNotePath(a))
    .map((a) => path.resolve(cwd, a));
}

const realPath = (p: string): string | null => {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
};

/** Which storage location holds `file`, if any; `vaults` the current one first. */
export function classifyOpen(file: string, vaults: readonly string[]): OpenRequest {
  const abs = realPath(file);
  if (!abs || !fs.statSync(abs).isFile()) return { kind: "missing", path: file };
  for (const vault of vaults) {
    const root = realPath(vault);
    if (!root) continue;
    const rel = path.relative(root, abs);
    if (rel && !rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
      return { kind: "note", vault, rel };
  }
  return { kind: "outside", path: abs };
}

/**
 * The queue between the OS and the window. `send` delivers one answered
 * request to a window that has taken the queue; `vaults` lists the storage
 * locations, current first, read at delivery (a switch may come between).
 */
export function openRequestQueue({
  send,
  vaults,
}: {
  send: (request: OpenRequest) => boolean;
  vaults: () => string[];
}) {
  let waiting: string[] = [];
  let taken = false;
  return {
    /** Paths from the OS: delivered now if the window has its notes, else held. */
    add(paths: readonly string[]) {
      for (const p of paths) {
        if (taken && send(classifyOpen(p, vaults()))) continue;
        waiting.push(p);
      }
    },
    /** The window has its notes: everything held, answered, in order. */
    take(): OpenRequest[] {
      taken = true;
      const all = waiting.map((p) => classifyOpen(p, vaults()));
      waiting = [];
      return all;
    },
    /** A window loading afresh has not read its notes yet. */
    reset() {
      taken = false;
    },
  };
}
