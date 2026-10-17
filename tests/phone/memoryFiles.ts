import { type FileOps, recoverWrites } from "../../src/phone/files";

/**
 * The phone's files in memory, case-sensitive as Android's storage is (the
 * Mac's is not). `failOn` throws the first call it answers true for, standing
 * for the app being killed at that moment.
 */
export function memoryFiles({
  failOn,
  coarseClock = false,
}: {
  failOn?: (op: string, path: string) => boolean;
  /** Writes land within one modified time: the app's writes alone don't move the clock. */
  coarseClock?: boolean;
} = {}): FileOps & {
  store: Map<string, Uint8Array | "dir">;
  /** Changes a file as something other than the app would: new bytes, a later time. */
  touch(path: string, bytes: Uint8Array): void;
} {
  const store = new Map<string, Uint8Array | "dir">();
  // Modified times, a clock that moves on every change, as a disk's would.
  const times = new Map<string, number>();
  let tick = 0;
  const parent = (p: string) => p.split("/").slice(0, -1).join("/");
  const ensureDir = (p: string) => {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++)
      if (parts[i - 1]) store.set(parts.slice(0, i).join("/"), "dir");
  };
  const children = (dir: string) => [...store.keys()].filter((p) => parent(p) === dir);
  const crash = (op: string, path: string) => {
    if (failOn?.(op, path)) {
      failOn = undefined;
      throw new Error(`killed at ${op} ${path}`);
    }
  };
  const ops: FileOps = {
    async list(dir) {
      return children(dir).map((p) => ({
        name: p.split("/").pop() as string,
        kind: store.get(p) === "dir" ? "dir" : "file",
        mtime: times.get(p) ?? 0,
        size: (() => {
          const v = store.get(p);
          return v && v !== "dir" ? v.length : 0;
        })(),
      }));
    },
    async read(p) {
      const v = store.get(p);
      return v && v !== "dir" ? v : null;
    },
    async write(p, bytes) {
      crash("write", p);
      ensureDir(parent(p));
      store.set(p, bytes);
      times.set(p, coarseClock ? tick : ++tick);
    },
    async rename(from, to) {
      crash("rename", from);
      if (store.has(to)) throw new Error(`${to} already exists`);
      const v = store.get(from);
      if (!v) throw new Error(`no file ${from}`);
      ensureDir(parent(to));
      // A directory moves with everything under it, as Android's rename does.
      for (const [p, entry] of [...store]) {
        if (p !== from && !p.startsWith(`${from}/`)) continue;
        store.delete(p);
        store.set(to + p.slice(from.length), entry);
        // A rename keeps a file's modified time, as Android's does.
        const time = times.get(p);
        times.delete(p);
        if (time !== undefined) times.set(to + p.slice(from.length), time);
      }
    },
    async remove(p) {
      crash("remove", p);
      store.delete(p);
    },
    async mkdir(p) {
      ensureDir(p);
    },
    async rmdir(p) {
      if (children(p).length) throw new Error(`${p} is not empty`);
      store.delete(p);
    },
    exists: async (p) => store.has(p),
    mtime: async (p) => (store.has(p) ? (times.get(p) ?? 0) : null),
    recover: (dir) => recoverWrites(ops, dir),
  };
  const touch = (p: string, bytes: Uint8Array) => {
    store.set(p, bytes);
    times.set(p, ++tick);
  };
  return Object.assign(ops, { store, touch });
}
