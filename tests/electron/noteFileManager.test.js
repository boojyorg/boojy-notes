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
