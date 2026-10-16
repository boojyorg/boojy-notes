import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FileOps, recoverWrites } from "../../src/phone/files";
import { createPhoneVault, sanitizeFilename } from "../../src/phone/phoneVault";
import { contentHash } from "../../src/sync/contentHash";
import type { Note } from "../../src/types/notes";
import { markdownToBlocks } from "../../src/utils/markdown";

/** The phone's file calls over a folder on the Mac. */
function folderFiles(root: string): FileOps {
  const abs = (rel: string) => path.join(root, ...rel.split("/"));
  const stat = (rel: string) => fs.stat(abs(rel)).catch(() => null);
  const ops: FileOps = {
    async list(dir) {
      const entries = await fs.readdir(abs(dir), { withFileTypes: true }).catch(() => []);
      return entries.map((e) => ({
        name: e.name,
        kind: e.isDirectory() ? "dir" : "file",
        mtime: 0,
      }));
    },
    async read(rel) {
      return (await stat(rel)) ? new Uint8Array(await fs.readFile(abs(rel))) : null;
    },
    async write(rel, bytes) {
      await fs.mkdir(path.dirname(abs(rel)), { recursive: true });
      await fs.writeFile(abs(rel), bytes);
    },
    async rename(from, to) {
      await fs.mkdir(path.dirname(abs(to)), { recursive: true });
      await fs.rename(abs(from), abs(to));
    },
    remove: (rel) => fs.rm(abs(rel)),
    mkdir: async (rel) => {
      await fs.mkdir(abs(rel), { recursive: true });
    },
    rmdir: (rel) => fs.rmdir(abs(rel)),
    exists: async (rel) => (await stat(rel)) !== null,
    mtime: async (rel) => (await stat(rel))?.mtimeMs ?? null,
    recover: (dir) => recoverWrites(ops, dir),
  };
  return ops;
}

const note = (id: string, title: string, text: string, folder: string | null = null): Note => ({
  id,
  title,
  folder,
  content: { title, blocks: markdownToBlocks(text) },
});
const bytes = (text: string) => new TextEncoder().encode(text);

let root: string;
let vault: ReturnType<typeof createPhoneVault>;
const onLocalChange = vi.fn();
const onDisk = (rel: string) => fs.readFile(path.join(root, "vault", rel), "utf8");

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "phone-vault-"));
  onLocalChange.mockClear();
  vault = createPhoneVault(folderFiles(root), { onLocalChange });
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe("the editor's calls", () => {
  it("writes a note as a Markdown file named by its title, and reads it back with the same id", async () => {
    await vault.api.writeNote(note("n1", "Shopping", "milk"));
    expect(await onDisk("Shopping.md")).toBe("milk");
    expect(onLocalChange).toHaveBeenCalled();

    const again = createPhoneVault(folderFiles(root));
    const notes = await again.api.readAllNotes();
    expect(Object.keys(notes)).toEqual(["n1"]);
    expect(notes.n1).toMatchObject({ title: "Shopping", folder: null });
  });

  it("renames the file, keeping it the same file, when only the name changes", async () => {
    await vault.api.writeNote(note("n1", "Mac", "text"));
    const before = await fs.stat(path.join(root, "vault", "Mac.md"));
    await vault.api.writeNote(note("n1", "Pasta", "text", "Recipes"));
    const after = await fs.stat(path.join(root, "vault", "Recipes", "Pasta.md"));
    expect(after.ino).toBe(before.ino);
  });

  it("gives a second note of the same name a -2", async () => {
    await vault.api.writeNote(note("n1", "Idea", "one"));
    const answer = await vault.api.writeNote(note("n2", "Idea", "two"));
    expect(answer).toEqual({ title: "Idea-2" });
  });

  it("makes names safe the way the desktop does", () => {
    expect(sanitizeFilename("a/b: c?")).toBe("a_b_ c_");
    expect(sanitizeFilename(".env")).toBe("_env");
    expect(sanitizeFilename("CON")).toBe("CON_");
    expect(sanitizeFilename("  ")).toBe("Untitled");
  });

  it("moves a deleted note out of the vault, not away for good", async () => {
    await vault.api.writeNote(note("n1", "Old", "bye"));
    expect(await vault.api.trashNote("n1")).toEqual({ trashed: true });
    expect((await vault.store.list()).files).toEqual([]);
    const kept = await fs.readdir(path.join(root, "deleted"), { recursive: true });
    expect(kept).toContain(path.join(kept[0], "Old.md"));
  });

  it("refuses a save over text the editor has not seen", async () => {
    await vault.api.writeNote(note("n1", "Note", "mine"));
    await fs.writeFile(path.join(root, "vault", "Note.md"), "theirs\n");
    const answer = await vault.api.writeNote(note("n1", "Note", "mine, edited"));
    expect(answer).toMatchObject({ stale: true, note: { id: "n1", title: "Note" } });
    expect(await onDisk("Note.md")).toBe("theirs\n");
  });
});

describe("the sync engine's calls, as the editor sees them", () => {
  it("reports a downloaded note as changed on disk, under the id it already has", async () => {
    await vault.api.writeNote(note("n1", "Note", "old"));
    const changed = vi.fn();
    vault.api.onFileChanged(changed);
    const ok = await vault.store.writeIfUnchanged(
      "Note.md",
      bytes("new\n"),
      await contentHash(bytes("old")),
    );
    expect(ok).toBe(true);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ id: "n1", title: "Note" }));
  });

  it("makes a save asked for before a download stale, so the editor keeps both", async () => {
    await vault.api.writeNote(note("n1", "Note", "old"));
    // The save is asked for first; the download takes the lock first.
    const download = vault.store.writeIfUnchanged(
      "Note.md",
      bytes("theirs\n"),
      await contentHash(bytes("old")),
    );
    const save = vault.api.writeNote(note("n1", "Note", "mine"));
    expect(await download).toBe(false); // a save is waiting: the engine tries again later
    expect(await save).toEqual({ title: "Note" });
    expect(await onDisk("Note.md")).toBe("mine");
  });

  it("refuses a save asked for while a download was being written", async () => {
    // The editor's flush starts while the downloaded bytes are going to disk,
    // so before the change event can reach it.
    let save: Promise<unknown> | undefined;
    const files = folderFiles(root);
    const write = files.write;
    files.write = async (rel, data) => {
      if (rel === "vault/Note.md" && new TextDecoder().decode(data) === "theirs\n") {
        save = landing.api.writeNote(note("n1", "Note", "mine"));
      }
      return write(rel, data);
    };
    const landing = createPhoneVault(files);
    await landing.api.writeNote(note("n1", "Note", "old"));
    const hash = await contentHash(bytes("old"));
    expect(await landing.store.writeIfUnchanged("Note.md", bytes("theirs\n"), hash)).toBe(true);
    expect(await save).toMatchObject({ stale: true, note: { id: "n1" } });
    expect(await onDisk("Note.md")).toBe("theirs\n");
  });

  it("follows a rename from Dropbox, and a queued save keeps the new name", async () => {
    await vault.api.writeNote(note("n1", "Pasta", "text"));
    const moved = vi.fn();
    vault.api.onFileMoved(moved);
    const rename = vault.store.rename("Pasta.md", "Recipes/Penne.md");
    const save = vault.api.writeNote(note("n1", "Pasta", "text, edited"));
    await rename;
    expect(await save).toEqual({ title: "Penne" });
    expect(moved).toHaveBeenCalledWith(
      expect.objectContaining({ id: "n1", title: "Penne", folder: "Recipes" }),
    );
    expect(await onDisk("Recipes/Penne.md")).toBe("text, edited");
    expect(await vault.store.exists("Pasta.md")).toBe(false);
  });

  it("reports a note deleted in Dropbox, and keeps a copy outside the vault", async () => {
    await vault.api.writeNote(note("n1", "Gone", "x"));
    const deleted = vi.fn();
    vault.api.onFileDeleted(deleted);
    expect(await vault.store.removeIfUnchanged("Gone.md", await contentHash(bytes("x")))).toBe(
      true,
    );
    expect(deleted).toHaveBeenCalled();
    expect(await vault.api.readAllNotes()).toEqual({});
  });

  it("keeps the sync record outside the vault", async () => {
    await vault.store.saveRecord('{"version":1}');
    expect(await vault.store.loadRecord()).toBe('{"version":1}');
    expect((await vault.store.list()).files).toEqual([]);
  });
});

/** Files in memory, case-sensitive as Android's storage is (the Mac's is not). */
function caseSensitiveFiles(): FileOps {
  const store = new Map<string, Uint8Array | "dir">();
  const parent = (p: string) => p.split("/").slice(0, -1).join("/");
  const ensureDir = (p: string) => {
    const parts = p.split("/");
    for (let i = 1; i <= parts.length; i++)
      if (parts[i - 1]) store.set(parts.slice(0, i).join("/"), "dir");
  };
  const ops: FileOps = {
    async list(dir) {
      return [...store.entries()]
        .filter(([p]) => parent(p) === dir)
        .map(([p, v]) => ({
          name: p.split("/").pop() as string,
          kind: v === "dir" ? "dir" : "file",
          mtime: 0,
        }));
    },
    async read(p) {
      const v = store.get(p);
      return v && v !== "dir" ? v : null;
    },
    async write(p, bytes) {
      ensureDir(parent(p));
      store.set(p, bytes);
    },
    async rename(from, to) {
      if (store.has(to)) throw new Error(`${to} already exists`);
      ensureDir(parent(to));
      store.set(to, store.get(from) as Uint8Array);
      store.delete(from);
    },
    async remove(p) {
      store.delete(p);
    },
    async mkdir(p) {
      ensureDir(p);
    },
    async rmdir(p) {
      store.delete(p);
    },
    exists: async (p) => store.has(p),
    mtime: async (p) => (store.has(p) ? 0 : null),
    recover: (dir) => recoverWrites(ops, dir),
  };
  return ops;
}

describe("names Dropbox cannot tell apart", () => {
  it("gives a note differing only in case from another a -2", async () => {
    const phone = createPhoneVault(caseSensitiveFiles());
    await phone.api.writeNote(note("n1", "Shopping", "milk"));
    expect(await phone.api.writeNote(note("n2", "shopping", "eggs"))).toEqual({
      title: "shopping-2",
    });
  });

  it("lets a note change only the case of its own name", async () => {
    const phone = createPhoneVault(caseSensitiveFiles());
    await phone.api.writeNote(note("n1", "shopping", "milk"));
    expect(await phone.api.writeNote(note("n1", "Shopping", "milk"))).toEqual({
      title: "Shopping",
    });
    expect((await phone.store.list()).files).toEqual(["Shopping.md"]);
  });

  it("gives a folder differing only in case from another a -2", async () => {
    const phone = createPhoneVault(caseSensitiveFiles());
    await phone.api.createFolder("Work");
    expect(await phone.api.createFolder("work")).toEqual({ path: "work-2" });
  });
});
