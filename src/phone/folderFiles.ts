import { registerPlugin } from "@capacitor/core";
import type { FileOps } from "./files";

/** A file or folder in the picked folder, as Android lists it. */
export interface FolderEntry {
  /** Android's name for it inside the picked tree: opaque, and new after a rename. */
  id: string;
  name: string;
  dir: boolean;
  mtime: number;
  size: number;
}

/** A folder the user picked: its tree address and the id of its top. */
export interface PickedFolder {
  tree: string;
  root: string;
}

/** The app's native plugin (android/…/FolderAccessPlugin.java): one Android call each. */
export interface FolderAccessPlugin {
  ensureDefault(o: { name: string }): Promise<{ made: boolean; initial: string }>;
  pick(o: {
    initial?: string;
  }): Promise<{ picked: boolean; tree?: string; root?: string; refused?: string }>;
  persisted(): Promise<{ trees: PickedFolder[] }>;
  release(o: { tree: string }): Promise<void>;
  list(o: { tree: string; id: string }): Promise<{ entries: FolderEntry[] }>;
  walk(o: { tree: string; id: string }): Promise<{ entries: (FolderEntry & { path: string })[] }>;
  readMany(o: { tree: string; ids: string[] }): Promise<{ data: (string | null)[] }>;
  create(o: {
    tree: string;
    parent: string;
    name: string;
    data?: string;
    dir?: boolean;
  }): Promise<{ id: string; name: string }>;
  write(o: { tree: string; id: string; data: string }): Promise<void>;
  rename(o: { tree: string; id: string; name: string }): Promise<{ id: string; name: string }>;
  move(o: {
    tree: string;
    id: string;
    from: string;
    to: string;
  }): Promise<{ id: string; name: string }>;
  remove(o: { tree: string; id: string }): Promise<void>;
}

export const FolderAccess = registerPlugin<FolderAccessPlugin>("FolderAccess");

/** The plugin's code for a file or folder that is not there. */
const isMissing = (error: unknown) => (error as { code?: string })?.code === "MISSING";

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const nameOf = (path: string) => path.split("/").pop() as string;
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
const hidden = (path: string) => path.split("/").some((part) => part.startsWith("."));

/** A name that is taken: nothing was written, so there is nothing for a restart to finish. */
class Taken extends Error {
  constructor(path: string) {
    super(`${path} already exists`);
  }
}

/**
 * The picked folder itself is not there (renamed, moved or removed by another
 * app). Never answered as an empty folder: every note would look deleted,
 * to the editor and to sync.
 */
export class FolderLost extends Error {
  name = "FolderLost";
  constructor() {
    super("The notes folder can't be reached");
  }
}

/** Where the journal is kept, in the app's private storage. */
export const JOURNAL = "journal";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What a journal file says is under way: its first line; a save's bytes follow it. */
type Intent = { op: "write"; path: string } | { op: "case"; temp: string; to: string };
const record = (intent: Intent, bytes: Uint8Array = new Uint8Array()) => {
  const head = encoder.encode(`${JSON.stringify(intent)}\n`);
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head);
  out.set(bytes, head.length);
  return out;
};
const readRecord = (raw: Uint8Array): { intent: Intent; bytes: Uint8Array } => {
  const end = raw.indexOf(10);
  return { intent: JSON.parse(decoder.decode(raw.subarray(0, end))), bytes: raw.subarray(end + 1) };
};

/**
 * The phone's files in a folder the user picked (`Documents/Boojy Notes`),
 * as the vault needs them: `/`-separated paths relative to the folder.
 *
 * Android names a file there by an id, not a path, so each folder's listing
 * is kept (name → id) and every call made here keeps it in step. The folder
 * tells names apart by spelling but holds only one per spelling-without-case,
 * so a name is found exactly, else ignoring case, as the disk itself would.
 * A folder inside it that is missing lists as empty; the picked folder itself
 * missing is `FolderLost`.
 *
 * **A save is journalled.** The folder has no rename-over-a-file, and a
 * write in place can be cut short. So the new bytes go to `private` first
 * (whole or not at all there), then over the file, then the private copy
 * goes; `recover` writes again whatever a crash left in the journal. Nothing
 * temporary is ever put in the folder, where other apps would see and sync it.
 *
 * Android never refuses a name that is taken: it makes `b (1).md`. A create
 * or rename that got another name is undone and thrown.
 */
export function folderFiles(
  { tree, root }: PickedFolder,
  journal: FileOps,
  access: FolderAccessPlugin = FolderAccess,
): FileOps {
  const dirs = new Map<string, Map<string, FolderEntry>>();
  let serial = 0;
  const journalName = () => `${JOURNAL}/${Date.now().toString(36)}-${(serial++).toString(36)}`;

  const find = (map: Map<string, FolderEntry>, name: string) => {
    const exact = map.get(name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    for (const e of map.values()) if (e.name.toLowerCase() === lower) return e;
    return null;
  };

  const dirId = async (dir: string): Promise<string | null> => {
    if (!dir) return root;
    const e = await entry(dir);
    return e?.dir ? e.id : null;
  };

  /** A folder's entries by name; empty when it is not there. */
  const listing = async (dir: string, fresh = false) => {
    const kept = dirs.get(dir);
    if (kept && !fresh) return kept;
    const map = new Map<string, FolderEntry>();
    const id = await dirId(dir);
    if (id !== null) {
      try {
        for (const e of (await access.list({ tree, id })).entries) map.set(e.name, e);
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (!dir) throw new FolderLost();
      }
    }
    dirs.set(dir, map);
    return map;
  };

  async function entry(path: string): Promise<FolderEntry | null> {
    return find(await listing(parentOf(path)), nameOf(path));
  }

  /** Forgets what was listed at and under `path`. */
  const forget = (path: string) => {
    if (!path) return dirs.clear();
    for (const key of [...dirs.keys()]) {
      if (key === path || key.startsWith(`${path}/`)) dirs.delete(key);
    }
  };

  const mkdir = async (path: string): Promise<void> => {
    if (!path || (await entry(path))) return;
    await mkdir(parentOf(path));
    const parent = (await dirId(parentOf(path))) as string;
    const made = await access.create({ tree, parent, name: nameOf(path), dir: true });
    if (made.name !== nameOf(path)) {
      await access.remove({ tree, id: made.id });
      dirs.delete(parentOf(path));
      throw new Taken(path);
    }
    (await listing(parentOf(path))).set(made.name, { ...made, dir: true, mtime: 0, size: 0 });
  };

  const removeEntry = async (path: string) => {
    const e = await entry(path);
    if (!e) throw new Error(`${path} does not exist`);
    await access.remove({ tree, id: e.id });
    (await listing(parentOf(path))).delete(e.name);
    forget(path);
  };

  /** A new name in the same folder; `e` is the entry at `path`. */
  const renameIn = async (path: string, e: FolderEntry, name: string) => {
    const map = await listing(parentOf(path));
    const made = await access.rename({ tree, id: e.id, name });
    map.delete(e.name);
    forget(path);
    if (made.name !== name) {
      // Android made room beside a name that was taken: put it back as it was.
      const back = await access.rename({ tree, id: made.id, name: e.name });
      map.set(back.name, { ...e, id: back.id, name: back.name });
      throw new Taken(join(parentOf(path), name));
    }
    map.set(name, { ...e, id: made.id, name });
  };

  /** The bytes at `path`, in place or as a new file: not whole-or-nothing. */
  const put = async (path: string, bytes: Uint8Array) => {
    const data = toBase64(bytes);
    const existing = await entry(path);
    if (existing) {
      await access.write({ tree, id: existing.id, data });
      existing.size = bytes.length;
      return;
    }
    await mkdir(parentOf(path));
    const parent = (await dirId(parentOf(path))) as string;
    const made = await access.create({ tree, parent, name: nameOf(path), data });
    if (made.name !== nameOf(path)) {
      await access.remove({ tree, id: made.id });
      dirs.delete(parentOf(path));
      throw new Taken(path);
    }
    (await listing(parentOf(path))).set(made.name, {
      ...made,
      dir: false,
      mtime: Date.now(),
      size: bytes.length,
    });
  };

  const shown = (e: FolderEntry) => ({
    name: e.name,
    kind: e.dir ? ("dir" as const) : ("file" as const),
    mtime: e.mtime,
    size: e.size,
  });

  const ops: FileOps = {
    async list(dir) {
      return [...(await listing(dir, true)).values()].map(shown);
    },

    async walk(dir) {
      const id = await dirId(dir);
      if (id === null) return [];
      let entries: (FolderEntry & { path: string })[];
      try {
        ({ entries } = await access.walk({ tree, id }));
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (!dir) throw new FolderLost();
        return [];
      }
      // The walk is every listing under `dir` at once: kept, so the reads
      // and saves that follow ask Android for no folder again.
      forget(dir);
      dirs.set(dir, new Map());
      for (const e of entries) {
        const at = join(dir, e.path);
        const { path: _path, ...kept } = e;
        const parent = dirs.get(parentOf(at));
        parent?.set(e.name, kept);
        if (e.dir && !e.name.startsWith(".") && parent) dirs.set(at, new Map());
      }
      return entries.filter((e) => !hidden(e.path)).map((e) => ({ path: e.path, ...shown(e) }));
    },

    async read(path) {
      return (await (ops.readMany as NonNullable<FileOps["readMany"]>)([path]))[0];
    },

    async readMany(paths) {
      const found = await Promise.all(paths.map(entry));
      const ids = found.flatMap((e) => (e && !e.dir ? [e.id] : []));
      const { data } = ids.length ? await access.readMany({ tree, ids }) : { data: [] };
      let next = 0;
      return found.map((e, i) => {
        if (!e || e.dir) return null;
        const one = data[next++];
        // Gone since it was listed: the listing is stale, so it is asked again.
        if (one === null) dirs.delete(parentOf(paths[i]));
        return one === null ? null : fromBase64(one);
      });
    },

    async write(path, bytes) {
      const name = journalName();
      await journal.write(name, record({ op: "write", path }, bytes));
      try {
        await put(path, bytes);
      } catch (error) {
        // Refused, not cut short: written again at the next start, it would
        // go over the file that holds the name.
        if (error instanceof Taken) await journal.remove(name);
        throw error;
      }
      await journal.remove(name);
    },

    async rename(from, to) {
      const e = await entry(from);
      if (!e) throw new Error(`${from} does not exist`);
      const there = await entry(to);
      if (there && there.id !== e.id) throw new Error(`${to} already exists`);
      if (parentOf(from) !== parentOf(to)) {
        await mkdir(parentOf(to));
        const moved = await access.move({
          tree,
          id: e.id,
          from: (await dirId(parentOf(from))) as string,
          to: (await dirId(parentOf(to))) as string,
        });
        (await listing(parentOf(from))).delete(e.name);
        forget(from);
        const landed = { ...e, id: moved.id, name: moved.name };
        (await listing(parentOf(to))).set(moved.name, landed);
        if (moved.name !== nameOf(to))
          await renameIn(join(parentOf(to), moved.name), landed, nameOf(to));
        return;
      }
      if (e.name === nameOf(to)) return;
      if (e.name.toLowerCase() !== nameOf(to).toLowerCase()) return renameIn(from, e, nameOf(to));
      // Only the capitals change. The folder takes the new spelling for the
      // name already there and would make `Name (1)`, so it goes by way of a
      // hidden name, journalled: a crash between the two is finished at start.
      const temp = join(parentOf(from), `.~${nameOf(to)}.case`);
      const name = journalName();
      await journal.write(name, record({ op: "case", temp, to }));
      await renameIn(from, e, nameOf(temp));
      await renameIn(temp, (await entry(temp)) as FolderEntry, nameOf(to));
      await journal.remove(name);
    },

    remove: removeEntry,
    mkdir,

    async rmdir(path) {
      // Android removes a folder with everything in it.
      if ((await listing(path, true)).size > 0) throw new Error(`${path} is not empty`);
      await removeEntry(path);
    },

    async exists(path) {
      return !path || (await entry(path)) !== null;
    },

    async mtime(path) {
      return find(await listing(parentOf(path), true), nameOf(path))?.mtime ?? null;
    },

    /** Finishes what the journal says a crash cut short, oldest first. `dir` is not looked at. */
    async recover() {
      await journal.recover(JOURNAL);
      const left = (await journal.list(JOURNAL)).filter((e) => e.kind === "file");
      for (const { name } of left.sort((a, b) => a.name.localeCompare(b.name))) {
        if (name.startsWith(".")) continue;
        const raw = await journal.read(join(JOURNAL, name));
        if (raw) {
          const { intent, bytes } = readRecord(raw);
          if (intent.op === "write") await put(intent.path, bytes);
          else {
            const temp = await entry(intent.temp);
            if (temp) await renameIn(intent.temp, temp, nameOf(intent.to));
          }
        }
        await journal.remove(join(JOURNAL, name));
      }
    },
  };
  return ops;
}

/**
 * The folder this install was given and can still reach. Android keeps a
 * grant across restarts and updates and drops it on uninstall; a folder
 * moved, renamed or removed since keeps its grant and answers as missing.
 * `keep` is the folder just chosen: every other grant is given back, so a
 * second choice never leaves two to pick between. `spare` are the folders
 * other storage locations hold: never found, and never given back.
 */
export async function reachableFolder(
  access: FolderAccessPlugin = FolderAccess,
  keep?: PickedFolder,
  spare: string[] = [],
): Promise<PickedFolder | null> {
  let found: PickedFolder | null = null;
  for (const folder of (await access.persisted()).trees) {
    if (spare.includes(folder.tree)) continue;
    if (keep ? folder.tree === keep.tree : !found && (await reaches(access, folder)))
      found = folder;
    else if (keep) await access.release({ tree: folder.tree });
  }
  return found;
}

/** A granted tree's place on the phone (`primary:Documents/Notes`), read from its address. */
const placeOf = (tree: string) => {
  const at = tree.indexOf("/tree/");
  return at < 0 ? tree : decodeURIComponent(tree.slice(at + 6));
};

/** Whether two granted folders are one, or one is inside the other: no two locations may share files. */
export function treesOverlap(a: string, b: string) {
  const [x, y] = [placeOf(a), placeOf(b)];
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

/** `folder` if Android still grants it and it is where it was; null when lost. */
export async function folderReached(
  folder: PickedFolder,
  access: FolderAccessPlugin = FolderAccess,
): Promise<PickedFolder | null> {
  const granted = (await access.persisted()).trees.some((t) => t.tree === folder.tree);
  return granted && (await reaches(access, folder)) ? folder : null;
}

async function reaches(access: FolderAccessPlugin, { tree, root }: PickedFolder) {
  try {
    await access.list({ tree, id: root });
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/** The folder as a person reads it: `Documents/Boojy Notes`, without the volume Android puts first. */
export const folderLabel = ({ root }: PickedFolder) => root.slice(root.indexOf(":") + 1) || root;

/**
 * The address the page loads a file in the folder from: Capacitor serves a
 * `content:` address itself, and on the phone's own storage a file's id is
 * the folder's id and its path, so no call to Android is needed per picture.
 */
export function folderAddress({ tree, root }: PickedFolder, convert: (uri: string) => string) {
  const base = convert(`${tree}/document/${encodeURIComponent(root)}`);
  return (rel: string) => `${base}${encodeURIComponent(`/${rel}`)}`;
}
