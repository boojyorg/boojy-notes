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
}));

const history = await import("../../electron/history");
const { readAllNotes, setIndexDir } = await import("../../electron/noteFileManager.js");

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
let now = Date.UTC(2026, 8, 26, 12);
let root: string;
let notesDir: string;

const list = (id: string) => history.listVersions(id).versions;
const texts = (id: string) => list(id).map((v) => history.readVersion(id, v.id));
const labels = (id: string) => list(id).map((v) => v.name || v.reason || v.kind);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-history-"));
  notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-history-vault-"));
  now = Date.UTC(2026, 8, 26, 12);
  history.setHistoryRoot(root);
  history.setClock(() => now);
  history.openVault(notesDir);
});

afterEach(() => {
  history.endAllSessions();
  history.setHistoryRoot(null);
  history.setClock(null);
  setIndexDir(null);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(notesDir, { recursive: true, force: true });
});

describe("sessions", () => {
  it("keeps a note's text from before its first edit, then an Autosave when the session ends", () => {
    history.observe("n1", "original");
    history.recordWrite("n1", "original, edited");
    now += 5 * MIN;
    history.recordWrite("n1", "original, edited more");
    history.endSession("n1");
    expect(texts("n1")).toEqual(["original, edited more", "original"]);
    expect(list("n1").map((v) => v.kind)).toEqual(["auto", "auto"]);
  });

  it("replaces the last session's Autosave within the hour, and not after", () => {
    history.observe("n1", "a");
    history.recordWrite("n1", "ab");
    history.endSession("n1");
    now += 20 * MIN;
    history.recordWrite("n1", "abc");
    history.endSession("n1");
    expect(texts("n1")).toEqual(["abc", "a"]);
    now += 2 * 60 * MIN;
    history.recordWrite("n1", "abcd");
    history.endSession("n1");
    expect(texts("n1")).toEqual(["abcd", "abc", "a"]);
  });

  it("makes nothing when a session changed nothing", () => {
    history.observe("n1", "same");
    history.recordWrite("n1", "same");
    history.endSession("n1");
    expect(list("n1")).toEqual([]);
  });
});

describe("safety saves", () => {
  it("keeps the text before a large delete", () => {
    const long = `Keep this. ${"A paragraph that goes. ".repeat(12)}End.`;
    history.observe("n1", long);
    history.recordWrite("n1", `${long} More.`);
    history.recordWrite("n1", "Keep this. End.");
    expect(labels("n1")[0]).toBe("Before a large delete");
    expect(texts("n1")[0]).toBe(`${long} More.`);
  });

  it("keeps the text an outside change replaces", () => {
    history.observe("n1", "mine");
    history.recordWrite("n1", "mine, typed");
    history.observe("n1", "theirs, from Dropbox");
    expect(labels("n1")[0]).toBe("Before an outside change");
    expect(texts("n1")[0]).toBe("mine, typed");
  });

  it("marks before Replace All with the text the file holds", () => {
    history.observe("n1", "cat cat cat");
    history.mark("n1", "Before Replace All");
    expect(labels("n1")).toEqual(["Before Replace All"]);
  });
});

describe("large delete", () => {
  it("is a stretch of text taken out, not one replaced", () => {
    const para = "x".repeat(300);
    expect(history.isLargeDelete(`a${para}b`, "ab")).toBe(true);
    expect(history.isLargeDelete(`a${para}b`, `a${"y".repeat(300)}b`)).toBe(false);
    expect(history.isLargeDelete("hello world", "hello")).toBe(false);
    expect(history.isLargeDelete("a".repeat(90), "a".repeat(55))).toBe(true);
  });
});

describe("save points", () => {
  it("keeps the note as a save point, and says so when nothing changed since", () => {
    history.observe("n1", "draft");
    history.recordWrite("n1", "draft two");
    const first = history.savePoint("n1");
    expect(first.ok).toBe(true);
    expect(history.savePoint("n1")).toMatchObject({ ok: false, reason: "nothing" });
    expect(list("n1")[0]).toMatchObject({ kind: "point" });
  });

  it("names a save point, and naming an Autosave makes it the user's", () => {
    history.observe("n1", "v1");
    history.recordWrite("n1", "v2");
    history.endSession("n1");
    const auto = list("n1")[0];
    history.nameVersion("n1", auto.id, "Before tutor meeting");
    expect(list("n1")[0]).toMatchObject({ kind: "point", name: "Before tutor meeting" });
  });

  it("keeps nothing new while history is off, and deletes what was when asked", () => {
    history.observe("n1", "private");
    history.recordWrite("n1", "private, edited");
    history.endSession("n1");
    history.setOff("n1", true, true);
    expect(history.savePoint("n1")).toMatchObject({ ok: false, reason: "off" });
    expect(list("n1")).toHaveLength(2);
    history.setOff("n1", true, false);
    expect(list("n1")).toEqual([]);
    const objects = path.join(root, fs.readdirSync(root)[0], "objects");
    const left = fs.existsSync(objects)
      ? fs.readdirSync(objects).flatMap((d) => fs.readdirSync(path.join(objects, d)))
      : [];
    expect(left).toEqual([]);
  });

  it("survives a restart, text and all", () => {
    history.observe("n1", "before");
    history.recordWrite("n1", "after");
    const point = history.savePoint("n1");
    history.openVault(notesDir);
    expect(history.listVersions("n1").versions[0].id).toBe(point.ok ? point.id : "");
    expect(texts("n1")[0]).toBe("after");
  });
});

describe("retention", () => {
  it("thins Autosaves over a month old to the day's last, and keeps every save point", () => {
    const at = (d: number, h: number) => Date.UTC(2026, 7, d, h);
    const v = (id: string, t: number, kind: "auto" | "point") => ({ id, at: t, kind, hash: id });
    const thinned = history.thin(
      [
        v("a", at(1, 9), "auto"),
        v("b", at(1, 15), "auto"),
        v("c", at(1, 16), "point"),
        v("d", now - DAY, "auto"),
      ],
      now,
    );
    expect(thinned.map((x) => x.id)).toEqual(["b", "c", "d"]);
  });

  it("keeps a deleted note's last text for 30 days, then lets it go", () => {
    history.observe("n1", "untouched note");
    history.noteDeleted("n1");
    expect(texts("n1")).toEqual(["untouched note"]);
    now += 31 * DAY;
    history.openVault(notesDir);
    expect(list("n1")).toEqual([]);
  });
});

describe("identity", () => {
  it("follows a note renamed while the app was closed", () => {
    const indexDir = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-history-index-"));
    setIndexDir(indexDir);
    fs.writeFileSync(path.join(notesDir, "Old name.md"), "Some text\n");
    const [id] = Object.keys(readAllNotes(notesDir));
    history.recordWrite(id, "Some text, edited\n");
    fs.writeFileSync(path.join(notesDir, "Old name.md"), "Some text, edited\n");
    history.savePoint(id);
    history.endAllSessions();

    fs.renameSync(path.join(notesDir, "Old name.md"), path.join(notesDir, "New name.md"));
    const notes = readAllNotes(notesDir);
    expect(Object.keys(notes)).toEqual([id]);
    expect(notes[id].title).toBe("New name");
    expect(list(id).length).toBeGreaterThan(0);
    fs.rmSync(indexDir, { recursive: true, force: true });
  });
});
