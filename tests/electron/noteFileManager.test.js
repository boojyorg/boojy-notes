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

// ─── Title is filename: the write path reports the name the file really got ───

describe("ensureUniqueFilePath — a note's own file is not a collision", () => {
  it("returns the own path even though a file exists there", async () => {
    const { ensureUniqueFilePath } = await import("../../electron/noteFileManager.js");
    const own = path.join(notesDir, "Meeting notes-2.md");
    const namesake = path.join(notesDir, "Meeting notes.md");
    fs.writeFileSync(namesake, "theirs", "utf-8");
    fs.writeFileSync(own, "mine", "utf-8");

    // Requested name is taken by the namesake; the first free suffix is the
    // note's own file, so that is where it stays — not `-3`.
    expect(ensureUniqueFilePath(namesake, own)).toBe(own);
    // With no own path (a brand-new note), the same request skips both.
    expect(ensureUniqueFilePath(namesake)).toBe(path.join(notesDir, "Meeting notes-3.md"));
    // A free requested name is used as is.
    expect(ensureUniqueFilePath(path.join(notesDir, "Free.md"), own)).toBe(
      path.join(notesDir, "Free.md"),
    );
  });
});

describe("write-note — the returned title is the basename on disk", () => {
  let writeNote;
  let registered;

  beforeEach(async () => {
    const { ipcMain } = await import("electron");
    const { registerNoteFileIPC } = await import("../../electron/noteFileManager.js");
    if (!registered) {
      registerNoteFileIPC(
        () => null,
        () => notesDir,
        () => {},
      );
      registered = true;
    }
    const handler = ipcMain.handle.mock.calls.find(([name]) => name === "write-note")[1];
    writeNote = (note) => handler(null, note);
    readAllNotes(notesDir); // load (an empty) index for this vault
  });

  const note = (id, title, folder = null, text = "body") => ({
    id,
    title,
    folder,
    content: { title, blocks: [{ id: "b1", type: "p", text }] },
  });

  it("suffixes a namesake and keeps that suffix on every later save", () => {
    fs.mkdirSync(path.join(notesDir, "Work"));
    fs.writeFileSync(path.join(notesDir, "Work", "Meeting notes.md"), "theirs", "utf-8");
    readAllNotes(notesDir); // the namesake is indexed as another note

    const moved = note("note-moved", "Meeting notes", "Work", "mine");
    const first = writeNote(moved);
    expect(first.title).toBe("Meeting notes-2");
    expect(first.filePath).toBe(path.join(notesDir, "Work", "Meeting notes-2.md"));

    // The renderer has not adopted the name yet (or was undone): the same
    // request must land on the same file, never bounce between -2 and -3.
    for (let i = 0; i < 3; i++) {
      const again = writeNote({ ...moved, content: { ...moved.content, blocks: [] } });
      expect(again.filePath, `save ${i + 2}`).toBe(first.filePath);
      expect(again.title, `save ${i + 2}`).toBe("Meeting notes-2");
    }
    expect(fs.readdirSync(path.join(notesDir, "Work")).sort()).toEqual([
      "Meeting notes-2.md",
      "Meeting notes.md",
    ]);
    expect(fs.readFileSync(path.join(notesDir, "Work", "Meeting notes.md"), "utf-8")).toBe(
      "theirs",
    );
  });

  it("reports the sanitised and trimmed name, and Untitled for a blank one", () => {
    expect(writeNote(note("n-sanitised", "Notes: a/b?")).title).toBe("Notes_ a_b_");
    expect(writeNote(note("n-trimmed", "  Padded  ")).title).toBe("Padded");
    expect(writeNote(note("n-blank", "")).title).toBe("Untitled");
    expect(writeNote(note("n-blank-2", "   ")).title).toBe("Untitled-2");
    expect(fs.readdirSync(notesDir).sort()).toEqual([
      "Notes_ a_b_.md",
      "Padded.md",
      "Untitled-2.md",
      "Untitled.md",
    ]);
  });

  it("never hides a note from its own walk: a leading dot becomes an underscore", () => {
    // `.env.md` was written fine, then skipped by the vault walk, the folder
    // walk and the watcher alike, so the note vanished at the next restart.
    expect(writeNote(note("n-dot", ".env")).title).toBe("_env");
    expect(writeNote(note("n-dot-padded", "  .archive  ")).title).toBe("_archive");
    expect(writeNote(note("n-dots", "..")).title).toBe("_.");
    expect(writeNote(note("n-dot-only", ".")).title).toBe("_");
    // Ordinary names are untouched, dots inside them included.
    expect(writeNote(note("n-inner-dot", "v1.2 notes")).title).toBe("v1.2 notes");
    const onDisk = fs.readdirSync(notesDir).sort();
    expect(onDisk).toEqual(["_..md", "_.md", "_archive.md", "_env.md", "v1.2 notes.md"]);
    expect(
      Object.values(readAllNotes(notesDir))
        .map((n) => n.title)
        .sort(),
    ).toEqual(["_", "_.", "_archive", "_env", "v1.2 notes"]);
  });

  it("never overwrites a file it did not index", () => {
    // A file that appeared on disk between vault walks (no watcher in tests).
    fs.writeFileSync(path.join(notesDir, "Draft.md"), "someone else's", "utf-8");

    const result = writeNote(note("n-new", "Draft", null, "mine"));

    expect(result.title).toBe("Draft-2");
    expect(fs.readFileSync(path.join(notesDir, "Draft.md"), "utf-8")).toBe("someone else's");
    expect(fs.readFileSync(path.join(notesDir, "Draft-2.md"), "utf-8")).toBe("mine");
  });

  it("renames its own file when only the letter case changes", () => {
    const first = writeNote(note("n-case", "meeting", null, "mine"));
    expect(first.title).toBe("meeting");

    const renamed = writeNote(note("n-case", "Meeting", null, "mine"));

    // One file, under the new casing, with its content — on a case-insensitive
    // volume the old entry must be moved, not written over and then deleted.
    expect(renamed.title).toBe("Meeting");
    expect(fs.readdirSync(notesDir)).toEqual(["Meeting.md"]);
    expect(fs.readFileSync(path.join(notesDir, "Meeting.md"), "utf-8")).toBe("mine");
  });
});
