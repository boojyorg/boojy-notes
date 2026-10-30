/**
 * A note in no storage location, edited in place (electron/outsideNotes.ts):
 * one note per real path, a save refused over bytes not seen, a rename kept
 * in its folder, an edit or a delete found when asked (the window coming back
 * to the front), and pictures served only from inside its folder.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/tmp") },
  ipcMain: { handle: vi.fn() },
  dialog: {},
  shell: {},
  clipboard: {},
  nativeImage: {},
  ClipboardItem: class {},
}));

const {
  checkOutsideNotes,
  openOutsideNote,
  outsideAttachment,
  registerOutsideNoteIPC,
  writeOutsideNote,
} = await import("../../electron/outsideNotes");

const sent: [string, unknown][] = [];
registerOutsideNoteIPC(
  () => ({ webContents: { send: (ch: string, v: unknown) => sent.push([ch, v]) } }) as never,
);

let dir: string;
/** What the window was sent about `id`: this module's notes outlive one test. */
const about = (id: string) => sent.filter(([, v]) => (v as { id?: string })?.id === id);
beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "outside-")));
  sent.length = 0;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const file = (name: string) => path.join(dir, name);
const open = (name: string, text: string) => {
  fs.writeFileSync(file(name), text);
  const opened = openOutsideNote(file(name));
  if (!opened.note) throw new Error(`not opened: ${JSON.stringify(opened)}`);
  return opened.note;
};

describe("outside notes", () => {
  it("opens a file once by its real path, its folder carried as `outside`", () => {
    const note = open("Loose.md", "Words.\n");
    expect(note).toMatchObject({ title: "Loose", folder: null, outside: dir });
    const link = path.join(dir, "Link.md");
    fs.symlinkSync(file("Loose.md"), link);
    expect(openOutsideNote(link)).toEqual({ id: note.id });
    expect(openOutsideNote(file("Gone.md"))).toEqual({ error: "missing" });
  });

  it("refuses a save over bytes it has not seen, and hands back the disk's version", () => {
    const note = open("Draft.md", "One.\n");
    fs.writeFileSync(file("Draft.md"), "Theirs.\n");
    const result = writeOutsideNote({ ...note, content: { ...note.content } });
    expect(result).toMatchObject({ stale: true, note: { id: note.id } });
    expect(fs.readFileSync(file("Draft.md"), "utf8")).toBe("Theirs.\n");
  });

  it("renames within its folder, taking a free name on a clash", () => {
    const note = open("Old.md", "Text.\n");
    fs.writeFileSync(file("Taken.md"), "Other.\n");
    const result = writeOutsideNote({ ...note, title: "Taken" });
    expect(result).toMatchObject({ title: "Taken-2" });
    expect(fs.readdirSync(dir).sort()).toEqual(["Taken-2.md", "Taken.md"]);
    expect(fs.readFileSync(file("Taken-2.md"), "utf8")).toBe("Text.\n");
  });

  it("writes a copy only into a folder it has open", () => {
    const note = open("A.md", "A.\n");
    const copy = { ...note, id: "copy-1", title: "A (conflicted copy)" };
    expect(writeOutsideNote(copy)).toMatchObject({ title: "A (conflicted copy)" });
    expect(() => writeOutsideNote({ ...copy, id: "copy-2", outside: os.tmpdir() })).toThrow();
  });

  it("finds an edit made elsewhere when asked, but not its own save", () => {
    const note = open("Watched.md", "Before.\n");
    writeOutsideNote({ ...note, content: { title: "Watched", blocks: note.content.blocks } });
    checkOutsideNotes();
    expect(about(note.id)).toEqual([]);
    fs.writeFileSync(file("Watched.md"), "After.\n");
    checkOutsideNotes();
    expect(about(note.id)).toHaveLength(1);
    expect(about(note.id)[0][0]).toBe("file-changed");
    expect(about(note.id)[0][1]).toMatchObject({ id: note.id, title: "Watched" });
    checkOutsideNotes();
    expect(about(note.id)).toHaveLength(1);
  });

  it("follows a rename in its folder, and reports one gone", () => {
    const note = open("First.md", "Words.\n");
    fs.renameSync(file("First.md"), file("Second.md"));
    checkOutsideNotes();
    expect(about(note.id)).toEqual([
      ["file-moved", { id: note.id, title: "Second", folder: null }],
    ]);
    fs.rmSync(file("Second.md"));
    checkOutsideNotes();
    // Said once, however often the window comes back to the front.
    checkOutsideNotes();
    expect(about(note.id).slice(1)).toEqual([
      ["outside-note-gone", { id: note.id, title: "Second" }],
    ]);
  });

  it("serves a picture from inside an open note's folder only", () => {
    open("Pics.md", "Pics.\n");
    fs.mkdirSync(path.join(dir, "sub"));
    fs.writeFileSync(path.join(dir, "sub", "a.png"), "x");
    const secret = path.join(path.dirname(dir), `secret-${path.basename(dir)}.png`);
    fs.writeFileSync(secret, "x");
    fs.symlinkSync(secret, file("out.png"));
    try {
      expect(outsideAttachment(path.join(dir, "sub", "a.png"))).toBe(
        path.join(dir, "sub", "a.png"),
      );
      expect(outsideAttachment(path.join(dir, "..", path.basename(secret)))).toBeNull();
      expect(outsideAttachment(file("out.png"))).toBeNull();
    } finally {
      fs.rmSync(secret, { force: true });
    }
  });
});
