import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  dialog: {},
  shell: {},
  clipboard: {},
  nativeImage: {},
}));

const { readAllNotes, parseNoteFile, setIndexDir, MAX_NOTE_BYTES, registerNoteFileIPC } =
  await import("../../electron/noteFileManager.js");
const { applyEol, blocksToMarkdown, detectEol } = await import("../../src/utils/markdown.js");

// A file the app cannot edit as text is listed, never dropped and never
// written (2026-10-05). Before, a Windows-1252 note loaded with U+FFFD in
// place of its accented letters and the first save wrote them over the
// original bytes; a file that failed to read vanished from the sidebar.

let notesDir;
let indexDir;

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-test-"));
  indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-index-"));
  setIndexDir(indexDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(notesDir, { recursive: true, force: true });
  fs.rmSync(indexDir, { recursive: true, force: true });
});

// "Café crème" in Windows-1252: é is 0xE9, è is 0xE8, neither valid UTF-8 alone.
const CP1252 = Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x20, 0x63, 0x72, 0xe8, 0x6d, 0x65, 0x0a]);
// "Hi" in UTF-16LE with its byte-order mark.
const UTF16LE = Buffer.from([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);

const byTitle = (notes) => Object.fromEntries(Object.values(notes).map((n) => [n.title, n]));

describe("readAllNotes — a file the app cannot read as text is listed, not dropped", () => {
  it("lists a Windows-1252 file as unreadable, with no text, and leaves its bytes alone", () => {
    const file = path.join(notesDir, "Old.md");
    fs.writeFileSync(file, CP1252);
    fs.writeFileSync(path.join(notesDir, "Fine.md"), "fine\n");

    const notes = byTitle(readAllNotes(notesDir));

    expect(notes.Old.unreadable).toBe("encoding");
    expect(notes.Old.content.blocks).toEqual([]);
    expect(notes.Fine.unreadable).toBeUndefined();
    expect(fs.readFileSync(file).equals(CP1252)).toBe(true);
  });

  it("lists UTF-16 and a file holding NUL bytes as unreadable", () => {
    fs.writeFileSync(path.join(notesDir, "Wide.md"), UTF16LE);
    fs.writeFileSync(path.join(notesDir, "Binary.md"), Buffer.from([0x61, 0x00, 0x62]));

    const notes = byTitle(readAllNotes(notesDir));

    expect(notes.Wide.unreadable).toBe("encoding");
    expect(notes.Binary.unreadable).toBe("encoding");
  });

  it("reads a UTF-8 file with a byte-order mark as text, and writes it back byte for byte", () => {
    const raw = "﻿# Title\n\nBody é\n";
    fs.writeFileSync(path.join(notesDir, "Bom.md"), raw, "utf-8");

    const note = byTitle(readAllNotes(notesDir)).Bom;

    expect(note.unreadable).toBeUndefined();
    expect(applyEol(blocksToMarkdown(note.content.blocks), detectEol(raw))).toBe(raw);
  });

  it("lists a file too large to open as text, without reading it", () => {
    const file = path.join(notesDir, "Huge.md");
    fs.writeFileSync(file, "");
    fs.truncateSync(file, MAX_NOTE_BYTES + 1);
    const read = vi.spyOn(fs, "readFileSync");

    const note = byTitle(readAllNotes(notesDir)).Huge;

    expect(note.unreadable).toBe("too-large");
    expect(read.mock.calls.some(([p]) => p === file)).toBe(false);
  });

  it("lists a file that fails to read, under the id it had", () => {
    const file = path.join(notesDir, "Locked.md");
    fs.writeFileSync(file, "text\n");
    const id = Object.keys(readAllNotes(notesDir))[0];
    const real = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation((p, ...rest) => {
      if (p === file)
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return real(p, ...rest);
    });

    const notes = readAllNotes(notesDir);

    expect(notes[id]?.unreadable).toBe("read");
    expect(notes[id].title).toBe("Locked");
  });

  it("still loads the rest of the vault when one folder cannot be listed", () => {
    fs.mkdirSync(path.join(notesDir, "Shut"));
    fs.writeFileSync(path.join(notesDir, "Shut", "Inside.md"), "inside\n");
    fs.writeFileSync(path.join(notesDir, "Outside.md"), "outside\n");
    const shut = path.join(notesDir, "Shut");
    const real = fs.readdirSync;
    vi.spyOn(fs, "readdirSync").mockImplementation((p, ...rest) => {
      if (p === shut)
        throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
      return real(p, ...rest);
    });

    const notes = byTitle(readAllNotes(notesDir));

    expect(Object.keys(notes)).toEqual(["Outside"]);
  });

  it("reads a file as text again once it holds text, under the same id", () => {
    const file = path.join(notesDir, "Old.md");
    fs.writeFileSync(file, CP1252);
    const id = Object.keys(readAllNotes(notesDir))[0];
    fs.writeFileSync(file, "Café crème\n", "utf-8");

    const note = parseNoteFile(file, notesDir);

    expect(note.id).toBe(id);
    expect(note.unreadable).toBeUndefined();
    expect(note.content.blocks[0].text).toBe("Café crème");
  });
});

describe("write-note — an unreadable note's file is moved, never written", () => {
  let writeNote;
  let handler;

  beforeEach(async () => {
    const { ipcMain } = await import("electron");
    if (!handler) {
      registerNoteFileIPC(
        () => null,
        () => notesDir,
        { claimWrite: () => {}, claimUnlink: () => {}, releaseUnlinkClaim: () => {} },
      );
      handler = ipcMain.handle.mock.calls.find(([name]) => name === "write-note")[1];
    }
    writeNote = (note) => handler(null, note);
  });

  const loadOld = () => {
    fs.writeFileSync(path.join(notesDir, "Old.md"), CP1252);
    return Object.values(readAllNotes(notesDir))[0];
  };

  it("renames and moves the file with its bytes untouched", () => {
    const old = loadOld();
    fs.mkdirSync(path.join(notesDir, "Archive"));

    const written = writeNote({ ...old, title: "Older", folder: "Archive" });

    expect(written.title).toBe("Older");
    expect(fs.existsSync(path.join(notesDir, "Old.md"))).toBe(false);
    expect(fs.readFileSync(path.join(notesDir, "Archive", "Older.md")).equals(CP1252)).toBe(true);
  });

  it("writes no text into it, whatever the note it is handed holds", () => {
    const old = loadOld();
    const { unreadable: _, ...unmarked } = old;
    const blocks = [{ id: "b1", type: "p", text: "replaced" }];

    writeNote({ ...unmarked, content: { title: "Old", blocks } });

    expect(fs.readFileSync(path.join(notesDir, "Old.md")).equals(CP1252)).toBe(true);
  });

  it("keeps a name taken by another file: the move takes the next free one", () => {
    const old = loadOld();
    fs.writeFileSync(path.join(notesDir, "Taken.md"), "someone else's\n");
    readAllNotes(notesDir);

    const written = writeNote({ ...old, title: "Taken" });

    expect(written.title).toBe("Taken-2");
    expect(fs.readFileSync(path.join(notesDir, "Taken.md"), "utf-8")).toBe("someone else's\n");
    expect(fs.readFileSync(path.join(notesDir, "Taken-2.md")).equals(CP1252)).toBe(true);
  });
});
