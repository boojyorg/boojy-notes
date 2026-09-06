/**
 * Folders are directories. Every operation here is one filesystem operation
 * that answers with the vault-relative path the disk actually holds, the way
 * `write-note` answers with a note's final basename.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
  dialog: {},
  shell: {},
  clipboard: {},
  nativeImage: {},
}));

const { createFolder, deleteFolderIfEmpty, readAllFolders, renameFolder, resolveVaultDir } =
  await import("../../electron/folders");
const { getIdIndex, readAllNotes, setIndexDir } = await import("../../electron/noteFileManager.js");

let notesDir: string;
let indexDir: string;

const mkdir = (rel: string) =>
  fs.mkdirSync(path.join(notesDir, ...rel.split("/")), { recursive: true });
const write = (rel: string, content = "body") => {
  fs.mkdirSync(path.dirname(path.join(notesDir, ...rel.split("/"))), { recursive: true });
  fs.writeFileSync(path.join(notesDir, ...rel.split("/")), content, "utf-8");
};
const exists = (rel: string) => fs.existsSync(path.join(notesDir, ...rel.split("/")));
const guard = () => ({ suppressTree: vi.fn() });

beforeEach(() => {
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-folders-"));
  indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-index-"));
  setIndexDir(indexDir);
});

afterEach(() => {
  fs.rmSync(notesDir, { recursive: true, force: true });
  fs.rmSync(indexDir, { recursive: true, force: true });
});

describe("readAllFolders — every directory that can hold notes", () => {
  it("lists nested directories, empty ones included, as sorted `/` paths", () => {
    mkdir("Uni/26-27 Semester 1/COMP336/Weeks");
    mkdir("Uni/26-27 Semester 1/COMP336/Resources"); // holds no notes, still a folder
    mkdir("Dev");
    write("Dev/boojy.md");

    expect(readAllFolders(notesDir)).toEqual([
      "Dev",
      "Uni",
      "Uni/26-27 Semester 1",
      "Uni/26-27 Semester 1/COMP336",
      "Uni/26-27 Semester 1/COMP336/Resources",
      "Uni/26-27 Semester 1/COMP336/Weeks",
    ]);
  });

  it("skips hidden directories and the attachment store at any depth, like the note walk", () => {
    mkdir(".obsidian/plugins");
    mkdir(".git");
    mkdir("attachments");
    mkdir("Work/attachments");
    mkdir("Work/.hidden");
    write("Work/note.txt"); // a file is not a folder

    expect(readAllFolders(notesDir)).toEqual(["Work"]);
  });

  it("is empty for a missing or empty vault", () => {
    expect(readAllFolders(notesDir)).toEqual([]);
    expect(readAllFolders(path.join(notesDir, "nope"))).toEqual([]);
  });
});

describe("resolveVaultDir — a folder path never escapes the vault", () => {
  it("accepts nested paths and rejects the root, traversal, and empty segments", () => {
    expect(resolveVaultDir(notesDir, "A/B")).toBe(path.join(notesDir, "A", "B"));
    expect(resolveVaultDir(notesDir, "")).toBeNull();
    expect(resolveVaultDir(notesDir, "..")).toBeNull();
    expect(resolveVaultDir(notesDir, "A/../B")).toBeNull();
    expect(resolveVaultDir(notesDir, "A//B")).toBeNull();
    expect(resolveVaultDir(notesDir, "/etc")).toBeNull();
    expect(resolveVaultDir(notesDir, ".")).toBeNull();
  });
});

describe("create-folder — the directory exists at once, under the name the disk allows", () => {
  it("makes the directory and answers with its path", () => {
    expect(createFolder(notesDir, "Untitled Folder")).toEqual({ path: "Untitled Folder" });
    expect(fs.statSync(path.join(notesDir, "Untitled Folder")).isDirectory()).toBe(true);
  });

  it("creates inside an existing parent, sanitises the name, and de-duplicates", () => {
    mkdir("Uni");
    expect(createFolder(notesDir, "Uni/Untitled Folder")).toEqual({ path: "Uni/Untitled Folder" });
    expect(createFolder(notesDir, "Uni/Untitled Folder")).toEqual({
      path: "Uni/Untitled Folder-2",
    });
    expect(createFolder(notesDir, "Uni/a:b?")).toEqual({ path: "Uni/a_b_" });
    expect(createFolder(notesDir, "Uni/   ")).toEqual({ path: "Uni/Untitled" });
    expect(readAllFolders(notesDir)).toEqual([
      "Uni",
      "Uni/Untitled",
      "Uni/Untitled Folder",
      "Uni/Untitled Folder-2",
      "Uni/a_b_",
    ]);
  });

  it("never makes a directory its own walk would skip", () => {
    // A `.archive` directory hid every note inside it at the next restart, and
    // a folder called `attachments` is the attachment store to the walk.
    expect(createFolder(notesDir, ".archive")).toEqual({ path: "_archive" });
    expect(createFolder(notesDir, "attachments")).toEqual({ path: "_attachments" });
    expect(createFolder(notesDir, "Attachments")).toEqual({ path: "Attachments" });
    mkdir("Uni");
    expect(createFolder(notesDir, "Uni/.hidden")).toEqual({ path: "Uni/_hidden" });
    expect(createFolder(notesDir, "Uni/attachments")).toEqual({ path: "Uni/_attachments" });
    expect(readAllFolders(notesDir)).toEqual([
      "Attachments",
      "Uni",
      "Uni/_attachments",
      "Uni/_hidden",
      "_archive",
      "_attachments",
    ]);
  });

  it("refuses a parent that does not exist or lies outside the vault", () => {
    expect(() => createFolder(notesDir, "Missing/New")).toThrow();
    expect(() => createFolder(notesDir, "../New")).toThrow();
    expect(readAllFolders(notesDir)).toEqual([]);
  });
});

describe("rename-folder — one directory rename carries every file with it", () => {
  it("renames in place: notes and non-note siblings move together, the index follows", () => {
    write("Work/Note.md", "note");
    write("Work/Deep/Other.md", "other");
    write("Work/budget.pdf", "pdf");
    const before = readAllNotes(notesDir);
    const ids = Object.fromEntries(Object.values(before).map((n) => [n.title, n.id]));

    const result = renameFolder(notesDir, "Work", "Clients", guard());

    expect(result).toEqual({ path: "Clients" });
    expect(exists("Work")).toBe(false);
    expect(fs.readFileSync(path.join(notesDir, "Clients", "budget.pdf"), "utf-8")).toBe("pdf");
    expect(exists("Clients/Deep/Other.md")).toBe(true);
    const index = getIdIndex();
    expect(index[ids.Note]).toBe(path.join("Clients", "Note.md"));
    expect(index[ids.Other]).toBe(path.join("Clients", "Deep", "Other.md"));
    // A re-read keeps every ID, so the renderer's open note survives the move.
    const after = readAllNotes(notesDir);
    expect(after[ids.Note]?.folder).toBe("Clients");
    expect(after[ids.Other]?.folder).toBe("Clients/Deep");
  });

  it("moves into another parent, and back to the root, by the same call", () => {
    write("Work/Note.md");
    mkdir("Archive");
    readAllNotes(notesDir);

    expect(renameFolder(notesDir, "Work", "Archive/Work")).toEqual({ path: "Archive/Work" });
    expect(readAllNotes(notesDir)[Object.keys(getIdIndex())[0]].folder).toBe("Archive/Work");

    expect(renameFolder(notesDir, "Archive/Work", "Work")).toEqual({ path: "Work" });
    expect(readAllFolders(notesDir)).toEqual(["Archive", "Work"]);
  });

  it("sanitises the new name and answers with it; a namesake gets a suffix", () => {
    mkdir("Work");
    mkdir("Clients");
    expect(renameFolder(notesDir, "Work", "a:b")).toEqual({ path: "a_b" });
    expect(renameFolder(notesDir, "a_b", "Clients")).toEqual({ path: "Clients-2" });
    expect(readAllFolders(notesDir)).toEqual(["Clients", "Clients-2"]);
  });

  it("renames onto a visible name when asked for a hidden or reserved one", () => {
    mkdir("Work");
    write("Work/Note.md");
    expect(renameFolder(notesDir, "Work", ".old")).toEqual({ path: "_old" });
    expect(renameFolder(notesDir, "_old", "attachments")).toEqual({ path: "_attachments" });
    expect(readAllFolders(notesDir)).toEqual(["_attachments"]);
    expect(exists("_attachments/Note.md")).toBe(true);
  });

  it("changes only the letter case without treating the folder as its own namesake", () => {
    write("work/Note.md");
    readAllNotes(notesDir);

    expect(renameFolder(notesDir, "work", "Work")).toEqual({ path: "Work" });
    expect(fs.readdirSync(notesDir)).toEqual(["Work"]);
    expect(exists("Work/Note.md")).toBe(true);
  });

  it("is a no-op for the same path, and refuses itself, its subtree, and a missing folder", () => {
    mkdir("Work/Sub");
    expect(renameFolder(notesDir, "Work", "Work")).toEqual({ path: "Work" });
    expect(() => renameFolder(notesDir, "Work", "Work/Sub/Work")).toThrow(/into itself/);
    expect(() => renameFolder(notesDir, "Missing", "Anything")).toThrow();
    expect(() => renameFolder(notesDir, "Work", "../Escaped")).toThrow();
    expect(readAllFolders(notesDir)).toEqual(["Work", "Work/Sub"]);
  });

  it("suppresses the watcher under both the old and the new directory", () => {
    mkdir("Work");
    const g = guard();
    renameFolder(notesDir, "Work", "Clients", g);
    expect(g.suppressTree).toHaveBeenCalledWith(path.join(notesDir, "Work"));
    expect(g.suppressTree).toHaveBeenCalledWith(path.join(notesDir, "Clients"));
  });
});

describe("delete-folder — the directory goes only when nothing is left in it", () => {
  it("removes an empty directory, and one holding only OS cruft and empty subfolders", () => {
    mkdir("Empty");
    mkdir("Cruft/Sub/Deeper");
    write("Cruft/.DS_Store", "");
    write("Cruft/Sub/Thumbs.db", "");

    expect(deleteFolderIfEmpty(notesDir, "Empty")).toEqual({ removed: true });
    expect(deleteFolderIfEmpty(notesDir, "Cruft")).toEqual({ removed: true });
    expect(readAllFolders(notesDir)).toEqual([]);
  });

  it("keeps a directory that still holds a file that is not a note, untouched", () => {
    write("Work/budget.txt", "not a note");
    write("Work/Sub/._resource", "");

    expect(deleteFolderIfEmpty(notesDir, "Work")).toEqual({ removed: false });
    expect(fs.readFileSync(path.join(notesDir, "Work", "budget.txt"), "utf-8")).toBe("not a note");
    expect(exists("Work/Sub/._resource")).toBe(true);
  });

  it("treats a directory that is already gone as removed, and refuses paths outside the vault", () => {
    expect(deleteFolderIfEmpty(notesDir, "Gone")).toEqual({ removed: true });
    expect(() => deleteFolderIfEmpty(notesDir, "../Outside")).toThrow();
  });
});
