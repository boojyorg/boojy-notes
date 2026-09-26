import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
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
registerNoteFileIPC(
  () => null,
  () => notesDir,
  { claimWrite: vi.fn(), claimUnlink: vi.fn(), releaseUnlinkClaim: vi.fn() },
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

// The permission bits are the file's own (`chmod 600` on a private note, a
// vault shared read-only with a group), and the atomic rename lands a fresh
// temp file over the target. Proved on master 2026-09-09: 0600 became 0644 on
// the first save. Windows has no permission bits to keep, only a read-only flag.
describe.skipIf(process.platform === "win32")("write-note — the file's permission bits", () => {
  const modeOf = (p) => fs.statSync(p).mode & 0o777;
  const referenceMode = () => {
    const ref = path.join(indexDir, "reference");
    fs.writeFileSync(ref, "");
    return modeOf(ref);
  };

  it("keeps the mode an existing note has across a save", () => {
    const { filePath } = writeNote({
      id: "note-1-aaaa",
      title: "Private",
      content: { blocks: [{ type: "p", text: "one" }] },
    });
    fs.chmodSync(filePath, 0o600);

    writeNote({
      id: "note-1-aaaa",
      title: "Private",
      content: { blocks: [{ type: "p", text: "two" }] },
    });

    expect(fs.readFileSync(filePath, "utf-8")).toBe("two");
    expect(modeOf(filePath).toString(8)).toBe("600");
  });

  it("carries the mode to the new name when the note is renamed", () => {
    const { filePath } = writeNote({
      id: "note-1-aaaa",
      title: "Private",
      content: { blocks: [{ type: "p", text: "one" }] },
    });
    fs.chmodSync(filePath, 0o600);

    const renamed = writeNote({
      id: "note-1-aaaa",
      title: "Still private",
      content: { blocks: [{ type: "p", text: "one" }] },
    });

    expect(path.basename(renamed.filePath)).toBe("Still private.md");
    expect(modeOf(renamed.filePath).toString(8)).toBe("600");
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("gives a new note the mode any newly created file gets, whatever the vault holds", () => {
    // A private sibling, and a temp file left by a crash under the name the
    // write will use, are the two things a new file could pick a mode up from.
    fs.writeFileSync(path.join(notesDir, "Other.md"), "");
    fs.chmodSync(path.join(notesDir, "Other.md"), 0o600);
    fs.writeFileSync(path.join(notesDir, ".~Fresh.md.tmp"), "stale");
    fs.chmodSync(path.join(notesDir, ".~Fresh.md.tmp"), 0o600);

    const { filePath } = writeNote({
      id: "note-2-bbbb",
      title: "Fresh",
      content: { blocks: [{ type: "p", text: "new" }] },
    });

    expect(fs.readFileSync(filePath, "utf-8")).toBe("new");
    expect(modeOf(filePath).toString(8)).toBe(referenceMode().toString(8));
    expect(modeOf(path.join(notesDir, "Other.md")).toString(8)).toBe("600");
  });
});

describe.skipIf(process.platform !== "darwin")(
  "write-note — what Finder shows about a file",
  () => {
    const xattr = (...args) => execFileSync("/usr/bin/xattr", args, { encoding: "utf-8" }).trim();
    const TAGS = "com.apple.metadata:_kMDItemUserTags";
    const save = (text, title = "Tagged") =>
      writeNote({ id: "note-1-aaaa", title, content: { blocks: [{ type: "p", text }] } });

    it("keeps Finder tags and the created date across a save", () => {
      const { filePath } = save("one");
      xattr("-w", TAGS, '("Red\n6")', filePath);
      const old = new Date("2020-01-01T00:00:00Z");
      fs.utimesSync(filePath, old, old); // an earlier mtime moves the birthtime back too
      const born = fs.statSync(filePath).birthtimeMs;

      save("two");

      expect(fs.readFileSync(filePath, "utf-8")).toBe("two");
      expect(xattr("-p", TAGS, filePath)).toBe('("Red\n6")');
      expect(fs.statSync(filePath).birthtimeMs).toBe(born);
      expect(fs.statSync(filePath).mtimeMs).toBeGreaterThan(old.getTime());
    });

    it("carries the tags to the new name when the note is renamed", () => {
      const { filePath } = save("one");
      xattr("-w", TAGS, '("Blue\n4")', filePath);
      const renamed = save("one", "Renamed");
      expect(fs.existsSync(filePath)).toBe(false);
      expect(xattr("-p", TAGS, renamed.filePath)).toBe('("Blue\n4")');
    });
  },
);

describe.skipIf(process.platform === "win32")("write-note — a symlinked note", () => {
  it("writes through the link to its target, and the link stays a link", () => {
    const { filePath } = writeNote({
      id: "note-1-aaaa",
      title: "Linked",
      content: { blocks: [{ type: "p", text: "one" }] },
    });
    const target = path.join(indexDir, "elsewhere.md");
    fs.renameSync(filePath, target);
    fs.symlinkSync(target, filePath);

    writeNote({
      id: "note-1-aaaa",
      title: "Linked",
      content: { blocks: [{ type: "p", text: "two" }] },
    });

    expect(fs.lstatSync(filePath).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, "utf-8")).toBe("two");
    expect(fs.readdirSync(indexDir).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("the save's temp file", () => {
  it("is hidden and carries the prefix Dropbox never syncs", async () => {
    const { tempPathFor } = await import("../../electron/atomicWrite");
    expect(path.basename(tempPathFor(path.join("/v", "Uni", "Week 1.md")))).toBe(".~Week 1.md.tmp");
    expect(path.dirname(tempPathFor(path.join("/v", "Uni", "Week 1.md")))).toBe(
      path.join("/v", "Uni"),
    );
  });
});
