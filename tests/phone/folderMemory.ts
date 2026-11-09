import type { FileOps } from "../../src/phone/files";
import {
  type FolderAccessPlugin,
  type FolderEntry,
  folderFiles,
} from "../../src/phone/folderFiles";
import { routedFiles } from "../../src/phone/routedFiles";
import type { memoryFiles as MemoryFiles } from "./memoryFiles";

interface Node {
  id: string;
  name: string;
  parent: string | null;
  bytes: Uint8Array | null; // null: a folder
  mtime: number;
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
const missing = (what: string) =>
  Object.assign(new Error(`Missing file ${what}`), { code: "MISSING" });

/**
 * Android's folder access in memory, with the behaviour the plugin showed on
 * a Pixel: a file is an opaque id (new after a rename), a name that is taken
 * is never refused but answered with another (`b (1).md`), names differ by
 * case yet only one of a spelling fits, removing a folder removes what is in
 * it, and a write in place that dies leaves the file cut short. `failOn`
 * kills the first call it answers true for.
 */
export function fakeFolderAccess({
  failOn,
}: {
  failOn?: (op: string, name: string) => boolean;
} = {}) {
  const nodes = new Map<string, Node>([
    ["root", { id: "root", name: "", parent: null, bytes: null, mtime: 0 }],
  ]);
  const calls: string[] = [];
  let serial = 0;
  let tick = 0;
  const kids = (id: string) => [...nodes.values()].filter((n) => n.parent === id);
  const node = (id: string) => {
    const n = nodes.get(id);
    if (!n) throw missing(id);
    return n;
  };
  const entryOf = (n: Node): FolderEntry => ({
    id: n.id,
    name: n.name,
    dir: n.bytes === null,
    mtime: n.mtime,
    size: n.bytes?.length ?? 0,
  });
  const takenIn = (parent: string, name: string, own?: string) =>
    kids(parent).some((n) => n.id !== own && n.name.toLowerCase() === name.toLowerCase());
  const freeBeside = (parent: string, name: string) => {
    const dot = name.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let i = 1; ; i++)
      if (!takenIn(parent, `${stem} (${i})${ext}`)) return `${stem} (${i})${ext}`;
  };
  const crash = (op: string, name: string) => {
    if (failOn?.(op, name)) {
      failOn = undefined;
      throw new Error(`killed at ${op} ${name}`);
    }
  };
  const drop = (id: string) => {
    for (const k of kids(id)) drop(k.id);
    nodes.delete(id);
  };
  const pathOf = (n: Node): string =>
    n.parent && n.parent !== "root" ? `${pathOf(node(n.parent))}/${n.name}` : n.name;

  const plugin: FolderAccessPlugin = {
    ensureDefault: async () => ({ made: true, initial: "root" }),
    pick: async () => ({ picked: true, tree: "tree", root: "root" }),
    persisted: async () => ({ trees: [{ tree: "tree", root: "root" }] }),
    async list({ id }) {
      calls.push("list");
      node(id);
      return { entries: kids(id).map(entryOf) };
    },
    async walk({ id }) {
      calls.push("walk");
      node(id);
      const entries: (FolderEntry & { path: string })[] = [];
      let level: [string, string][] = [[id, ""]];
      while (level.length) {
        const next: [string, string][] = [];
        for (const [dir, path] of level) {
          for (const n of kids(dir)) {
            const at = path ? `${path}/${n.name}` : n.name;
            entries.push({ ...entryOf(n), path: at });
            if (n.bytes === null && !n.name.startsWith(".")) next.push([n.id, at]);
          }
        }
        level = next;
      }
      return { entries };
    },
    async readMany({ ids }) {
      calls.push(`readMany ${ids.length}`);
      return {
        data: ids.map((id) =>
          nodes.get(id)?.bytes ? b64(nodes.get(id)?.bytes as Uint8Array) : null,
        ),
      };
    },
    async create({ parent, name, data, dir }) {
      calls.push("create");
      crash("create", name);
      node(parent);
      const got = takenIn(parent, name) ? (dir ? freeBeside(parent, name) : `${name} (1)`) : name;
      const id = `doc${++serial}`;
      nodes.set(id, {
        id,
        name: got,
        parent,
        bytes: dir ? null : data ? unb64(data) : new Uint8Array(),
        mtime: ++tick,
      });
      return { id, name: got };
    },
    async write({ id, data }) {
      calls.push("write");
      const n = node(id);
      const bytes = unb64(data);
      if (failOn?.("write", n.name)) {
        failOn = undefined;
        // Truncated, then the app died part-way through the new bytes.
        n.bytes = bytes.slice(0, Math.floor(bytes.length / 2));
        throw new Error(`killed at write ${n.name}`);
      }
      n.bytes = bytes;
      n.mtime = ++tick;
    },
    async rename({ id, name }) {
      calls.push("rename");
      const n = node(id);
      crash("rename", n.name);
      // Its own name in other capitals counts as taken, as the phone's storage has it.
      const clash =
        takenIn(n.parent as string, name) ||
        (n.name !== name && n.name.toLowerCase() === name.toLowerCase());
      const got = clash ? freeBeside(n.parent as string, name) : name;
      const next = { ...n, id: `doc${++serial}`, name: got };
      nodes.delete(id);
      nodes.set(next.id, next);
      for (const k of kids(id)) k.parent = next.id;
      return { id: next.id, name: got };
    },
    async move({ id, to }) {
      calls.push("move");
      const n = node(id);
      crash("move", n.name);
      node(to);
      const got = takenIn(to, n.name) ? freeBeside(to, n.name) : n.name;
      const next = { ...n, id: `doc${++serial}`, name: got, parent: to };
      nodes.delete(id);
      nodes.set(next.id, next);
      for (const k of kids(id)) k.parent = next.id;
      return { id: next.id, name: got };
    },
    async remove({ id }) {
      calls.push("remove");
      crash("remove", node(id).name);
      drop(id);
    },
  };

  /** The folder as another app sees it: path → bytes (`"dir"` for a folder). */
  const snapshot = () => {
    const out = new Map<string, Uint8Array | "dir">();
    for (const n of nodes.values()) if (n.id !== "root") out.set(pathOf(n), n.bytes ?? "dir");
    return out;
  };
  /** A change made by another app, behind the page's back. */
  const outside = {
    put(path: string, bytes: Uint8Array) {
      const parts = path.split("/");
      let parent = "root";
      for (const [i, name] of parts.entries()) {
        const last = i === parts.length - 1;
        let n = kids(parent).find((k) => k.name === name);
        if (!n) {
          n = { id: `doc${++serial}`, name, parent, bytes: last ? bytes : null, mtime: ++tick };
          nodes.set(n.id, n);
        } else if (last) {
          n.bytes = bytes;
          n.mtime = ++tick;
        }
        parent = n.id;
      }
    },
    remove(path: string) {
      const n = [...nodes.values()].find((x) => x.id !== "root" && pathOf(x) === path);
      if (n) drop(n.id);
    },
  };
  return { plugin, calls, snapshot, outside };
}

/**
 * The phone's files as a build with a picked folder has them: the vault in
 * the (fake) folder, the rest in memory files, behind the router. It stands
 * in for `memoryFiles` in a suite written for it: `store` reads both, and
 * `failOn` kills a write, rename or removal before it starts, by the path
 * the vault asked for.
 */
export const routedMemory =
  (memoryFiles: typeof MemoryFiles) =>
  ({ failOn }: { failOn?: (op: string, path: string) => boolean } = {}) => {
    const priv = memoryFiles();
    const fake = fakeFolderAccess();
    const routed = routedFiles(
      priv,
      folderFiles({ tree: "tree", root: "root" }, priv, fake.plugin),
      "vault",
    );
    const crash = (op: string, path: string) => {
      if (failOn?.(op, path)) {
        failOn = undefined;
        throw new Error(`killed at ${op} ${path}`);
      }
    };
    const ops: FileOps = {
      ...routed,
      async write(path, bytes) {
        crash("write", path);
        return routed.write(path, bytes);
      },
      async rename(from, to) {
        crash("rename", from);
        return routed.rename(from, to);
      },
      async remove(path) {
        crash("remove", path);
        return routed.remove(path);
      },
    };
    const all = () => {
      const out = new Map<string, Uint8Array | "dir">(priv.store);
      for (const [path, v] of fake.snapshot()) out.set(`vault/${path}`, v);
      return out;
    };
    const store = { get: (path: string) => all().get(path), keys: () => all().keys() };
    return Object.assign(ops, { store, fake, priv });
  };
