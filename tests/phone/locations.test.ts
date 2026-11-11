import { describe, expect, it } from "vitest";
import {
  liveRows,
  MAIN,
  removeLocationFiles,
  whereOf,
  nameProblem,
  newLocationId,
  prefixOf,
  readLocations,
  scopedFiles,
  writeLocations,
} from "../../src/phone/locations";
import { createPhoneVault } from "../../src/phone/phoneVault";
import type { Note } from "../../src/types/notes";
import { markdownToBlocks } from "../../src/utils/markdown";
import { memoryFiles } from "./memoryFiles";

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array | null) => (b ? new TextDecoder().decode(b) : null);
const LIST = "state/locations.json";

describe("the phone's storage locations", () => {
  // Every install before locations: its notes are the first one, where they always were.
  it("is the one the phone always had, at the paths it always used, until another is added", async () => {
    const root = memoryFiles();
    expect(await readLocations(root)).toEqual({ open: MAIN, list: [{ id: MAIN }] });
    expect(prefixOf(MAIN)).toBe("");
    expect(root.store.size).toBe(0);
  });

  it("keeps the list and which one is open", async () => {
    const root = memoryFiles();
    const kept = { open: "work", list: [{ id: MAIN }, { id: "work", name: "Work" }] };
    await writeLocations(root, kept);
    expect(await readLocations(root)).toEqual(kept);
    expect(prefixOf("work")).toBe("locations/work/");
  });

  it("opens the first when the open one is not in the list", async () => {
    const root = memoryFiles();
    await root.write(LIST, bytes(JSON.stringify({ open: "gone", list: [{ id: "a1" }] })));
    expect((await readLocations(root)).open).toBe("a1");
  });

  // A list that can't be read must never open nothing, or somewhere made up.
  it("reads a damaged list as the first location alone", async () => {
    for (const damaged of [
      "{",
      "null",
      JSON.stringify({ open: MAIN, list: [] }),
      JSON.stringify({ open: MAIN, list: "main" }),
    ]) {
      const root = memoryFiles();
      await root.write(LIST, bytes(damaged));
      expect(await readLocations(root)).toEqual({
        open: MAIN,
        list: [{ id: MAIN }],
        damaged: true,
      });
    }
  });

  // Opened that way and then written, the list would lose every other location for good.
  it("never writes back a list it could not read", async () => {
    const root = memoryFiles();
    await root.write(LIST, bytes("{"));
    const read = await readLocations(root);
    await expect(
      writeLocations(root, { ...read, list: [...read.list, { id: "new1" }] }),
    ).rejects.toThrow(/couldn't be read/);
    expect(text(await root.read(LIST))).toBe("{");
    // A read that fails is no proof there is no list either.
    const failing = { ...root, read: async () => Promise.reject(new Error("I/O")) };
    expect((await readLocations(failing)).damaged).toBe(true);
  });

  // An id becomes a path: nothing in it may leave the location's own area.
  it("drops an entry whose id could be a path, or is there twice", async () => {
    const root = memoryFiles();
    await root.write(
      LIST,
      bytes(
        JSON.stringify({
          open: "ok1",
          list: [{ id: "../state" }, { id: "a/b" }, { id: "" }, { id: "ok1" }, { id: "ok1" }, {}],
        }),
      ),
    );
    expect(await readLocations(root)).toEqual({ open: "ok1", list: [{ id: "ok1" }] });
    await expect(writeLocations(root, { open: "x/y", list: [{ id: "x/y" }] })).rejects.toThrow();
  });
});

describe("the rows as Home shows them", () => {
  const ROWS = [
    { id: MAIN, name: "Phone", named: false, open: true, dropbox: null, phone: "Documents/Notes" },
    { id: "w", name: "Work", named: true, open: false, dropbox: "Team", phone: null },
  ];

  // The list is read once; a connect made since must not wait for a restart to show.
  it("follows sync for the open one: where it is, and its name while it has none of its own", () => {
    expect(liveRows(ROWS, "Personal")[0]).toMatchObject({ name: "Personal", dropbox: "Personal" });
    expect(liveRows(ROWS, "")[0]).toMatchObject({ name: "Boojy Notes", dropbox: "" });
    expect(liveRows(ROWS, null)[0]).toMatchObject({ name: "Phone", dropbox: null });
    expect(liveRows(ROWS, "Personal")[1]).toBe(ROWS[1]);
    expect(liveRows(ROWS, undefined)).toBe(ROWS);
  });

  it("keeps a name the location was given, whatever it syncs with", () => {
    const named = [{ ...ROWS[0], name: "Journal", named: true }];
    expect(liveRows(named, "Personal")[0]).toMatchObject({ name: "Journal", dropbox: "Personal" });
  });

  // One line, as the desktop's row has: in Dropbox if it syncs, else on the phone.
  it("says where each one is in one line", () => {
    expect(whereOf(ROWS[0])).toBe("Documents/Notes");
    expect(whereOf(ROWS[1])).toBe("Dropbox/Apps/Boojy Notes/Team");
    expect(whereOf({ ...ROWS[1], dropbox: "" })).toBe("Dropbox/Apps/Boojy Notes");
    expect(whereOf({ ...ROWS[1], dropbox: null })).toBe("Inside the app");
  });
});

describe("a location removed", () => {
  const filled = async () => {
    const root = memoryFiles();
    for (const path of [
      "state/locations.json",
      "state/ids.json",
      "state/binding.json",
      "vault/Diary.md",
      "vault/Ideas/Plan.md",
      "deleted/1/Old.md",
      "locations/work/state/ids.json",
      "locations/work/vault/Work.md",
      "locations/other/state/ids.json",
    ]) {
      await root.write(path, bytes(path));
    }
    return root;
  };
  const left = (root: ReturnType<typeof memoryFiles>) =>
    [...root.store.entries()]
      .filter(([, v]) => v !== "dir")
      .map(([path]) => path)
      .sort();

  it("loses its own area of the storage, and nothing of any other's", async () => {
    const root = await filled();
    await removeLocationFiles(root, "work");
    expect(left(root)).toEqual([
      "deleted/1/Old.md",
      "locations/other/state/ids.json",
      "state/binding.json",
      "state/ids.json",
      "state/locations.json",
      "vault/Diary.md",
      "vault/Ideas/Plan.md",
    ]);
  });

  // The first one's files are the storage's own top level, where the list is kept too.
  it("as the first location, loses everything at the top but the list and the other locations", async () => {
    const root = await filled();
    await removeLocationFiles(root, MAIN);
    expect(left(root)).toEqual([
      "locations/other/state/ids.json",
      "locations/work/state/ids.json",
      "locations/work/vault/Work.md",
      "state/locations.json",
    ]);
  });
});

describe("a new location", () => {
  it("gets an id that can be part of a path, never the first location's, never twice", () => {
    const ids = Array.from({ length: 50 }, newLocationId);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+$/);
    expect(ids).not.toContain(MAIN);
    expect(new Set(ids).size).toBe(50);
  });

  it("needs a name, and one no other location shows", () => {
    expect(nameProblem("  ", ["Phone"])).toBe("Give it a name.");
    expect(nameProblem(" phone ", ["Phone"])).toBe("Another location has this name.");
    expect(nameProblem("Work", ["Phone"])).toBeNull();
  });
});

describe("a location's own area of the phone's storage", () => {
  it("keeps everything it writes under its prefix, and sees nothing outside it", async () => {
    const root = memoryFiles();
    await root.write("state/ids.json", bytes("main's"));
    await root.write("vault/Note.md", bytes("main's note"));
    const work = scopedFiles(root, prefixOf("work"));
    expect(await work.read("state/ids.json")).toBeNull();
    expect(await work.list("vault")).toEqual([]);
    await work.write("state/ids.json", bytes("work's"));
    await work.write("vault/Plan.md", bytes("work's note"));
    expect(text(await root.read("locations/work/state/ids.json"))).toBe("work's");
    expect(text(await root.read("state/ids.json"))).toBe("main's");
    expect((await work.list("vault")).map((e) => e.name)).toEqual(["Plan.md"]);
    expect((await root.list("vault")).map((e) => e.name)).toEqual(["Note.md"]);
  });

  it("answers every file call as the storage under it would", async () => {
    const root = memoryFiles();
    const work = scopedFiles(root, prefixOf("work"));
    await work.mkdir("vault/Ideas");
    await work.write("vault/A.md", bytes("a"));
    await work.rename("vault/A.md", "vault/Ideas/B.md");
    expect(await work.exists("vault/A.md")).toBe(false);
    expect(await work.exists("vault/Ideas/B.md")).toBe(true);
    expect(await work.mtime("vault/Ideas/B.md")).toBeTypeOf("number");
    await work.remove("vault/Ideas/B.md");
    await work.rmdir("vault/Ideas");
    expect(await work.exists("vault/Ideas")).toBe(false);
    expect(work.walk).toBeUndefined();
  });

  // A save the app died in is finished inside the location, not in the first one's files.
  it("finishes a write cut short inside the location only", async () => {
    const root = memoryFiles();
    await root.write("locations/work/state/.~ids.json.bak", bytes("old"));
    await root.write("state/.~ids.json.bak", bytes("main's old"));
    await scopedFiles(root, prefixOf("work")).recover("state");
    expect(text(await root.read("locations/work/state/ids.json"))).toBe("old");
    expect(await root.exists("state/ids.json")).toBe(false);
  });
});

// The vault and sync are handed a location's files and never know which one they are.
describe("two locations on one phone", () => {
  const note = (id: string, title: string, body: string): Note => ({
    id,
    title,
    folder: null,
    content: { title, blocks: markdownToBlocks(body) },
  });
  const vaultOf = (root: ReturnType<typeof memoryFiles>, id: string) =>
    createPhoneVault(scopedFiles(root, prefixOf(id)), { onLocalChange: () => {} });
  const titles = async (vault: ReturnType<typeof createPhoneVault>) =>
    Object.values(await vault.api.readAllNotes())
      .map((n) => n.title)
      .sort();

  it("keep their notes, their bins and their sync records apart", async () => {
    const root = memoryFiles();
    const main = vaultOf(root, MAIN);
    const work = vaultOf(root, "work");
    await main.api.writeNote(note("m1", "Diary", "mine"));
    await work.api.writeNote(note("w1", "Plan", "work's"));
    await work.api.writeNote(note("w2", "Old", "to bin"));
    expect(await titles(main)).toEqual(["Diary"]);
    expect(await titles(work)).toEqual(["Old", "Plan"]);
    expect(text(await root.read("vault/Diary.md"))).toBe("mine");
    expect(text(await root.read("locations/work/vault/Plan.md"))).toBe("work's");

    await work.api.trashNote("w2");
    expect((await work.api.listDeletedNotes()).map((n) => n.name)).toEqual(["Old"]);
    expect(await main.api.listDeletedNotes()).toEqual([]);

    await work.store.saveRecord("work's record");
    expect(await work.store.loadRecord()).toBe("work's record");
    expect(await main.store.loadRecord()).toBeNull();
    // A start in either one reads only its own.
    expect(await titles(vaultOf(root, MAIN))).toEqual(["Diary"]);
    expect(await titles(vaultOf(root, "work"))).toEqual(["Plan"]);
  });
});
