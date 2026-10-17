import { describe, expect, it, vi } from "vitest";
import { settleFolder } from "../../src/phone/folderSwitch";
import { createPhoneVault } from "../../src/phone/phoneVault";
import { syncPass } from "../../src/sync/engine";
import { FakeDropbox } from "../sync/fakes";
import { memoryFiles } from "./memoryFiles";

const T0 = Date.UTC(2026, 9, 17, 16);
const ARCHIVE = `old-folders/test ${T0}`;
const bytes = (text: string) => new TextEncoder().encode(text);
const textOf = (files: ReturnType<typeof memoryFiles>, path: string) => {
  const v = files.store.get(path);
  return v && v !== "dir" ? new TextDecoder().decode(v) : null;
};
const jsonOf = (files: ReturnType<typeof memoryFiles>, path: string) =>
  JSON.parse(textOf(files, path) ?? "null");
const filesUnder = (files: ReturnType<typeof memoryFiles>, dir: string) =>
  [...files.store]
    .filter(([p, v]) => v !== "dir" && (dir === "" || p.startsWith(`${dir}/`)))
    .map(([p]) => p)
    .sort();

/** A phone that has synced `test` (before it remembered which folder), with a note unsent. */
async function syncedTest(files = memoryFiles()) {
  for (const [path, text] of Object.entries({
    "vault/Penne.md": "pasta",
    "vault/Unsent.md": "typed offline",
    "deleted/2026-10-16T120000/Old.md": "binned",
    "state/ids.json": "{}",
    "state/deleted.json": "{}",
    "state/restored.json": "[]",
    "state/sync-record.json": '{"version":1}',
    "state/dropbox.json": '{"refreshToken":"r","accountId":"dbid:A"}',
  })) {
    await files.write(path, bytes(text));
  }
  return files;
}

const OLD_COPY = [
  "deleted/2026-10-16T120000/Old.md",
  "state/deleted.json",
  "state/ids.json",
  "state/restored.json",
  "state/sync-record.json",
  "vault/Penne.md",
  "vault/Unsent.md",
];

const settle = (files: ReturnType<typeof memoryFiles>, folder = "Personal", accountId = "dbid:A") =>
  settleFolder(files, { folder, accountId, now: () => T0 });

describe("switching the folder the phone syncs", () => {
  it("sets the old folder's copy aside whole, keeping the sign-in", async () => {
    const files = await syncedTest();
    await settle(files);
    expect(filesUnder(files, ARCHIVE)).toEqual(OLD_COPY.map((p) => `${ARCHIVE}/${p}`));
    expect(textOf(files, `${ARCHIVE}/vault/Unsent.md`)).toBe("typed offline");
    expect(filesUnder(files, "vault")).toEqual([]);
    expect(filesUnder(files, "deleted")).toEqual([]);
    expect(filesUnder(files, "state")).toEqual(["state/binding.json", "state/dropbox.json"]);
    expect(jsonOf(files, "state/binding.json")).toEqual({
      folder: "Personal",
      accountId: "dbid:A",
    });
  });

  it("changes nothing for the folder it already holds", async () => {
    const files = await syncedTest();
    await settle(files, "test");
    expect(jsonOf(files, "state/binding.json")).toEqual({ folder: "test", accountId: "dbid:A" });
    const before = filesUnder(files, "");
    await settle(files, "test");
    expect(filesUnder(files, "")).toEqual(before);
    expect(textOf(files, "vault/Penne.md")).toBe("pasta");
  });

  it("never sets aside the new folder's notes on a later start", async () => {
    const files = await syncedTest();
    await settle(files);
    await files.write("vault/Real.md", bytes("downloaded"));
    await files.write("state/sync-record.json", bytes('{"version":1,"real":true}'));
    await settle(files);
    await settle(files);
    expect(textOf(files, "vault/Real.md")).toBe("downloaded");
    expect(jsonOf(files, "state/sync-record.json")).toEqual({ version: 1, real: true });
    expect(filesUnder(files, "old-folders")).toHaveLength(OLD_COPY.length);
  });

  // Killed after each of the moves in turn: the next start finishes the switch,
  // the copy is bound to the new folder only then, and nothing is lost or doubled.
  it.each([
    "vault",
    "deleted",
    "state/ids.json",
    "state/deleted.json",
    "state/restored.json",
    "state/sync-record.json",
  ])("finishes a switch killed at moving %s", async (killedAt) => {
    const files = await syncedTest(
      memoryFiles({ failOn: (op, path) => op === "rename" && path === killedAt }),
    );
    await expect(settle(files)).rejects.toThrow(`killed at rename ${killedAt}`);
    expect(jsonOf(files, "state/binding.json")).toBeNull();
    // Started again, more than once, a moment later.
    await settleFolder(files, { folder: "Personal", accountId: "dbid:A", now: () => T0 + 5000 });
    await settle(files);
    expect(filesUnder(files, ARCHIVE)).toEqual(OLD_COPY.map((p) => `${ARCHIVE}/${p}`));
    expect(filesUnder(files, "vault")).toEqual([]);
    expect(jsonOf(files, "state/binding.json")).toEqual({
      folder: "Personal",
      accountId: "dbid:A",
    });
    expect(files.store.has("state/switch.json")).toBe(false);
  });

  it("finishes a switch killed before it was bound", async () => {
    const files = await syncedTest(
      memoryFiles({ failOn: (op, path) => op === "write" && path === "state/binding.json" }),
    );
    await expect(settle(files)).rejects.toThrow();
    await settle(files);
    expect(jsonOf(files, "state/binding.json")).toEqual({
      folder: "Personal",
      accountId: "dbid:A",
    });
    expect(filesUnder(files, ARCHIVE)).toHaveLength(OLD_COPY.length);
  });

  it("sets a source aside beside a copy already in the archive, deleting neither", async () => {
    const files = await syncedTest();
    await files.write(
      "state/switch.json",
      bytes(JSON.stringify({ from: "test", to: "Personal", into: ARCHIVE })),
    );
    await files.write(`${ARCHIVE}/state/ids.json`, bytes("copied"));
    await settle(files);
    expect(textOf(files, `${ARCHIVE}/state/ids.json`)).toBe("copied");
    expect(textOf(files, `${ARCHIVE}/state/ids.json (2)`)).toBe("{}");
    expect(files.store.has("state/ids.json")).toBe(false);
  });

  it("sets aside a copy that belonged to another account", async () => {
    const files = await syncedTest();
    await settle(files, "test", "dbid:A");
    await settle(files, "test", "dbid:B");
    expect(filesUnder(files, "vault")).toEqual([]);
    expect(textOf(files, `${ARCHIVE}/vault/Penne.md`)).toBe("pasta");
    expect(jsonOf(files, "state/binding.json")).toEqual({ folder: "test", accountId: "dbid:B" });
  });
});

describe("the new folder's first sync", () => {
  it("downloads the new folder and sends it none of the old one", async () => {
    const files = memoryFiles();
    const open = () => createPhoneVault(files, { onLocalChange: vi.fn() });
    // The phone syncs `test`, and one note stays unsent (offline).
    const test = new FakeDropbox();
    await test.macWrite("Penne.md", "pasta");
    await syncPass({ local: open().store, remote: test });
    await files.write("vault/Unsent.md", bytes("typed offline"));

    const personal = new FakeDropbox();
    await personal.macWrite("Real.md", "my real note");
    await settle(files);
    for (let i = 0; i < 3; i++) await syncPass({ local: open().store, remote: personal });
    expect(personal.paths()).toEqual(["Real.md"]);
    expect(filesUnder(files, "vault")).toEqual(["vault/Real.md"]);
    expect(textOf(files, `${ARCHIVE}/vault/Unsent.md`)).toBe("typed offline");

    // Offline, started again: the real note is still there, and nothing moves.
    await settle(files);
    const notes = Object.values(await open().api.readAllNotes());
    expect(notes.map((n) => n.title)).toEqual(["Real"]);
    expect(textOf(files, "vault/Real.md")).toBe("my real note");
    expect(filesUnder(files, "old-folders")).toContain(`${ARCHIVE}/vault/Penne.md`);
  });
});
