import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FileOps, recoverWrites } from "../../src/phone/files";
import { createPhoneVault, sanitizeFilename } from "../../src/phone/phoneVault";
import { contentHash } from "../../src/sync/contentHash";
import type { Note } from "../../src/types/notes";
import { markdownToBlocks } from "../../src/utils/markdown";
import { memoryFiles } from "./memoryFiles";

/** The phone's file calls over a folder on the Mac. */
function folderFiles(root: string): FileOps {
  const abs = (rel: string) => path.join(root, ...rel.split("/"));
  const stat = (rel: string) => fs.stat(abs(rel)).catch(() => null);
  const ops: FileOps = {
    async list(dir) {
      const entries = await fs.readdir(abs(dir), { withFileTypes: true }).catch(() => []);
      return Promise.all(
        entries.map(async (e) => {
          const s = await stat(path.join(dir, e.name));
          return {
            name: e.name,
            kind: e.isDirectory() ? ("dir" as const) : ("file" as const),
            mtime: s?.mtimeMs ?? 0,
            size: s?.size ?? 0,
          };
        }),
      );
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

describe("a file that is not UTF-8 text", () => {
  // "café" in Windows-1252: the é is a lone 0xE9 byte.
  const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a]);

  it("is listed as unreadable, never left out", async () => {
    await fs.mkdir(path.join(root, "vault"), { recursive: true });
    await fs.writeFile(path.join(root, "vault", "Old.md"), latin1);
    const notes = Object.values(await vault.api.readAllNotes());
    expect(notes).toEqual([
      expect.objectContaining({ title: "Old", unreadable: "encoding", content: expect.anything() }),
    ]);
    expect(notes[0].content.blocks).toEqual([]);
  });

  it("is never written over by a save of the text the editor had", async () => {
    await vault.api.writeNote(note("n1", "Plan", "mine"));
    const changed = vi.fn();
    vault.api.onFileChanged(changed);
    // Sync brings in a version the Mac saved in another encoding.
    const hash = await contentHash(bytes("mine"));
    expect(await vault.store.writeIfUnchanged("Plan.md", latin1, hash)).toBe(true);
    expect(changed).toHaveBeenCalledWith(
      expect.objectContaining({ id: "n1", unreadable: "encoding" }),
    );
    const answer = await vault.api.writeNote(note("n1", "Plan", "mine, edited"));
    expect(answer).toMatchObject({ stale: true, note: { id: "n1", unreadable: "encoding" } });
    expect(new Uint8Array(await fs.readFile(path.join(root, "vault", "Plan.md")))).toEqual(latin1);
  });

  it("is only ever moved: a rename keeps its bytes", async () => {
    await fs.mkdir(path.join(root, "vault"), { recursive: true });
    await fs.writeFile(path.join(root, "vault", "Old.md"), latin1);
    const [old] = Object.values(await vault.api.readAllNotes());
    expect(await vault.api.writeNote({ ...old, title: "Renamed" })).toEqual({ title: "Renamed" });
    expect(new Uint8Array(await fs.readFile(path.join(root, "vault", "Renamed.md")))).toEqual(
      latin1,
    );
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

describe("folders, named as the desktop names them", () => {
  const dirs = async (rel = "") =>
    (await fs.readdir(path.join(root, "vault", rel), { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();

  it("never makes a folder the desktop would hide or Windows would rename", async () => {
    expect(await vault.api.createFolder("attachments")).toEqual({ path: "_attachments" });
    expect(await vault.api.createFolder("Notes.")).toEqual({ path: "Notes" });
    expect(await vault.api.renameFolder("Notes", "attachments")).toEqual({
      path: "_attachments-2",
    });
  });

  it("lists neither the attachment store nor its notes, as the desktop, but syncs them", async () => {
    await fs.mkdir(path.join(root, "vault", "attachments", "old"), { recursive: true });
    await fs.writeFile(path.join(root, "vault", "attachments", "pic.png"), "png");
    await fs.writeFile(path.join(root, "vault", "attachments", "Stray.md"), "x");
    await vault.api.createFolder("Work");
    expect(await vault.api.readFolders()).toEqual(["Work"]);
    expect(await vault.api.readAllNotes()).toEqual({});
    expect((await vault.store.list()).files.sort()).toEqual([
      "attachments/Stray.md",
      "attachments/pic.png",
    ]);
  });

  it("gives a rename onto a taken name a -2, capitals or not, and the notes go with it", async () => {
    await vault.api.createFolder("Work");
    await vault.api.createFolder("Home");
    await vault.api.writeNote(note("n1", "Plan", "text", "Home"));
    expect(await vault.api.renameFolder("Home", "work")).toEqual({ path: "work-2" });
    expect(await dirs()).toEqual(["Work", "work-2"]);
    const notes = await vault.api.readAllNotes();
    expect(notes.n1).toMatchObject({ folder: "work-2" });
  });

  it("keeps a moved folder's own name and refuses a move into itself", async () => {
    await fs.mkdir(path.join(root, "vault", "Old."), { recursive: true });
    await vault.api.createFolder("Archive");
    expect(await vault.api.renameFolder("Old.", "Archive/Old.")).toEqual({ path: "Archive/Old." });
    await expect(vault.api.renameFolder("Archive", "Archive/Old./Archive")).rejects.toThrow(
      /into itself/,
    );
    expect(await vault.api.renameFolder("Archive", "Archive")).toEqual({ path: "Archive" });
  });
});

describe("names Dropbox cannot tell apart", () => {
  it("gives a note differing only in case from another a -2", async () => {
    const phone = createPhoneVault(memoryFiles());
    await phone.api.writeNote(note("n1", "Shopping", "milk"));
    expect(await phone.api.writeNote(note("n2", "shopping", "eggs"))).toEqual({
      title: "shopping-2",
    });
  });

  it("lets a note change only the case of its own name", async () => {
    const phone = createPhoneVault(memoryFiles());
    await phone.api.writeNote(note("n1", "shopping", "milk"));
    expect(await phone.api.writeNote(note("n1", "Shopping", "milk"))).toEqual({
      title: "Shopping",
    });
    expect((await phone.store.list()).files).toEqual(["Shopping.md"]);
  });

  it("gives a folder differing only in case from another a -2", async () => {
    const phone = createPhoneVault(memoryFiles());
    await phone.api.createFolder("Work");
    expect(await phone.api.createFolder("work")).toEqual({ path: "work-2" });
  });
});

describe("a sync pass reads only what changed", () => {
  /** A vault on memory files that counts the files read under the vault. */
  const counted = (coarseClock = false) => {
    const disk = memoryFiles({ coarseClock });
    const reads: string[] = [];
    const read = disk.read;
    disk.read = (p) => {
      if (p.startsWith("vault/")) reads.push(p.slice("vault/".length));
      return read(p);
    };
    const phone = createPhoneVault(disk);
    /** What a pass asks: the listing, then each file's hash. */
    const pass = async () => {
      reads.length = 0;
      const { files } = await phone.store.list();
      const hashes = Object.fromEntries(
        await Promise.all(files.map(async (f) => [f, await phone.store.hash?.(f)])),
      );
      return { hashes, reads: [...reads].sort() };
    };
    return { disk, phone, pass };
  };

  it("reads no file twice while nothing changed", async () => {
    const { phone, pass } = counted();
    await phone.api.writeNote(note("n1", "One", "one"));
    await phone.api.writeNote(note("n2", "Two", "two"));
    const first = await pass();
    expect(first.reads).toEqual(["One.md", "Two.md"]);
    const second = await pass();
    expect(second.reads).toEqual([]);
    expect(second.hashes).toEqual(first.hashes);
  });

  it("reads again a note the editor saved, and only that one", async () => {
    const { phone, pass } = counted();
    await phone.api.writeNote(note("n1", "One", "one"));
    await phone.api.writeNote(note("n2", "Two", "two"));
    await pass();
    await phone.api.writeNote(note("n1", "One", "eno"));
    const after = await pass();
    expect(after.reads).toEqual(["One.md"]);
    expect(after.hashes["One.md"]).toBe(await contentHash(bytes("eno")));
  });

  it("forgets what sync writes, within one modified time", async () => {
    const { phone, pass } = counted(true);
    await phone.api.writeNote(note("n1", "One", "one"));
    await phone.api.writeNote(note("n2", "Two", "two"));
    const first = await pass();
    // Same size, same time: only forgetting the write can tell it apart.
    await phone.store.writeIfUnchanged("One.md", bytes("uno"), first.hashes["One.md"] as string);
    const after = await pass();
    expect(after.reads).toEqual(["One.md"]);
    expect(after.hashes["One.md"]).toBe(await contentHash(bytes("uno")));
  });

  it("forgets a write that failed after its bytes landed", async () => {
    const { disk, phone, pass } = counted(true);
    await phone.api.writeNote(note("n1", "One", "one"));
    const first = await pass();
    // The new bytes are in place, then the tidy-up after them fails.
    const write = disk.write;
    disk.write = async (p, b) => {
      await write(p, b);
      disk.write = write;
      throw new Error("killed after the write");
    };
    await expect(
      phone.store.writeIfUnchanged("One.md", bytes("uno"), first.hashes["One.md"] as string),
    ).rejects.toThrow("killed after the write");
    const after = await pass();
    expect(after.reads).toEqual(["One.md"]);
    expect(after.hashes["One.md"]).toBe(await contentHash(bytes("uno")));
  });

  it("forgets the names a rename touches, within one modified time", async () => {
    const { phone, pass } = counted(true);
    await phone.api.writeNote(note("n1", "One", "aaa"));
    await phone.api.writeNote(note("n2", "Other", "bbb"));
    await pass();
    // Another file of the same size and time takes One.md's name.
    await phone.store.rename("One.md", "Gone.md");
    await phone.store.rename("Other.md", "One.md");
    const after = await pass();
    expect(after.reads).toEqual(["Gone.md", "One.md"]);
    expect(after.hashes["One.md"]).toBe(await contentHash(bytes("bbb")));
  });

  it("reads again a file changed behind the app, by its size or its time", async () => {
    const { disk, phone, pass } = counted();
    await phone.api.writeNote(note("n1", "One", "one"));
    await pass();
    disk.touch("vault/One.md", bytes("two"));
    const after = await pass();
    expect(after.reads).toEqual(["One.md"]);
    expect(after.hashes["One.md"]).toBe(await contentHash(bytes("two")));
  });
});

describe("reading the vault at start", () => {
  /**
   * The folder's files, with each read and list held back so later ones
   * finish first, counting how many run at once and every call made.
   */
  function scrambled() {
    const base = folderFiles(root);
    const calls: string[] = [];
    const peak = { read: 0, list: 0 };
    const now = { read: 0, list: 0 };
    let order = 0;
    const held =
      <A extends unknown[], R>(kind: "read" | "list", fn: (...a: A) => Promise<R>) =>
      async (...a: A) => {
        now[kind]++;
        peak[kind] = Math.max(peak[kind], now[kind]);
        // The first asked waits longest.
        await new Promise((r) => setTimeout(r, Math.max(0, 30 - order++)));
        try {
          return await fn(...a);
        } finally {
          now[kind]--;
        }
      };
    const ops: FileOps = {
      ...base,
      read: held("read", base.read),
      list: held("list", base.list),
      write: async (p, b) => {
        calls.push(`write ${p}`);
        return base.write(p, b);
      },
      exists: async (p) => {
        calls.push(`exists ${p}`);
        return base.exists(p);
      },
      mtime: async (p) => {
        calls.push(`mtime ${p}`);
        return base.mtime(p);
      },
    };
    return { ops, calls, peak };
  }
  const put = async (rel: string, text: string) => {
    await fs.mkdir(path.dirname(path.join(root, "vault", rel)), { recursive: true });
    await fs.writeFile(path.join(root, "vault", rel), text);
  };
  const idsByPath = (notes: Record<string, { title: string; folder: string | null }>) =>
    Object.fromEntries(
      Object.entries(notes).map(([id, n]) => [`${n.folder ? `${n.folder}/` : ""}${n.title}`, id]),
    );

  it("reads at most eight files and lists at most eight folders at once, ids stable however they finish", async () => {
    for (let i = 0; i < 20; i++) await put(`Folder ${i}/Note ${i}.md`, `text ${i}`);
    const first = scrambled();
    const notes = await createPhoneVault(first.ops).api.readAllNotes();
    expect(Object.keys(notes)).toHaveLength(20);
    expect(first.peak.read).toBe(8);
    expect(first.peak.list).toBe(8);

    const again = await createPhoneVault(scrambled().ops).api.readAllNotes();
    expect(idsByPath(again)).toEqual(idsByPath(notes));
  });

  it("takes each note's time from the listing: no check per note, and no write when nothing changed", async () => {
    await put("One.md", "one");
    await put("Two.md", "two");
    const first = scrambled();
    const notes = await createPhoneVault(first.ops).api.readAllNotes();
    expect(first.calls).toEqual(["write state/ids.json"]);
    const listed = (await fs.stat(path.join(root, "vault", "One.md"))).mtimeMs;
    expect(Object.values(notes).find((n) => n.title === "One")?.lastModified).toBe(listed);

    const unchanged = scrambled();
    await createPhoneVault(unchanged.ops).api.readAllNotes();
    expect(unchanged.calls).toEqual([]);
  });

  it("writes the index when a note was added or deleted outside the app", async () => {
    await put("One.md", "one");
    await createPhoneVault(scrambled().ops).api.readAllNotes();
    await put("Two.md", "two");
    const added = scrambled();
    await createPhoneVault(added.ops).api.readAllNotes();
    expect(added.calls).toContain("write state/ids.json");

    await fs.rm(path.join(root, "vault", "One.md"));
    const deleted = scrambled();
    const notes = await createPhoneVault(deleted.ops).api.readAllNotes();
    expect(Object.values(notes).map((n) => n.title)).toEqual(["Two"]);
    expect(deleted.calls).toContain("write state/ids.json");
  });

  it("tries the index again on the next read when its write failed", async () => {
    await put("One.md", "one");
    const flaky = scrambled();
    const write = flaky.ops.write;
    let fails = 1;
    flaky.ops.write = async (p, b) => {
      if (p === "state/ids.json" && fails-- > 0) throw new Error("disk full");
      return write(p, b);
    };
    const running = createPhoneVault(flaky.ops);
    await expect(running.api.readAllNotes()).rejects.toThrow("disk full");
    const notes = await running.api.readAllNotes();
    expect(flaky.calls.filter((c) => c === "write state/ids.json")).toHaveLength(1);

    // After a restart the note keeps the id it was given.
    const again = await createPhoneVault(scrambled().ops).api.readAllNotes();
    expect(idsByPath(again)).toEqual(idsByPath(notes));
  });

  it("publishes nothing when a file cannot be read", async () => {
    await put("One.md", "one");
    await put("Two.md", "two");
    const failing = scrambled();
    const read = failing.ops.read;
    failing.ops.read = async (p) => {
      if (p.endsWith("Two.md")) throw new Error("I/O error");
      return read(p);
    };
    const broken = createPhoneVault(failing.ops);
    await expect(broken.api.readAllNotes()).rejects.toThrow("I/O error");
    expect(failing.calls).toEqual([]);
  });
});

// The phone finds an embed's file as the desktop does (the same
// `pickAttachment`), from the file list its own walk already makes: no walk
// of its own.
describe("attachments on the phone", () => {
  const put = async (rel: string) => {
    const abs = path.join(root, "vault", ...rel.split("/"));
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, "x");
  };

  it("picks the copy the desktop picks, ties included", async () => {
    for (const rel of ["Notes/Sub/Trip.md", "Notes/pic4.svg", "Other/pic4.svg", "Zeta/p.svg"])
      await put(rel);
    await put("Alpha/Deep/p.svg");
    await vault.api.readAllNotes();

    expect(await vault.api.locateAttachment("pic4.svg", "Notes/Sub")).toBe("Notes/pic4.svg");
    expect(await vault.api.locateAttachment("p.svg", "Notes/Sub")).toBe("Zeta/p.svg");
    expect(await vault.api.locateAttachment("Trip.md", null)).toBeNull();
    expect(await vault.api.locateAttachment("https://example.com/a.png", null)).toBeNull();
  });

  it("finds a picture a sync pass brought, and says so", async () => {
    await put("Trip.md");
    await vault.api.readAllNotes();
    const changed = vi.fn();
    vault.api.onAttachmentsChanged(changed);
    expect(await vault.api.locateAttachment("late.png", null)).toBeNull();

    await put("Inbox/late.png");
    await vault.store.list();

    expect(changed).toHaveBeenCalledTimes(1);
    expect(await vault.api.locateAttachment("late.png", null)).toBe("Inbox/late.png");
    // A pass that finds the same files says nothing.
    await vault.store.list();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  // A download lands through the store, between walks: found at once.
  it("finds a picture the moment sync writes it, and forgets one it removes", async () => {
    await put("Trip.md");
    await put("Old/gone.png");
    await vault.api.readAllNotes();
    const changed = vi.fn();
    vault.api.onAttachmentsChanged(changed);

    await vault.store.writeIfUnchanged("Inbox/late.png", new TextEncoder().encode("png"), null);
    expect(await vault.api.locateAttachment("late.png", null)).toBe("Inbox/late.png");
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));

    const hash = await vault.store.hash("Old/gone.png");
    expect(await vault.store.removeIfUnchanged("Old/gone.png", hash)).toBe(true);
    expect(await vault.api.locateAttachment("gone.png", null)).toBeNull();
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2));
  });
});
