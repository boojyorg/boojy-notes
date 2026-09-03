import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// noteFileManager imports electron at module level; only the pure fs helpers are under test
vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  dialog: {},
  shell: {},
  clipboard: {},
  nativeImage: {},
}));

const { readAllNotes, setIndexDir, indexPath } = await import("../../electron/noteFileManager.js");

let notesDir;
let indexDir;

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-test-"));
  indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-index-"));
  setIndexDir(indexDir);
});

afterEach(() => {
  fs.rmSync(notesDir, { recursive: true, force: true });
  fs.rmSync(indexDir, { recursive: true, force: true });
});

describe("readAllNotes — file mtime", () => {
  // Without this, `Note.lastModified` stays the phantom it was for months:
  // declared in the types, read by search.js as a tiebreak, never written. It
  // is what gives "Most recent" meaningful order on a vault Boojy has never
  // opened before, and what lets an edit made in another app count as recent.
  it("stamps each note with its file's modified time", () => {
    const filePath = path.join(notesDir, "Note.md");
    fs.writeFileSync(filePath, "# Hi", "utf-8");
    const mtime = Math.round(fs.statSync(filePath).mtimeMs);

    const note = Object.values(readAllNotes(notesDir))[0];

    expect(note.lastModified).toBe(mtime);
  });

  it("orders older and newer files apart", () => {
    const older = path.join(notesDir, "Older.md");
    const newer = path.join(notesDir, "Newer.md");
    fs.writeFileSync(older, "old", "utf-8");
    fs.writeFileSync(newer, "new", "utf-8");
    // Set explicit mtimes so the assertion can't depend on filesystem timing.
    fs.utimesSync(older, new Date(1_600_000_000_000), new Date(1_600_000_000_000));
    fs.utimesSync(newer, new Date(1_700_000_000_000), new Date(1_700_000_000_000));

    const byTitle = Object.fromEntries(
      Object.values(readAllNotes(notesDir)).map((n) => [n.title, n.lastModified]),
    );

    expect(byTitle.Newer).toBeGreaterThan(byTitle.Older);
    expect(byTitle.Older).toBe(1_600_000_000_000);
  });

  it("still reports a time for a file it only read, never wrote", () => {
    const filePath = path.join(notesDir, "Untouched.md");
    fs.writeFileSync(filePath, "---\ntags: [x]\n---\nbody", "utf-8");
    const before = fs.statSync(filePath).mtimeMs;

    const note = Object.values(readAllNotes(notesDir))[0];

    expect(note.lastModified).toBeGreaterThan(0);
    expect(fs.statSync(filePath).mtimeMs).toBe(before);
  });
});

describe("readAllNotes — reading never modifies files on disk", () => {
  it("leaves a file with third-party (Obsidian-style) frontmatter byte-identical", () => {
    const md =
      "---\naliases: [JS, ECMAScript]\ntags: [programming]\ncreated: 2024-01-15\n---\n# My Note\nContent here.";
    const filePath = path.join(notesDir, "My Note.md");
    fs.writeFileSync(filePath, md, "utf-8");

    const notes = readAllNotes(notesDir);

    expect(fs.readFileSync(filePath, "utf-8")).toBe(md);
    const note = Object.values(notes)[0];
    expect(note.content.blocks[0].type).toBe("frontmatter");
    expect(note.content.blocks[0].text).toBe(
      "aliases: [JS, ECMAScript]\ntags: [programming]\ncreated: 2024-01-15",
    );
  });

  it("does not treat a custom (non-Boojy) `id:` frontmatter key as a legacy Boojy ID", () => {
    const md = "---\nid: my-custom-id\ntags: [x]\n---\nBody.";
    const filePath = path.join(notesDir, "Custom.md");
    fs.writeFileSync(filePath, md, "utf-8");

    const notes = readAllNotes(notesDir);
    const note = Object.values(notes)[0];

    expect(fs.readFileSync(filePath, "utf-8")).toBe(md);
    expect(note.id).not.toBe("my-custom-id");
    expect(note.content.blocks[0].type).toBe("frontmatter");
  });

  it("recovers the ID from legacy Boojy frontmatter without rewriting the file", () => {
    const md = "---\nid: note-1700000000000-ab12\ntitle: Legacy\n---\n# Legacy\nOld note.";
    const filePath = path.join(notesDir, "Legacy.md");
    fs.writeFileSync(filePath, md, "utf-8");

    const notes = readAllNotes(notesDir);
    const note = notes["note-1700000000000-ab12"];

    expect(note).toBeDefined();
    expect(note.content.blocks[0].type).not.toBe("frontmatter");
    // Migration happens on the user's next edit via the write path — never on read
    expect(fs.readFileSync(filePath, "utf-8")).toBe(md);
  });

  it("creates nothing inside the vault — the ID index lives in userData", () => {
    fs.writeFileSync(path.join(notesDir, "a.md"), "---\ntags: [t]\n---\nA", "utf-8");
    fs.writeFileSync(path.join(notesDir, "b.md"), "Plain note", "utf-8");

    readAllNotes(notesDir);

    expect(fs.readdirSync(notesDir).sort()).toEqual(["a.md", "b.md"]);
    expect(fs.existsSync(indexPath(notesDir))).toBe(true);
  });

  it("does not rewrite the index file when a rescan changes nothing", () => {
    fs.writeFileSync(path.join(notesDir, "a.md"), "A", "utf-8");

    readAllNotes(notesDir);
    const before = fs.statSync(indexPath(notesDir));

    readAllNotes(notesDir);
    const after = fs.statSync(indexPath(notesDir));

    // An atomic rewrite would replace the inode; an untouched file keeps it
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("migrates a pre-v0.5.0 in-vault index to userData and removes it from the vault", () => {
    fs.writeFileSync(path.join(notesDir, "Keep.md"), "Body", "utf-8");
    fs.writeFileSync(
      path.join(notesDir, ".boojy-index.json"),
      JSON.stringify({ "note-1700000000000-keep": "Keep.md" }),
      "utf-8",
    );

    const notes = readAllNotes(notesDir);

    expect(notes["note-1700000000000-keep"]).toBeDefined();
    expect(fs.existsSync(path.join(notesDir, ".boojy-index.json"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(indexPath(notesDir), "utf-8"))).toEqual({
      "note-1700000000000-keep": "Keep.md",
    });
  });
});

describe("pick-file IPC — oversized files", () => {
  it("warns and returns null for a file over 100 MB instead of reading it", async () => {
    const { ipcMain, dialog } = await import("electron");
    const { registerNoteFileIPC } = await import("../../electron/noteFileManager.js");
    registerNoteFileIPC(
      () => ({}),
      () => notesDir,
      vi.fn(),
    );
    const handler = ipcMain.handle.mock.calls.find(([channel]) => channel === "pick-file")[1];

    // A sparse file: reports 101 MB to stat without writing 101 MB to disk.
    const big = path.join(notesDir, "huge.bin");
    fs.writeFileSync(big, "");
    fs.truncateSync(big, 101 * 1024 * 1024);
    dialog.showOpenDialog = vi.fn(async () => ({ canceled: false, filePaths: [big] }));
    dialog.showMessageBoxSync = vi.fn();

    // This path used to call `require("electron")` inside an ES module, so the
    // guard threw ReferenceError instead of showing the warning.
    await expect(handler()).resolves.toBeNull();
    expect(dialog.showMessageBoxSync).toHaveBeenCalledTimes(1);
    expect(dialog.showMessageBoxSync.mock.calls[0][1].message).toBe("File too large");
  });
});
