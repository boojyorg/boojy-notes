import { describe, expect, it } from "vitest";
import { createPhoneVault } from "../../src/phone/phoneVault";
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
