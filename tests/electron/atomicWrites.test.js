import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Capture IPC handlers so tests can invoke them directly
const handlers = {};
vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel, fn) => {
      handlers[channel] = fn;
    },
  },
  dialog: {},
  shell: {},
  clipboard: {},
  nativeImage: {},
}));

const { registerNoteFileIPC, loadIndex, setIndexDir, indexPath } = await import(
  "../../electron/noteFileManager.js"
);

let notesDir;
let indexDir;
const suppressWatcher = vi.fn();

registerNoteFileIPC(
  () => null,
  () => notesDir,
  suppressWatcher,
);

const writeNote = (note) => handlers["write-note"](null, note);

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-test-"));
  indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-index-"));
  setIndexDir(indexDir);
  loadIndex(notesDir);
});

afterEach(() => {
  fs.rmSync(notesDir, { recursive: true, force: true });
  fs.rmSync(indexDir, { recursive: true, force: true });
});

describe("write-note — crash-safe writes", () => {
  it("writes a note to disk and leaves no temp files behind", () => {
    const { filePath } = writeNote({
      id: "note-1-aaaa",
      title: "Hello",
      content: { blocks: [{ type: "p", text: "Body text" }] },
    });

    expect(fs.readFileSync(filePath, "utf-8")).toBe("Body text");
    const leftovers = fs.readdirSync(notesDir).filter((f) => f.endsWith(".tmp"));
    expect(leftovers).toEqual([]);
  });

  it("on rename, the new file exists with full content and the old one is removed", () => {
    writeNote({
      id: "note-1-aaaa",
      title: "Old Title",
      content: { blocks: [{ type: "p", text: "Content" }] },
    });
    const { filePath } = writeNote({
      id: "note-1-aaaa",
      title: "New Title",
      content: { blocks: [{ type: "p", text: "Content" }] },
    });

    expect(path.basename(filePath)).toBe("New Title.md");
    expect(fs.readFileSync(filePath, "utf-8")).toBe("Content");
    expect(fs.existsSync(path.join(notesDir, "Old Title.md"))).toBe(false);
  });

  it("never overwrites a different note's file on title collision", () => {
    writeNote({
      id: "note-1-aaaa",
      title: "Same",
      content: { blocks: [{ type: "p", text: "first" }] },
    });
    const { filePath } = writeNote({
      id: "note-2-bbbb",
      title: "Same",
      content: { blocks: [{ type: "p", text: "second" }] },
    });

    expect(path.basename(filePath)).toBe("Same-2.md");
    expect(fs.readFileSync(path.join(notesDir, "Same.md"), "utf-8")).toBe("first");
  });

  it("fsyncs the temp file before renaming it over the target", () => {
    const fsyncSpy = vi.spyOn(fs, "fsyncSync");
    const renameSpy = vi.spyOn(fs, "renameSync");

    writeNote({
      id: "note-1-aaaa",
      title: "Synced",
      content: { blocks: [{ type: "p", text: "durable" }] },
    });

    expect(fsyncSpy).toHaveBeenCalled();
    expect(renameSpy).toHaveBeenCalled();
    // Data must reach the platter before the rename commits the new entry
    expect(fsyncSpy.mock.invocationCallOrder[0]).toBeLessThan(
      renameSpy.mock.invocationCallOrder[0],
    );

    fsyncSpy.mockRestore();
    renameSpy.mockRestore();
  });

  it("keeps the index as valid JSON after writes", () => {
    writeNote({
      id: "note-1-aaaa",
      title: "A",
      content: { blocks: [{ type: "p", text: "a" }] },
    });
    const index = JSON.parse(fs.readFileSync(indexPath(notesDir), "utf-8"));
    expect(index["note-1-aaaa"]).toBe("A.md");
  });
});
