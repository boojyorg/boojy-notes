import fs from "node:fs";
import path from "node:path";

/**
 * Crash-safe write: write to a temp file, fsync it, then rename over the
 * target. Rename is atomic on the same volume, so a crash mid-write leaves the
 * previous file intact instead of a truncated one. The fsync before the rename
 * matters for power loss: without it the rename can hit the journal while the
 * data is still only in the page cache, leaving the target pointing at zeroed
 * blocks. The dot-prefix keeps the temp file invisible to the chokidar watcher
 * and the vault walk.
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
 * nothing on a text file. Birthtime and extended attributes (Finder tags) are
 * not carried over; that is a separate decision (backlog).
 */
export function writeFileAtomic(filePath: string, data: string, modeFrom = filePath): void {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp`);
  const mode = existingMode(modeFrom);
  fs.rmSync(tmpPath, { force: true });
  const fd = fs.openSync(tmpPath, "w");
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

/** The permission bits of the regular file at `p`, or null when there is none to keep. */
function existingMode(p: string): number | null {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st.mode & 0o777 : null;
  } catch {
    return null;
  }
}
