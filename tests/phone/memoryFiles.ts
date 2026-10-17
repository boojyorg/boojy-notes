import { type FileOps, recoverWrites } from "../../src/phone/files";

/**
 * The phone's files in memory, case-sensitive as Android's storage is (the
 * Mac's is not). `failOn` throws the first call it answers true for, standing
 * for the app being killed at that moment.
 */
export function memoryFiles({
  failOn,
}: {
  failOn?: (op: string, path: string) => boolean;
} = {}): FileOps & {
  store: Map<string, Uint8Array | "dir">;
} {
  const store = new Map<string, Uint8Array | "dir">();
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
        mtime: 0,
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
    },
    async rename(from, to) {
      crash("rename", from);
      if (store.has(to)) throw new Error(`${to} already exists`);
      const v = store.get(from);
      if (!v || v === "dir") throw new Error(`no file ${from}`);
      ensureDir(parent(to));
      store.set(to, v);
      store.delete(from);
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
    mtime: async (p) => (store.has(p) ? 0 : null),
    recover: (dir) => recoverWrites(ops, dir),
  };
  return Object.assign(ops, { store });
}
