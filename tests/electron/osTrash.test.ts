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

const { migrateLegacyTrash, trashManagedNote } = await import("../../electron/osTrash");
const { getIdIndex, setIndexDir } = await import("../../electron/noteFileManager.js");

let notesDir: string;
let indexDir: string;

function makeGuard() {
  return { suppressUnlink: vi.fn(), releaseUnlink: vi.fn() };
}

function writeLegacyMetadata(metadata: Record<string, unknown>) {
  const trashDir = path.join(notesDir, ".trash");
  fs.mkdirSync(trashDir, { recursive: true });
  fs.writeFileSync(
    path.join(trashDir, ".boojy-trash-meta.json"),
    JSON.stringify(metadata),
    "utf-8",
  );
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

describe("migrateLegacyTrash", () => {
  it("copies recognized notes to readable collision-safe names before removing legacy sources", async () => {
    const trashDir = path.join(notesDir, ".trash");
    writeLegacyMetadata({
      "note-one": { originalTitle: "Meeting Notes", originalFolder: null, deletedAt: 1 },
      "note-two": { originalTitle: "Meeting Notes", originalFolder: "Work", deletedAt: 2 },
    });
    fs.writeFileSync(path.join(trashDir, "note-one.md"), "First", "utf-8");
    fs.writeFileSync(path.join(trashDir, "note-two.md"), "Second", "utf-8");

    const trashedCopies: Array<{ name: string; content: string }> = [];
    const trashItem = vi.fn(async (filePath: string) => {
      trashedCopies.push({
        name: path.basename(filePath),
        content: fs.readFileSync(filePath, "utf-8"),
      });
      fs.unlinkSync(filePath);
    });

    const report = await migrateLegacyTrash(notesDir, trashItem);

    expect(trashedCopies).toEqual([
      { name: "Meeting Notes.md", content: "First" },
      { name: "Meeting Notes-2.md", content: "Second" },
    ]);
    expect(report.migrated).toHaveLength(2);
    expect(report.untouched).toEqual([]);
    expect(fs.existsSync(trashDir)).toBe(false);
  });

  it("leaves the source and metadata untouched when the OS Trash operation fails", async () => {
    const trashDir = path.join(notesDir, ".trash");
    writeLegacyMetadata({
      "note-safe": { originalTitle: "Safe Note", originalFolder: null, deletedAt: 1 },
    });
    const sourcePath = path.join(trashDir, "note-safe.md");
    fs.writeFileSync(sourcePath, "Only copy", "utf-8");
    const metadataBefore = fs.readFileSync(path.join(trashDir, ".boojy-trash-meta.json"), "utf-8");

    const report = await migrateLegacyTrash(notesDir, async () => {
      throw new Error("Recycle Bin unavailable");
    });

    expect(fs.readFileSync(sourcePath, "utf-8")).toBe("Only copy");
    expect(fs.readFileSync(path.join(trashDir, ".boojy-trash-meta.json"), "utf-8")).toBe(
      metadataBefore,
    );
    expect(report.migrated).toEqual([]);
    expect(report.untouched).toEqual([
      expect.objectContaining({ path: sourcePath, reason: expect.stringContaining("unavailable") }),
    ]);
  });

  it("does not guess when metadata is missing and reports every untouched item", async () => {
    const trashDir = path.join(notesDir, ".trash");
    fs.mkdirSync(path.join(trashDir, "attachments"), { recursive: true });
    const sourcePath = path.join(trashDir, "unknown.md");
    fs.writeFileSync(sourcePath, "Unknown", "utf-8");

    const trashItem = vi.fn();
    const report = await migrateLegacyTrash(notesDir, trashItem);

    expect(trashItem).not.toHaveBeenCalled();
    expect(fs.readFileSync(sourcePath, "utf-8")).toBe("Unknown");
    expect(report.untouched.map((item) => path.basename(item.path)).sort()).toEqual([
      "attachments",
      "unknown.md",
    ]);
  });

  it("ignores OS cruft entirely: not reported, and not allowed to keep .trash alive", async () => {
    const trashDir = path.join(notesDir, ".trash");
    writeLegacyMetadata({
      "note-one": { originalTitle: "Meeting Notes", originalFolder: null, deletedAt: 1 },
    });
    fs.writeFileSync(path.join(trashDir, "note-one.md"), "First", "utf-8");
    fs.writeFileSync(path.join(trashDir, ".DS_Store"), "cruft", "utf-8");
    fs.writeFileSync(path.join(trashDir, "._note-one.md"), "AppleDouble", "utf-8");

    const trashItem = vi.fn(async (filePath: string) => fs.unlinkSync(filePath));
    const report = await migrateLegacyTrash(notesDir, trashItem);

    expect(report.migrated).toHaveLength(1);
    expect(report.untouched).toEqual([]);
    expect(fs.existsSync(trashDir)).toBe(false);
  });

  it("does not report OS cruft even when the metadata is missing", async () => {
    const trashDir = path.join(notesDir, ".trash");
    fs.mkdirSync(trashDir, { recursive: true });
    fs.writeFileSync(path.join(trashDir, ".DS_Store"), "cruft", "utf-8");
    fs.writeFileSync(path.join(trashDir, "unknown.md"), "Unknown", "utf-8");

    const report = await migrateLegacyTrash(notesDir, vi.fn());

    expect(report.untouched.map((item) => path.basename(item.path))).toEqual(["unknown.md"]);
  });
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
