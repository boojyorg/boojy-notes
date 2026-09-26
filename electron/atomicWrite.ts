import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Crash-safe write: write to a temp file, fsync it, then rename over the
 * target. Rename is atomic on the same volume, so a crash mid-write leaves the
 * previous file intact instead of a truncated one. The fsync before the rename
 * matters for power loss: without it the rename can hit the journal while the
 * data is still only in the page cache, leaving the target pointing at zeroed
 * blocks. The temp file is `.~<name>.tmp` (`tempPathFor`): the dot keeps it
 * invisible to the chokidar watcher and the vault walk, and `.~` is a prefix
 * Dropbox never syncs, so a vault in a sync folder does not upload a file
 * that exists for a few milliseconds per save to every other device.
 *
 * Used for notes, the ID index, and the app's own `config.json` and
 * `settings.json`: a torn config would send the next launch to the default
 * vault, which to the user reads as every note gone.
 *
 * The file's permission bits are the user's, not the app's: a `chmod 600`
 * private note, or a vault shared read-only with a group, must come out of a
 * save as it went in. The rename would otherwise land a fresh file over it
 * (0600 became 0644 on the first save until 2026-09-09), so the temp file
 * takes the bits of `modeFrom`, the file this write replaces (`filePath`
 * itself unless the caller is renaming a note away from its old file). A
 * write with nothing to replace makes a file the way any new file is made,
 * from the process umask alone: a temp file a crash left under the same name
 * is removed first rather than reopened, or its mode would be the new file's.
 * Only the nine permission bits are kept; setuid, setgid and sticky mean
 * nothing on a text file.
 *
 * On macOS the rest of what Finder shows is kept too: the temp file starts as
 * `cp -p` of the file it replaces (Finder tags and other extended attributes,
 * ACLs, the created date), then takes the new text. Node has no xattr API,
 * and `cp` costs ~2 ms a save. A symlinked note is written through to its
 * target, so the link survives the save (the rename would replace it with a
 * plain file).
 */
export const tempPathFor = (filePath: string): string =>
  path.join(path.dirname(filePath), `.~${path.basename(filePath)}.tmp`);

export function writeFileAtomic(filePath: string, data: string, modeFrom = filePath): void {
  const sameTarget = modeFrom === filePath;
  filePath = throughSymlink(filePath);
  if (sameTarget) modeFrom = filePath;
  const tmpPath = tempPathFor(filePath);
  const mode = existingMode(modeFrom);
  fs.rmSync(tmpPath, { force: true });
  const fd = openCarrying(modeFrom, tmpPath, mode !== null);
  try {
    if (mode !== null) fs.fchmodSync(fd, mode);
    fs.writeSync(fd, data, null, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
  // Persist the directory entry too, so the rename itself survives power loss.
  // Best-effort: Windows cannot fsync a directory handle opened this way.
  try {
    const dirFd = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    /* directory fsync unsupported on this platform */
  }
}

/** The file a symlink at `p` points to (a link to a link, to the last); `p` otherwise. */
function throughSymlink(p: string): string {
  try {
    return fs.lstatSync(p).isSymbolicLink() ? fs.realpathSync(p) : p;
  } catch {
    return p;
  }
}

/**
 * The temp file, open for the new text: on macOS a `cp -p` of the file it
 * replaces, emptied, so its attributes and created date come along; anywhere
 * else, or when the copy fails, a new file.
 */
function openCarrying(source: string, tmpPath: string, sourceExists: boolean): number {
  if (process.platform === "darwin" && sourceExists) {
    try {
      execFileSync("/bin/cp", ["-p", source, tmpPath], { stdio: "ignore" });
      const fd = fs.openSync(tmpPath, "r+");
      fs.ftruncateSync(fd, 0);
      return fd;
    } catch {
      fs.rmSync(tmpPath, { force: true });
    }
  }
  return fs.openSync(tmpPath, "w");
}

/** The permission bits of the regular file at `p`, or null when there is none to keep. */
function existingMode(p: string): number | null {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st.mode & 0o777 : null;
  } catch {
    return null;
  }
}
