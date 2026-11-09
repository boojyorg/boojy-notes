import type { FileOps } from "./files";

/** Where the moves under way are noted, in the app's private storage. */
export const MOVES = "moves";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * One set of files over two stores: everything at and under `mount` (the
 * vault) is the picked folder's, the rest (ids, the sync record, Recently
 * Deleted) stays in the app's private storage. The vault and sync keep
 * asking for `vault/…` and `state/…` and never know.
 *
 * A file renamed from one store to the other (a delete into the bin, a
 * restore out of it) cannot be one move: it is noted in `moves/`, written
 * there, removed here, and the note dropped. `recover` finishes a move a
 * crash cut short, so the file is in one place, never both and never neither.
 */
export function routedFiles(priv: FileOps, folder: FileOps, mount: string): FileOps {
  const route = (path: string): [FileOps, string] =>
    path === mount
      ? [folder, ""]
      : path.startsWith(`${mount}/`)
        ? [folder, path.slice(mount.length + 1)]
        : [priv, path];
  let serial = 0;

  /** What is left of a move: the source goes if the file arrived, else nothing happened. */
  const finishMoves = async () => {
    await priv.recover(MOVES);
    for (const { name, kind } of await priv.list(MOVES)) {
      if (kind !== "file" || name.startsWith(".")) continue;
      const raw = await priv.read(`${MOVES}/${name}`);
      if (raw) {
        const { from, to } = JSON.parse(decoder.decode(raw)) as { from: string; to: string };
        const [src, srcPath] = route(from);
        const [dst, dstPath] = route(to);
        if ((await dst.exists(dstPath)) && (await src.exists(srcPath))) await src.remove(srcPath);
      }
      await priv.remove(`${MOVES}/${name}`);
    }
  };

  return {
    list: (dir) => {
      const [store, path] = route(dir);
      return store.list(path);
    },
    read: (path) => {
      const [store, rel] = route(path);
      return store.read(rel);
    },
    write: (path, bytes) => {
      const [store, rel] = route(path);
      return store.write(rel, bytes);
    },
    remove: (path) => {
      const [store, rel] = route(path);
      return store.remove(rel);
    },
    mkdir: (path) => {
      const [store, rel] = route(path);
      return store.mkdir(rel);
    },
    rmdir: (path) => {
      const [store, rel] = route(path);
      return store.rmdir(rel);
    },
    exists: (path) => {
      const [store, rel] = route(path);
      return store.exists(rel);
    },
    mtime: (path) => {
      const [store, rel] = route(path);
      return store.mtime(rel);
    },

    async walk(dir) {
      const [store, path] = route(dir);
      if (store.walk) return store.walk(path);
      throw new Error(`no walk for ${dir}`);
    },

    async readMany(paths) {
      const routed = paths.map(route);
      const one = routed[0]?.[0];
      if (one?.readMany && routed.every(([store]) => store === one)) {
        return one.readMany(routed.map(([, rel]) => rel));
      }
      return Promise.all(routed.map(([store, rel]) => store.read(rel)));
    },

    async rename(from, to) {
      const [src, srcPath] = route(from);
      const [dst, dstPath] = route(to);
      if (src === dst) return src.rename(srcPath, dstPath);
      if (await dst.exists(dstPath)) throw new Error(`${to} already exists`);
      const bytes = await src.read(srcPath);
      if (!bytes) throw new Error(`${from} is not a file that can move between stores`);
      const note = `${MOVES}/${Date.now().toString(36)}-${(serial++).toString(36)}`;
      await priv.write(note, encoder.encode(JSON.stringify({ from, to })));
      await dst.write(dstPath, bytes);
      await src.remove(srcPath);
      await priv.remove(note);
    },

    async recover(dir) {
      const [store, path] = route(dir);
      await store.recover(path);
      // Once the folder's own saves are whole again, the moves into and out of it.
      if (store === folder) await finishMoves();
    },
  };
}
