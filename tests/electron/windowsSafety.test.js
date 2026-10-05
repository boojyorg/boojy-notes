import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A vault moves between machines, so a name the app makes must be one every
// system can hold (2026-10-05). Windows refuses its device names (`CON`,
// `NUL`, `COM1`…) as a file or folder however they are spelled, with or
// without an extension, and silently drops a folder name's trailing dot, so
// the folder the app was answered with is not the one on disk.

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
  dialog: {},
  shell: {},
  clipboard: {},
  nativeImage: {},
}));

const { sanitizeFilename, registerNoteFileIPC, readAllNotes, setIndexDir } = await import(
  "../../electron/noteFileManager.js"
);
const { createFolder, renameFolder } = await import("../../electron/folders");
const { renameWithRetry } = await import("../../electron/atomicWrite");
const { isCloudPath } = await import("../../electron/vaults");

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

describe("sanitizeFilename — Windows device names", () => {
  it("marks a device name, in any case, with or without more after a dot", () => {
    expect(sanitizeFilename("CON")).toBe("CON_");
    expect(sanitizeFilename("con")).toBe("con_");
    expect(sanitizeFilename("Nul")).toBe("Nul_");
    expect(sanitizeFilename("aux.notes")).toBe("aux_.notes");
    expect(sanitizeFilename("LPT9")).toBe("LPT9_");
    expect(sanitizeFilename("com1 ")).toBe("com1_");
    expect(sanitizeFilename("CONIN$")).toBe("CONIN$_");
  });

  it("leaves a name that only starts like one", () => {
    expect(sanitizeFilename("COM10")).toBe("COM10");
    expect(sanitizeFilename("Console")).toBe("Console");
    expect(sanitizeFilename("Auxiliary notes")).toBe("Auxiliary notes");
    expect(sanitizeFilename("prn notes")).toBe("prn notes");
  });

  it("keeps a note title's trailing dots: `.md` follows them", () => {
    expect(sanitizeFilename("Wait...")).toBe("Wait...");
  });
});

describe("folders — a name Windows would refuse or change", () => {
  it("marks a device name and drops trailing dots and spaces", () => {
    expect(createFolder(notesDir, "CON")).toEqual({ path: "CON_" });
    expect(createFolder(notesDir, "Notes.")).toEqual({ path: "Notes" });
    expect(createFolder(notesDir, "Ideas . .")).toEqual({ path: "Ideas" });
    expect(createFolder(notesDir, "...")).toEqual({ path: "Untitled" });
  });

  it("applies the same rule to a rename", () => {
    createFolder(notesDir, "Work");
    expect(renameFolder(notesDir, "Work", "nul")).toEqual({ path: "nul_" });
  });
});

describe("save-image and save-attachment — the extension is made safe too", () => {
  let handlers;

  beforeEach(async () => {
    const { ipcMain } = await import("electron");
    if (!handlers) {
      registerNoteFileIPC(
        () => null,
        () => notesDir,
        { claimWrite: () => {}, claimUnlink: () => {}, releaseUnlinkClaim: () => {} },
      );
      handlers = Object.fromEntries(ipcMain.handle.mock.calls);
    }
    readAllNotes(notesDir);
  });

  const data = Buffer.from("x").toString("base64");

  it("keeps only characters a file name can hold in the extension, lowercased", () => {
    const name = handlers["save-image"](null, { fileName: "photo.P?N*G ", dataBase64: data });
    expect(name).toBe("photo.png");
    expect(fs.existsSync(path.join(notesDir, "attachments", "photo.png"))).toBe(true);
  });

  it("marks a device name used as an attachment's name", () => {
    const { filename } = handlers["save-attachment"](null, {
      fileName: "nul.pdf",
      dataBase64: data,
    });
    expect(filename).toBe("nul_.pdf");
  });

  it("cuts an absurd extension", () => {
    const name = handlers["save-image"](null, {
      fileName: `a.${"x".repeat(300)}`,
      dataBase64: data,
    });
    expect(name.length).toBeLessThan(40);
  });
});

describe("renameWithRetry — Windows holds a file a moment longer than asked", () => {
  const busy = () => Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });

  it("tries again on win32 while antivirus or a sync client holds the target", () => {
    const from = path.join(notesDir, "a.tmp");
    const to = path.join(notesDir, "a.md");
    fs.writeFileSync(from, "new");
    const real = fs.renameSync;
    let refusals = 2;
    vi.spyOn(fs, "renameSync").mockImplementation((a, b) => {
      if (refusals-- > 0) throw busy();
      return real(a, b);
    });

    renameWithRetry(from, to, "win32");

    expect(fs.readFileSync(to, "utf-8")).toBe("new");
  });

  it("gives up in the end, and elsewhere at once", () => {
    const rename = vi.spyOn(fs, "renameSync").mockImplementation(() => {
      throw busy();
    });
    expect(() => renameWithRetry("a", "b", "win32")).toThrow(/EPERM/);
    const tries = rename.mock.calls.length;
    expect(tries).toBeGreaterThan(2);

    rename.mockClear();
    expect(() => renameWithRetry("a", "b", "darwin")).toThrow(/EPERM/);
    expect(rename.mock.calls.length).toBe(1);
  });
});

describe("isCloudPath — Windows sync folders", () => {
  it("knows OneDrive, Google Drive's My Drive and iCloud for Windows", () => {
    const home = path.join(path.sep, "Users", "tyr");
    expect(isCloudPath(path.join(home, "OneDrive", "Notes"))).toBe(true);
    expect(isCloudPath(path.join(home, "OneDrive - Uni of Leeds", "Notes"))).toBe(true);
    expect(isCloudPath(path.join(path.sep, "G", "My Drive", "Notes"))).toBe(true);
    expect(isCloudPath(path.join(home, "iCloudDrive", "Notes"))).toBe(true);
    expect(isCloudPath(path.join(home, "Documents", "OneDrive notes"))).toBe(false);
  });
});
