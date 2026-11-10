import { describe, expect, it } from "vitest";
import { FolderLost } from "../../src/phone/folderFiles";
import { createPhoneVault } from "../../src/phone/phoneVault";
import { contentHash } from "../../src/sync/contentHash";
import type { Note } from "../../src/types/notes";
import { markdownToBlocks } from "../../src/utils/markdown";
import { routedMemory } from "./folderMemory";
import { memoryFiles } from "./memoryFiles";

const note = (id: string, title: string, text: string, folder: string | null = null): Note => ({
  id,
  title,
  folder,
  content: { title, blocks: markdownToBlocks(text) },
});
const bytes = (text: string) => new TextEncoder().encode(text);
const open = () => {
  const files = routedMemory(memoryFiles)();
  return { files, fake: files.fake, vault: createPhoneVault(files) };
};

/**
 * A call to Android per file is about 30 ms in a picked folder: 500 notes
 * read one at a time took a quarter of a minute on a Pixel 8a.
 */
describe("the vault in a picked folder", () => {
  it("reads every note at start in two calls, however many notes and folders", async () => {
    const { fake, vault } = open();
    for (let i = 0; i < 60; i++) fake.outside.put(`f${i % 12}/Note ${i}.md`, bytes(`text ${i}`));
    fake.calls.length = 0;
    const notes = Object.values(await vault.api.readAllNotes());
    expect(notes).toHaveLength(60);
    expect(notes.find((n) => n.title === "Note 7")).toMatchObject({ folder: "f7" });
    expect(fake.calls.filter((c) => c !== "list")).toEqual(["walk", "readMany 60"]);
    expect(fake.calls.filter((c) => c === "list").length).toBeLessThanOrEqual(1);
  });

  it("hashes what changed for a sync pass in one read, and nothing when nothing changed", async () => {
    const { fake, vault } = open();
    for (let i = 0; i < 30; i++) fake.outside.put(`Note ${i}.md`, bytes(`text ${i}`));
    const pass = async () => {
      fake.calls.length = 0;
      const { files } = await vault.store.list();
      for (const f of files) await vault.store.hash?.(f);
      return fake.calls.filter((c) => c.startsWith("readMany"));
    };
    expect(await pass()).toEqual(["readMany 30"]);
    expect(await pass()).toEqual([]);
    fake.outside.put("Note 3.md", bytes("changed by another app"));
    expect(await pass()).toEqual(["readMany 1"]);
  });

  it("saves, renames by capitals alone, deletes and restores a note, each seen in the folder", async () => {
    const { fake, vault } = open();
    await vault.api.writeNote(note("n1", "shopping", "eggs", "Home"));
    expect([...fake.snapshot().keys()].sort()).toEqual(["Home", "Home/shopping.md"]);
    await vault.api.readAllNotes();
    expect(await vault.api.writeNote(note("n1", "Shopping", "eggs", "Home"))).toEqual({
      title: "Shopping",
    });
    expect([...fake.snapshot().keys()].sort()).toEqual(["Home", "Home/Shopping.md"]);
    await vault.api.trashNote("n1");
    expect([...fake.snapshot().keys()]).toEqual(["Home"]);
    expect(await vault.api.restoreDeletedNote("n1")).toMatchObject({ id: "n1", title: "Shopping" });
    expect(fake.snapshot().has("Home/Shopping.md")).toBe(true);
  });
});

/**
 * A picked folder is other apps' too (a file manager, a sync tool), and
 * Android sends no word of their changes: the vault looks.
 */
describe("what another app changes in the folder", () => {
  const watched = async (seed: Record<string, string> = {}) => {
    const o = open();
    for (const [path, text] of Object.entries(seed)) o.fake.outside.put(path, bytes(text));
    const notes = Object.values(await o.vault.api.readAllNotes());
    const events: string[] = [];
    o.vault.api.onFileChanged((n) => events.push(`changed ${n.id} ${n.title}`));
    o.vault.api.onFileMoved((n) => events.push(`moved ${n.id} ${n.folder ?? ""}/${n.title}`));
    o.vault.api.onFileDeleted(() => events.push("deleted"));
    o.vault.api.onFoldersChanged(() => events.push("folders"));
    const idOf = (title: string) => notes.find((n) => n.title === title)?.id as string;
    return { ...o, events, idOf };
  };
  const textOf = (n: Note | undefined) => n?.content.blocks.map((b) => b.text).join("\n");

  it("reaches the editor: a note edited, one added, one removed", async () => {
    const { fake, vault, events, idOf } = await watched({ "A.md": "one", "B.md": "two" });
    fake.outside.put("A.md", bytes("one, edited elsewhere"));
    fake.outside.put("C.md", bytes("three"));
    fake.outside.remove("B.md");
    await vault.checkOutside();
    expect(events).toContain(`changed ${idOf("A")} A`);
    expect(events.some((e) => /^changed \S+ C$/.test(e))).toBe(true);
    expect(events).toContain("deleted");
    const after = await vault.api.readAllNotes();
    expect(
      Object.values(after)
        .map((n) => n.title)
        .sort(),
    ).toEqual(["A", "C"]);
    expect(textOf(after[idOf("A")])).toBe("one, edited elsewhere");
  });

  it("says nothing when nothing changed, and reads no file to know it", async () => {
    const { fake, vault, events } = await watched({ "A.md": "one", "B.md": "two" });
    fake.calls.length = 0;
    await vault.checkOutside();
    expect(events).toEqual([]);
    expect(fake.calls.filter((c) => c.startsWith("readMany"))).toEqual([]);
  });

  it("never takes the app's own save for another app's", async () => {
    const { vault, events, idOf } = await watched({ "A.md": "one" });
    await vault.api.writeNote(note(idOf("A"), "A", "typed here"));
    await vault.checkOutside({ thorough: true });
    expect(events).toEqual([]);
  });

  it("follows a note renamed or moved elsewhere: the same note, not a new one", async () => {
    const { fake, vault, events, idOf } = await watched({ "A.md": "one", "B.md": "two" });
    fake.outside.rename("A.md", "Trips/Alps.md");
    await vault.checkOutside();
    expect(events).toContain(`moved ${idOf("A")} Trips/Alps`);
    expect(events).not.toContain("deleted");
    // The next save lands at the new name, not beside it under the old one.
    await vault.api.writeNote(note(idOf("A"), "Alps", "one more", "Trips"));
    expect([...fake.snapshot().keys()].sort()).toEqual(["B.md", "Trips", "Trips/Alps.md"]);
  });

  // Two notes with one text: which went where can't be told, so neither is guessed.
  it("guesses no rename between notes that hold the same text", async () => {
    const { fake, vault, events } = await watched({ "A.md": "same", "B.md": "same" });
    fake.outside.rename("A.md", "C.md");
    fake.outside.rename("B.md", "D.md");
    await vault.checkOutside();
    expect(events.filter((e) => e.startsWith("moved"))).toEqual([]);
    expect(events.filter((e) => e.startsWith("changed"))).toHaveLength(2);
  });

  // As Syncthing leaves a file: new text, the old size and modified time.
  it("finds an edit that kept the file's size and time, on the thorough look only", async () => {
    const { fake, vault, events, idOf } = await watched({ "A.md": "cat", "B.md": "two" });
    fake.outside.put("A.md", bytes("dog"), { quiet: true });
    await vault.checkOutside();
    expect(events).toEqual([]);
    await vault.checkOutside({ thorough: true });
    expect(events).toEqual([`changed ${idOf("A")} A`]);
    // Sync is told too: the hash it kept for that stamp is the old text's.
    await vault.store.list();
    expect(await vault.store.hash?.("A.md")).toBe(await contentHash(bytes("dog")));
  });

  it("refuses a save waiting on a note changed elsewhere, so the editor keeps both", async () => {
    const { fake, vault, events, idOf } = await watched({ "A.md": "one" });
    fake.outside.put("A.md", bytes("theirs"));
    const save = vault.api.writeNote(note(idOf("A"), "A", "mine"));
    await vault.checkOutside();
    expect(await save).toMatchObject({ stale: true });
    expect(events).toEqual([]);
    expect(new TextDecoder().decode(fake.snapshot().get("A.md") as Uint8Array)).toBe("theirs");
  });

  it("refuses a save asked for before the look that took the other app's text", async () => {
    const { fake, vault, idOf } = await watched({ "A.md": "one" });
    fake.outside.put("A.md", bytes("theirs"));
    const look = vault.checkOutside();
    const save = vault.api.writeNote(note(idOf("A"), "A", "mine"));
    await look;
    expect(await save).toMatchObject({ stale: true });
  });

  it("lets a save through between the thorough look's batches", async () => {
    const seed: Record<string, string> = {};
    for (let i = 0; i < 250; i++) seed[`Note ${i}.md`] = `text ${i}`;
    const { fake, vault, idOf } = await watched(seed);
    fake.calls.length = 0;
    const look = vault.checkOutside({ thorough: true });
    const save = vault.api.writeNote(note(idOf("Note 7"), "Note 7", "typed meanwhile"));
    await Promise.all([look, save]);
    const reads = fake.calls.filter((c) => c.startsWith("readMany") || c === "write");
    expect(reads.indexOf("write")).toBeLessThan(reads.length - 1);
    expect(reads.filter((c) => c.startsWith("readMany")).length).toBeGreaterThan(1);
  });

  it("tells the editor of a folder made elsewhere", async () => {
    const { fake, vault, events } = await watched({ "A.md": "one" });
    fake.outside.put("Trips/.keep", bytes(""));
    await vault.checkOutside();
    expect(events).toEqual(["folders"]);
  });

  // Listed as empty, every note looked deleted: the editor emptied, and sync
  // would have deleted them all from Dropbox.
  it("takes a folder that is gone for an error, never for an empty one", async () => {
    const { fake, vault, events } = await watched({ "A.md": "one", "B.md": "two" });
    fake.outside.lose();
    await expect(vault.checkOutside()).rejects.toThrow(FolderLost);
    await expect(vault.store.list()).rejects.toThrow(FolderLost);
    await expect(vault.api.readAllNotes()).rejects.toThrow(FolderLost);
    expect(events).toEqual([]);
  });
});
