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
 */
export function writeFileAtomic(filePath: string, data: string): void {
  const tmpPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp`);
  const fd = fs.openSync(tmpPath, "w");
  try {
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
