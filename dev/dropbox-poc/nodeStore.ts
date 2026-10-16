import fs from "node:fs/promises";
import path from "node:path";
import { contentHash } from "../../src/sync/contentHash";
import type { LocalStore } from "../../src/sync/types";

/**
 * A folder on the Mac standing in for the phone's private copy of a vault.
 * The sync record lives beside the folder, never inside it. A file the engine
 * deletes goes to `.sync-trash/` inside the folder (a dot folder, so never
 * synced), not away for good: this is a proof of concept.
 */
export function nodeStore(root: string, recordFile: string): LocalStore {
  const abs = (rel: string) => path.join(root, ...rel.split("/"));
  const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === "ENOENT";

  const read = async (rel: string) => {
    try {
      return new Uint8Array(await fs.readFile(abs(rel)));
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  };

  const hashOf = async (rel: string) => {
    const bytes = await read(rel);
    return bytes ? contentHash(bytes) : null;
  };

  /** Whole or not at all: a temporary file beside the target, then a rename over it. */
  const writeWhole = async (file: string, bytes: Uint8Array) => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temp = path.join(path.dirname(file), `.~${path.basename(file)}.sync.tmp`);
    await fs.writeFile(temp, bytes);
    await fs.rename(temp, file);
  };

  return {
    async list() {
      const files: string[] = [];
      const folders: string[] = [];
      const walk = async (dir: string, prefix: string) => {
        for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            folders.push(rel);
            await walk(path.join(dir, entry.name), rel);
          } else if (entry.isFile()) {
            files.push(rel);
          }
        }
      };
      await walk(root, "");
      return { files, folders };
    },

    read,

    async writeIfUnchanged(rel, bytes, expected) {
      if ((await hashOf(rel)) !== expected) return false;
      await writeWhole(abs(rel), bytes);
      return true;
    },

    async removeIfUnchanged(rel, expected) {
      if ((await hashOf(rel)) !== expected) return false;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const kept = path.join(root, ".sync-trash", stamp, ...rel.split("/"));
      await fs.mkdir(path.dirname(kept), { recursive: true });
      await fs.rename(abs(rel), kept);
      return true;
    },

    async rename(from, to) {
      if ((await read(to)) !== null) throw new Error(`${to} already exists`);
      await fs.mkdir(path.dirname(abs(to)), { recursive: true });
      await fs.rename(abs(from), abs(to));
    },

    async exists(rel) {
      return (await read(rel)) !== null;
    },

    async makeFolder(rel) {
      await fs.mkdir(abs(rel), { recursive: true });
    },

    async removeFolderIfEmpty(rel) {
      try {
        await fs.rmdir(abs(rel));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
      }
    },

    async loadRecord() {
      try {
        return await fs.readFile(recordFile, "utf8");
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },

    async saveRecord(text) {
      await writeWhole(recordFile, new TextEncoder().encode(text));
    },
  };
}
