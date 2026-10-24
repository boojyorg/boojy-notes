import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
  dialog: {},
  shell: { trashItem: vi.fn() },
  clipboard: {},
  nativeImage: {},
}));

const { trashManagedNote, trashOtherFile } = await import("../../electron/osTrash");
const { getIdIndex, setIndexDir } = await import("../../electron/noteFileManager.js");

let notesDir: string;
let indexDir: string;

function makeGuard() {
  return { suppressUnlink: vi.fn(), releaseUnlink: vi.fn(), unlinkDone: vi.fn() };
}

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-os-trash-notes-"));
  indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-os-trash-index-"));
  setIndexDir(indexDir);
  const index = getIdIndex();
  for (const id of Object.keys(index)) delete index[id];
});

afterEach(() => {
  fs.rmSync(notesDir, { recursive: true, force: true });
  fs.rmSync(indexDir, { recursive: true, force: true });
});

describe("trashManagedNote", () => {
  it("trashes only the indexed Markdown file and preserves its physical folder and siblings", async () => {
    const folder = path.join(notesDir, "Project");
    fs.mkdirSync(folder);
    const notePath = path.join(folder, "Note.md");
    const unsupportedPath = path.join(folder, "canvas.canvas");
    fs.writeFileSync(notePath, "Note", "utf-8");
    fs.writeFileSync(unsupportedPath, "Unsupported", "utf-8");
    getIdIndex()["note-1"] = path.join("Project", "Note.md");

    const guard = makeGuard();
    const trashItem = vi.fn(async (filePath: string) => fs.unlinkSync(filePath));
    const result = await trashManagedNote(notesDir, "note-1", guard, trashItem);

    expect(result).toEqual({ trashed: true });
    expect(trashItem).toHaveBeenCalledWith(notePath);
    expect(guard.suppressUnlink).toHaveBeenCalledWith(notePath);
    expect(guard.releaseUnlink).not.toHaveBeenCalled();
    // The move is done: the watch forgets the file, so a Put Back is an add.
    expect(guard.unlinkDone).toHaveBeenCalledWith(notePath);
    expect(fs.existsSync(notePath)).toBe(false);
    expect(fs.readFileSync(unsupportedPath, "utf-8")).toBe("Unsupported");
    expect(fs.existsSync(folder)).toBe(true);
    expect(getIdIndex()["note-1"]).toBeUndefined();
  });

  it("preserves the physical folder even when the managed note was its only file", async () => {
    const folder = path.join(notesDir, "Empty after deletion");
    fs.mkdirSync(folder);
    const notePath = path.join(folder, "Note.md");
    fs.writeFileSync(notePath, "Note", "utf-8");
    getIdIndex()["note-1"] = path.join("Empty after deletion", "Note.md");

    const trashItem = vi.fn(async (filePath: string) => fs.unlinkSync(filePath));
    const result = await trashManagedNote(notesDir, "note-1", makeGuard(), trashItem);

    expect(result).toEqual({ trashed: true });
    expect(fs.existsSync(notePath)).toBe(false);
    expect(fs.existsSync(folder)).toBe(true);
  });

  it("leaves the note and index intact — and releases the unlink suppression — when the OS Trash operation fails", async () => {
    const notePath = path.join(notesDir, "Important.md");
    fs.writeFileSync(notePath, "Only copy", "utf-8");
    getIdIndex()["note-1"] = "Important.md";
    const guard = makeGuard();

    await expect(
      trashManagedNote(notesDir, "note-1", guard, async () => {
        throw new Error("Trash unavailable");
      }),
    ).rejects.toThrow("Trash unavailable");

    expect(fs.readFileSync(notePath, "utf-8")).toBe("Only copy");
    expect(getIdIndex()["note-1"]).toBe("Important.md");
    expect(guard.suppressUnlink).toHaveBeenCalledWith(notePath);
    expect(guard.releaseUnlink).toHaveBeenCalledWith(notePath);
    expect(guard.unlinkDone).not.toHaveBeenCalled();
  });

  it("refuses to trash an indexed file that is not Markdown", async () => {
    const unsupportedPath = path.join(notesDir, "drawing.canvas");
    fs.writeFileSync(unsupportedPath, "Unsupported", "utf-8");
    getIdIndex()["note-1"] = "drawing.canvas";
    const trashItem = vi.fn();

    const result = await trashManagedNote(notesDir, "note-1", makeGuard(), trashItem);

    expect(result).toEqual({ trashed: false });
    expect(trashItem).not.toHaveBeenCalled();
    expect(fs.readFileSync(unsupportedPath, "utf-8")).toBe("Unsupported");
    expect(getIdIndex()["note-1"]).toBe("drawing.canvas");
  });

  it("reports a never-persisted note as benignly missing, not as a failure", async () => {
    const trashItem = vi.fn();

    const result = await trashManagedNote(notesDir, "never-written", makeGuard(), trashItem);

    expect(result).toEqual({ trashed: false, missing: true });
    expect(trashItem).not.toHaveBeenCalled();
  });

  it("heals a stale index entry whose file is already gone and reports it as missing", async () => {
    getIdIndex()["note-1"] = "Vanished.md";
    const trashItem = vi.fn();

    const result = await trashManagedNote(notesDir, "note-1", makeGuard(), trashItem);

    expect(result).toEqual({ trashed: false, missing: true });
    expect(trashItem).not.toHaveBeenCalled();
    expect(getIdIndex()["note-1"]).toBeUndefined();
  });
});

describe("trashOtherFile", () => {
  const put = (rel: string) => {
    const abs = path.join(notesDir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, "x");
    return abs;
  };

  it("sends a file that is not a note to the Trash", async () => {
    const abs = put("Uni/handout.pdf");
    const trashItem = vi.fn(async () => {});
    expect(await trashOtherFile(notesDir, "Uni/handout.pdf", trashItem)).toEqual({ trashed: true });
    expect(trashItem).toHaveBeenCalledWith(abs);
  });

  it("takes a Markdown file inside the attachment store, which is not a note", async () => {
    put("attachments/pasted.md");
    const trashItem = vi.fn(async () => {});
    expect(await trashOtherFile(notesDir, "attachments/pasted.md", trashItem)).toEqual({
      trashed: true,
    });
  });

  it("refuses a note, a folder, the vault and anything outside it", async () => {
    put("Note.md");
    put("Uni/a.pdf");
    const trashItem = vi.fn(async () => {});
    for (const rel of ["Note.md", "Uni", "", "../elsewhere.pdf", "missing.pdf"]) {
      expect(await trashOtherFile(notesDir, rel, trashItem)).toEqual({ trashed: false });
    }
    expect(trashItem).not.toHaveBeenCalled();
  });
});
