import { Directory, Filesystem } from "@capacitor/filesystem";

/**
 * The phone's files, as the vault and the sync engine need them: paths
 * relative to the app's private storage, `/`-separated. An interface so the
 * vault's tests can run on a folder on the Mac instead.
 */
export interface FileOps {
  /** The entries of a directory; empty when it does not exist. */
  list(dir: string): Promise<{ name: string; kind: "file" | "dir"; mtime: number }[]>;
  read(path: string): Promise<Uint8Array | null>;
  /** Whole or not at all, parent directories made. */
  write(path: string, bytes: Uint8Array): Promise<void>;
  /** Parent directories of `to` made. */
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Fails when the directory holds anything. */
  rmdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mtime(path: string): Promise<number | null>;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");

/** The app's private storage on the phone (Android's files directory). */
export function capacitorFiles(): FileOps {
  const directory = Directory.Data;

  const stat = async (path: string) => {
    try {
      return await Filesystem.stat({ path, directory });
    } catch {
      return null;
    }
  };

  const mkdir = async (path: string) => {
    if (!path || (await stat(path))) return;
    await Filesystem.mkdir({ path, directory, recursive: true });
  };

  return {
    async list(dir) {
      try {
        const { files } = await Filesystem.readdir({ path: dir, directory });
        return files.map((f) => ({
          name: f.name,
          kind: f.type === "directory" ? "dir" : "file",
          mtime: Number(f.mtime) || 0,
        }));
      } catch {
        return [];
      }
    },

    async read(path) {
      if (!(await stat(path))) return null;
      const { data } = await Filesystem.readFile({ path, directory });
      return typeof data === "string"
        ? fromBase64(data)
        : new Uint8Array(await (data as Blob).arrayBuffer());
    },

    async write(path, bytes) {
      await mkdir(parentOf(path));
      const name = path.split("/").pop();
      const temp = `${parentOf(path) ? `${parentOf(path)}/` : ""}.~${name}.tmp`;
      await Filesystem.writeFile({ path: temp, data: toBase64(bytes), directory });
      try {
        await Filesystem.rename({ from: temp, to: path, directory, toDirectory: directory });
      } catch (error) {
        // If the plugin will not move over an existing file, the old one goes
        // first: a short window with no file, the new bytes safe in the temp.
        if (!(await stat(path))) throw error;
        await Filesystem.deleteFile({ path, directory });
        await Filesystem.rename({ from: temp, to: path, directory, toDirectory: directory });
      }
    },

    async rename(from, to) {
      await mkdir(parentOf(to));
      await Filesystem.rename({ from, to, directory, toDirectory: directory });
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
  };
}
