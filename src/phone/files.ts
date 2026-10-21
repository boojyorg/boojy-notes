import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

/**
 * The phone's files, as the vault and the sync engine need them: paths
 * relative to the app's private storage, `/`-separated. An interface so the
 * vault's tests can run on a folder on the Mac instead.
 *
 * Only a file confirmed absent counts as missing. Any other failure (a read
 * error, a permission) is thrown: taken as "empty", a folder that could not
 * be listed made every note in it look deleted, and sync deleted them from
 * Dropbox.
 */
export interface FileOps {
  /** The entries of a directory; empty when it does not exist. */
  list(dir: string): Promise<{ name: string; kind: "file" | "dir"; mtime: number; size: number }[]>;
  read(path: string): Promise<Uint8Array | null>;
  /** Whole or not at all, parent directories made; see `recover`. */
  write(path: string, bytes: Uint8Array): Promise<void>;
  /** Parent directories of `to` made. Fails if `to` exists. */
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Fails when the directory holds anything. */
  rmdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mtime(path: string): Promise<number | null>;
  /** Finishes or undoes any `write` a crash cut short, under `dir`. Run before anything reads. */
  recover(dir: string): Promise<void>;
}

/** The plugin's code for a file that does not exist (FilesystemErrors.doesNotExist). */
const DOES_NOT_EXIST = "OS-PLUG-FILE-0008";
const isMissing = (error: unknown) => (error as { code?: string })?.code === DOES_NOT_EXIST;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** The two files a `write` leaves beside its target while it runs. */
const tempOf = (path: string) => join(parentOf(path), `.~${path.split("/").pop()}.tmp`);
const backupOf = (path: string) => join(parentOf(path), `.~${path.split("/").pop()}.bak`);
const TEMP_RE = /^\.~(.+)\.tmp$/;
const BACKUP_RE = /^\.~(.+)\.bak$/;

/**
 * The app's private storage on the phone (Android's files directory).
 *
 * The plugin's rename never replaces a file in one step: it deletes the
 * destination and then moves the source, copying if the move fails, so a
 * crash or a failure in between leaves no file at all. A write therefore
 * never renames over a file. The new bytes go to `.~name.tmp`, the old file
 * moves aside to `.~name.bak`, the new one moves in, and the backup goes. At
 * every instant the note is whole in one of the three, and `recover` puts the
 * newest whole one back at startup.
 */
export function capacitorFiles(): FileOps {
  const directory = Directory.Data;

  const stat = async (path: string) => {
    try {
      return await Filesystem.stat({ path, directory });
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  };

  const mkdir = async (path: string) => {
    if (!path || (await stat(path))) return;
    await Filesystem.mkdir({ path, directory, recursive: true });
  };

  const move = (from: string, to: string) =>
    Filesystem.rename({ from, to, directory, toDirectory: directory });

  const ops: FileOps = {
    // A list or a read asks once: the plugin's own "does not exist" is the
    // missing answer, so no stat goes first (each call is a round trip to
    // Android, and the vault's start made ~150 of them).
    async list(dir) {
      let files: Awaited<ReturnType<typeof Filesystem.readdir>>["files"];
      try {
        ({ files } = await Filesystem.readdir({ path: dir, directory }));
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      return files.map((f) => ({
        name: f.name,
        kind: f.type === "directory" ? "dir" : "file",
        mtime: Number(f.mtime) || 0,
        size: Number(f.size) || 0,
      }));
    },

    async read(path) {
      let data: Awaited<ReturnType<typeof Filesystem.readFile>>["data"];
      try {
        ({ data } = await Filesystem.readFile({ path, directory }));
      } catch (error) {
        if (isMissing(error)) return null;
        throw error;
      }
      return typeof data === "string"
        ? fromBase64(data)
        : new Uint8Array(await (data as Blob).arrayBuffer());
    },

    async write(path, bytes) {
      await mkdir(parentOf(path));
      const temp = tempOf(path);
      const backup = backupOf(path);
      await Filesystem.writeFile({ path: temp, data: toBase64(bytes), directory });
      const existed = !!(await stat(path));
      if (existed) {
        if (await stat(backup)) await Filesystem.deleteFile({ path: backup, directory });
        await move(path, backup);
      }
      try {
        await move(temp, path);
      } catch (error) {
        // The old file goes back over anything half-copied; the new bytes
        // stay in the temp.
        if (existed) {
          if (await stat(path)) await Filesystem.deleteFile({ path, directory });
          await move(backup, path);
        }
        throw error;
      }
      if (existed) await Filesystem.deleteFile({ path: backup, directory });
    },

    async rename(from, to) {
      if (await stat(to)) throw new Error(`${to} already exists`);
      await mkdir(parentOf(to));
      await move(from, to);
    },

    async remove(path) {
      await Filesystem.deleteFile({ path, directory });
    },

    mkdir,

    async rmdir(path) {
      await Filesystem.rmdir({ path, directory, recursive: false });
    },

    async exists(path) {
      return (await stat(path)) !== null;
    },

    async mtime(path) {
      const s = await stat(path);
      return s ? Number(s.mtime) || 0 : null;
    },

    recover: (dir) => recoverWrites(ops, dir),
  };
  return ops;
}

/**
 * Puts back what a `write` cut short left. A backup exists only once its
 * temp was written whole, so a backup with its temp beside it is a write
 * that never finished moving: the temp is the newest version and takes the
 * target's place, over anything half-copied there. A backup alone is the old
 * version: it goes back if the target is missing, and is a finished write's
 * leftover if not. A temp beside its target with no backup never began
 * moving and may be partial, so it goes; a temp with neither (a new file) is
 * left, hidden, rather than guessed at.
 */
export async function recoverWrites(files: FileOps, dir: string): Promise<void> {
  const entries = await files.list(dir);
  const names = new Set(entries.map((e) => e.name));
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.kind === "dir") {
      await recoverWrites(files, path);
      continue;
    }
    const backup = BACKUP_RE.exec(entry.name);
    if (backup) {
      const name = backup[1];
      const target = join(dir, name);
      if (names.has(`.~${name}.tmp`)) {
        if (names.has(name)) await files.remove(target);
        await files.rename(tempOf(target), target);
        names.delete(`.~${name}.tmp`);
        await files.remove(path);
      } else if (!names.has(name)) {
        await files.rename(path, target);
      } else {
        await files.remove(path);
      }
      names.add(name);
      names.delete(entry.name);
      continue;
    }
    const temp = TEMP_RE.exec(entry.name);
    if (temp && names.has(entry.name) && names.has(temp[1]) && !names.has(`.~${temp[1]}.bak`)) {
      await files.remove(path);
      names.delete(entry.name);
    }
  }
}

/**
 * The address the page loads a file in the app's storage from: Capacitor's
 * own server, so a picture is read by the WebView, never through the bridge.
 */
export async function fileAddress(path: string) {
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return Capacitor.convertFileSrc(uri).replace(/\/+$/, "");
}
