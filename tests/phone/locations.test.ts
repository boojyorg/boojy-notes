import { describe, expect, it } from "vitest";
import {
  MAIN,
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
      expect(await readLocations(root)).toEqual({ open: MAIN, list: [{ id: MAIN }] });
    }
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
