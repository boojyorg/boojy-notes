import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

/**
 * One watch for a whole vault, whatever its size.
 *
 * chokidar without fsevents watched each file on its own, one open file per
 * note: a 500-note vault held 500 files open, which kept iCloud from evicting
 * any of them while the app ran and sat under the macOS default limit of 256
 * open files in a GUI app. Node's recursive `fs.watch` is one FSEvents stream
 * on macOS (one handle on Windows), whatever the tree holds.
 *
 * It says only "something happened at this path", so this keeps what the
 * vault held (each file's size, mtime and inode; each directory) and turns an
 * event into chokidar's vocabulary by looking: `add`, `change`, `unlink`,
 * `addDir`, `unlinkDir`, each also as `all`. A file is reported once it has
 * held still for `stabilityMs` (chokidar's awaitWriteFinish), so a save in
 * flight is never read half-written. A directory that arrives whole (moved
 * in, copied) reports every file in it; one that goes reports every file it
 * held. A path whose entry on disk is spelled differently (a case-only rename
 * on a case-insensitive volume) is gone at the old spelling.
 */

interface Entry {
  dir: boolean;
  size: number;
  mtimeMs: number;
  ino: number;
}

export interface TreeWatcherOptions {
  ignored: (filePath: string) => boolean;
  stabilityMs?: number;
  pollMs?: number;
}

export interface TreeWatcher {
  on(event: string, listener: (...args: string[]) => void): TreeWatcher;
  close(): Promise<void>;
}

export function watchTree(root: string, options: TreeWatcherOptions): TreeWatcher {
  const { ignored, stabilityMs = 300, pollMs = 50 } = options;
  const emitter = new EventEmitter();
  const known = new Map<string, Entry>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  let closed = false;

  const emit = (event: string, p: string) => {
    emitter.emit(event, p);
    emitter.emit("all", event, p);
  };

  /** The entry at `p` as the disk spells it, or null if there is none. */
  const look = (p: string): fs.Stats | null => {
    try {
      const st = fs.statSync(p);
      // A case-insensitive volume answers for any spelling: only the one the
      // directory holds is there.
      const names = fs.readdirSync(path.dirname(p));
      if (!names.includes(path.basename(p))) return null;
      return st;
    } catch {
      return null;
    }
  };

  const entryOf = (st: fs.Stats): Entry => ({
    dir: st.isDirectory(),
    size: st.size,
    mtimeMs: st.mtimeMs,
    ino: st.ino,
  });

  /** Everything under `dir` the watch should know, recorded without events. */
  const scan = (dir: string, report: boolean) => {
    let names: fs.Dirent[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      const p = path.join(dir, d.name);
      if (ignored(p) || known.has(p)) continue;
      let st: fs.Stats;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (d.isSymbolicLink()) continue; // never walk into a link: a loop
        known.set(p, entryOf(st));
        if (report) emit("addDir", p);
        scan(p, report);
      } else if (st.isFile()) {
        known.set(p, entryOf(st));
        if (report) emit("add", p);
      }
    }
  };

  const goneUnder = (dir: string) => {
    const under = [...known.keys()].filter((k) => k.startsWith(dir + path.sep));
    // Files first, then directories deepest first, as chokidar reports them.
    for (const k of under.filter((k) => !known.get(k)?.dir)) {
      known.delete(k);
      emit("unlink", k);
    }
    for (const k of under.filter((k) => known.get(k)?.dir).sort((a, b) => b.length - a.length)) {
      known.delete(k);
      emit("unlinkDir", k);
    }
  };

  /** What happened at `p`, decided by looking at it now. */
  const settle = (p: string) => {
    if (closed) return;
    const st = look(p);
    const prev = known.get(p);
    if (!st) {
      if (!prev) return;
      if (prev.dir) {
        goneUnder(p);
        known.delete(p);
        emit("unlinkDir", p);
      } else {
        known.delete(p);
        emit("unlink", p);
      }
      return;
    }
    if (st.isDirectory()) {
      if (!prev || !prev.dir) {
        if (prev) {
          known.delete(p);
          emit("unlink", p);
        }
        known.set(p, entryOf(st));
        emit("addDir", p);
        scan(p, true);
        return;
      }
      // Something inside changed and the stream said only so much: compare
      // the children with what is known of them.
      let names: string[] = [];
      try {
        names = fs.readdirSync(p);
      } catch {
        /* gone again; its own event follows */
      }
      const here = new Set(names.map((n) => path.join(p, n)));
      for (const k of known.keys()) if (path.dirname(k) === p && !here.has(k)) schedule(k);
      for (const k of here) if (!ignored(k) && !known.has(k)) schedule(k);
      return;
    }
    if (!st.isFile()) return;
    const now = entryOf(st);
    if (!prev || prev.dir) {
      if (prev?.dir) {
        goneUnder(p);
        emit("unlinkDir", p);
      }
      known.set(p, now);
      emit("add", p);
      return;
    }
    if (prev.size === now.size && prev.mtimeMs === now.mtimeMs && prev.ino === now.ino) return;
    known.set(p, now);
    emit("change", p);
  };

  /** Wait until the file at `p` holds still, then settle it. */
  const schedule = (p: string) => {
    clearTimeout(pending.get(p));
    let last = "";
    const check = () => {
      if (closed) return;
      let sig = "none";
      try {
        const st = fs.statSync(p);
        sig = `${st.size}:${st.mtimeMs}:${st.ino}`;
      } catch {
        /* gone: nothing to wait for */
      }
      if (sig !== last && sig !== "none") {
        last = sig;
        pending.set(p, setTimeout(check, pollMs));
        return;
      }
      pending.delete(p);
      settle(p);
    };
    pending.set(p, setTimeout(check, stabilityMs));
  };

  scan(root, false);
  const fsWatcher = fs.watch(root, { recursive: true }, (_type, filename) => {
    if (closed || !filename) return;
    const p = path.join(root, filename.toString());
    if (ignored(p)) return;
    schedule(p);
  });
  fsWatcher.on("error", (error) => emitter.emit("error", error));

  const api: TreeWatcher = {
    on(event, listener) {
      emitter.on(event, listener);
      return api;
    },
    close() {
      closed = true;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      fsWatcher.close();
      emitter.removeAllListeners();
      return Promise.resolve();
    },
  };
  return api;
}
