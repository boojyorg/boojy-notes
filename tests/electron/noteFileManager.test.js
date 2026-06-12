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

const { readAllNotes } = await import("../../electron/noteFileManager.js");

let notesDir;

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-test-"));
});

afterEach(() => {
  fs.rmSync(notesDir, { recursive: true, force: true });
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

  it("creates nothing on disk besides the .boojy-index.json", () => {
    fs.writeFileSync(path.join(notesDir, "a.md"), "---\ntags: [t]\n---\nA", "utf-8");
    fs.writeFileSync(path.join(notesDir, "b.md"), "Plain note", "utf-8");

    readAllNotes(notesDir);

    expect(fs.readdirSync(notesDir).sort()).toEqual([".boojy-index.json", "a.md", "b.md"]);
  });
});
