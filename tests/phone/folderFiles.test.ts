import { describe, expect, it } from "vitest";
import { folderFiles, folderAddress, JOURNAL } from "../../src/phone/folderFiles";
import { fakeFolderAccess } from "./folderMemory";
import { memoryFiles } from "./memoryFiles";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (b: Uint8Array | "dir" | null | undefined) =>
  b && b !== "dir" ? new TextDecoder().decode(b) : null;
const PICKED = { tree: "tree", root: "root" };

function setup(failOn?: (op: string, name: string) => boolean) {
  const fake = fakeFolderAccess({ failOn });
  const journal = memoryFiles();
  const open = () => folderFiles(PICKED, journal, fake.plugin);
  const journalled = () => [...journal.store.keys()].filter((p) => p.startsWith(`${JOURNAL}/`));
  return { fake, journal, files: open(), restart: open, journalled };
}

describe("a note saved to a picked folder", () => {
  it("is the file alone: nothing temporary beside it for another app to see", async () => {
    const { files, fake, journalled } = setup();
    await files.write("Recipes/Penne.md", bytes("boil"));
    await files.write("Recipes/Penne.md", bytes("boil, then salt"));
    expect([...fake.snapshot().keys()].sort()).toEqual(["Recipes", "Recipes/Penne.md"]);
    expect(text(await files.read("Recipes/Penne.md"))).toBe("boil, then salt");
    expect(journalled()).toEqual([]);
  });

  // Android cuts a file short when a write in place dies: the folder has no
  // rename over a file to make a save whole.
  it("killed part-way through the file, holds the whole new text after the next start", async () => {
    let armed = false;
    const { files, fake, restart, journalled } = setup((op) => armed && op === "write");
    await files.write("Note.md", bytes("the first version, whole"));
    armed = true;
    await expect(files.write("Note.md", bytes("the second version, whole"))).rejects.toThrow(
      /killed/,
    );
    expect(text(fake.snapshot().get("Note.md"))).toBe("the second v");
    const next = restart();
    await next.recover("");
    expect(text(await next.read("Note.md"))).toBe("the second version, whole");
    expect(journalled()).toEqual([]);
  });

  it("killed while a new note's file was being made, has the note after the next start", async () => {
    const { files, restart } = setup((op, name) => op === "create" && name === "New.md");
    await expect(files.write("New.md", bytes("first words"))).rejects.toThrow(/killed/);
    const next = restart();
    await next.recover("");
    expect(text(await next.read("New.md"))).toBe("first words");
  });

  it("killed before the folder was touched, keeps the old text whole", async () => {
    const fake = fakeFolderAccess();
    let armed = false;
    const journal = memoryFiles({
      failOn: (op, p) => armed && op === "write" && p.startsWith(JOURNAL),
    });
    const files = folderFiles(PICKED, journal, fake.plugin);
    await files.write("Note.md", bytes("old"));
    armed = true;
    await expect(files.write("Note.md", bytes("new"))).rejects.toThrow(/killed/);
    const next = folderFiles(PICKED, journal, fake.plugin);
    await next.recover("");
    expect(text(await next.read("Note.md"))).toBe("old");
  });

  it("killed after the file was written, is not written a second time over a later save", async () => {
    const fake = fakeFolderAccess();
    let armed = false;
    const journal = memoryFiles({
      failOn: (op, p) => armed && op === "remove" && p.startsWith(JOURNAL),
    });
    const files = folderFiles(PICKED, journal, fake.plugin);
    armed = true;
    await expect(files.write("Note.md", bytes("saved"))).rejects.toThrow(/killed/);
    const next = folderFiles(PICKED, journal, fake.plugin);
    await next.recover("");
    await next.write("Note.md", bytes("saved again, later"));
    await folderFiles(PICKED, journal, fake.plugin).recover("");
    expect(text(fake.snapshot().get("Note.md"))).toBe("saved again, later");
  });
});

describe("a name that is taken", () => {
  // Android never refuses: it makes `b (1).md`, and the note would be saved
  // under a name nobody asked for.
  it("fails a rename and leaves both files as they were", async () => {
    const { files, fake } = setup();
    await files.write("a.md", bytes("a"));
    await files.write("b.md", bytes("b"));
    await expect(files.rename("a.md", "b.md")).rejects.toThrow(/already exists/);
    fake.outside.put("c.md", bytes("made by another app"));
    await expect(files.rename("a.md", "c.md")).rejects.toThrow(/already exists/);
    expect([...fake.snapshot().keys()].sort()).toEqual(["a.md", "b.md", "c.md"]);
    expect(text(await files.read("a.md"))).toBe("a");
  });

  it("fails a new note whose name another app took meanwhile, and never writes over that file", async () => {
    const { files, fake, restart, journalled } = setup();
    await files.list("");
    fake.outside.put("Plan.md", bytes("theirs"));
    await expect(files.write("Plan.md", bytes("ours"))).rejects.toThrow(/already exists/);
    expect(journalled()).toEqual([]);
    await restart().recover("");
    expect([...fake.snapshot().keys()]).toEqual(["Plan.md"]);
    expect(text(fake.snapshot().get("Plan.md"))).toBe("theirs");
  });

  it("is found whatever its capitals, as the phone's storage finds it", async () => {
    const { files, fake } = setup();
    await files.write("Shopping.md", bytes("eggs"));
    expect(await files.exists("shopping.md")).toBe(true);
    await files.write("shopping.md", bytes("eggs, milk"));
    expect([...fake.snapshot().keys()]).toEqual(["Shopping.md"]);
    expect(text(fake.snapshot().get("Shopping.md"))).toBe("eggs, milk");
  });
});

describe("a rename that changes only the capitals", () => {
  it("gives the file the new spelling", async () => {
    const { files, fake, journalled } = setup();
    await files.write("ideas/note.md", bytes("n"));
    await files.rename("ideas/note.md", "ideas/Note.md");
    expect([...fake.snapshot().keys()].sort()).toEqual(["ideas", "ideas/Note.md"]);
    expect(text(await files.read("ideas/Note.md"))).toBe("n");
    expect(journalled()).toEqual([]);
  });

  it("killed between its two steps, is finished by the next start: the note is never left hidden", async () => {
    let renames = 0;
    const { files, fake, restart } = setup((op) => op === "rename" && ++renames === 2);
    await files.write("note.md", bytes("n"));
    await expect(files.rename("note.md", "Note.md")).rejects.toThrow(/killed/);
    expect([...fake.snapshot().keys()]).toEqual([".~Note.md.case"]);
    const next = restart();
    await next.recover("");
    expect([...fake.snapshot().keys()]).toEqual(["Note.md"]);
  });
});

describe("folders and moves", () => {
  it("moves a note to another folder, made on the way, under a new name", async () => {
    const { files, fake } = setup();
    await files.write("Inbox/Draft.md", bytes("d"));
    await files.rename("Inbox/Draft.md", "Work/2026/Plan.md");
    expect([...fake.snapshot().keys()].sort()).toEqual([
      "Inbox",
      "Work",
      "Work/2026",
      "Work/2026/Plan.md",
    ]);
    expect(text(await files.read("Work/2026/Plan.md"))).toBe("d");
  });

  // Android removes a folder with everything in it.
  it("refuses to remove a folder that holds anything, even a file another app just put there", async () => {
    const { files, fake } = setup();
    await files.mkdir("Empty");
    await files.list("Empty");
    fake.outside.put("Empty/surprise.md", bytes("s"));
    await expect(files.rmdir("Empty")).rejects.toThrow(/not empty/);
    expect(fake.snapshot().has("Empty/surprise.md")).toBe(true);
    fake.outside.remove("Empty/surprise.md");
    await files.rmdir("Empty");
    expect(fake.snapshot().has("Empty")).toBe(false);
  });

  it("answers a file another app removed as missing, not as an error", async () => {
    const { files, fake } = setup();
    await files.write("Gone.md", bytes("g"));
    fake.outside.remove("Gone.md");
    expect(await files.read("Gone.md")).toBeNull();
    expect(await files.exists("Gone.md")).toBe(false);
    expect(await files.list("No such folder")).toEqual([]);
  });
});

describe("reading the whole folder", () => {
  it("is one call for every listing and one for every file, whatever the number of folders", async () => {
    const { fake, restart } = setup();
    for (let i = 0; i < 40; i++) fake.outside.put(`f${i % 8}/sub/Note ${i}.md`, bytes(`note ${i}`));
    fake.outside.put(".obsidian/workspace.json", bytes("{}"));
    fake.outside.put("f0/.hidden.md", bytes("h"));
    const files = restart();
    fake.calls.length = 0;
    const entries = (await files.walk?.("")) ?? [];
    const notes = entries.filter((e) => e.kind === "file").map((e) => e.path);
    expect(notes).toHaveLength(40);
    expect(entries.some((e) => e.path.includes(".obsidian") || e.path.includes(".hidden"))).toBe(
      false,
    );
    const read = (await files.readMany?.(notes)) ?? [];
    expect(read.map(text)).toEqual(notes.map((p) => `note ${/\d+(?=\.md)/.exec(p)?.[0]}`));
    expect(await files.exists("f3/sub/Note 3.md")).toBe(true);
    expect(fake.calls).toEqual(["walk", "readMany 40"]);
  });

  it("gives a picture's address without asking Android, the path in one encoded piece", () => {
    const address = folderAddress(
      {
        tree: "content://docs/tree/primary%3ADocuments%2FBoojy%20Notes",
        root: "primary:Documents/Boojy Notes",
      },
      (uri) => uri.replace("content://", "https://localhost/_capacitor_content_/"),
    );
    expect(address("photos/Beach day #2.jpg")).toBe(
      "https://localhost/_capacitor_content_/docs/tree/primary%3ADocuments%2FBoojy%20Notes/document/primary%3ADocuments%2FBoojy%20Notes%2Fphotos%2FBeach%20day%20%232.jpg",
    );
  });
});
