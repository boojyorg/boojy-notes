import { describe, expect, it } from "vitest";
import { reachableFolder } from "../../src/phone/folderFiles";
import {
  hasBeenUsed,
  readChoice,
  readStorage,
  startFor,
  writeChoice,
} from "../../src/phone/storageChoice";
import { fakeFolderAccess } from "./folderMemory";
import { memoryFiles } from "./memoryFiles";

const bytes = (text: string) => new TextEncoder().encode(text);
const FOLDER = { tree: "tree", root: "primary:Documents/Boojy Notes" };

describe("what a start does about where the notes are", () => {
  it("asks a fresh install, where the build offers a folder, and only there", () => {
    const fresh = { choice: null, folder: null, used: false };
    expect(startFor({ ...fresh, canAsk: true })).toBe("ask");
    expect(startFor({ ...fresh, canAsk: false })).toBe("app");
  });

  // Their notes are in the app's storage and cannot yet be moved to a folder.
  it("never asks an install that was in use before there was a choice", () => {
    expect(startFor({ choice: null, folder: null, used: true, canAsk: true })).toBe("app");
    expect(startFor({ choice: null, folder: FOLDER, used: true, canAsk: true })).toBe("app");
  });

  it("keeps to the choice once made", () => {
    expect(startFor({ choice: "app", folder: FOLDER, used: true, canAsk: true })).toBe("app");
    expect(startFor({ choice: "folder", folder: FOLDER, used: true, canAsk: true })).toBe("folder");
  });

  // Taken for app storage, every note would seem gone and new ones would be written elsewhere.
  it("says a chosen folder is lost when it cannot be reached, never the app's storage", () => {
    for (const canAsk of [true, false]) {
      expect(startFor({ choice: "folder", folder: null, used: true, canAsk })).toBe("lost");
      expect(startFor({ choice: "folder", folder: null, used: false, canAsk })).toBe("lost");
    }
  });
});

describe("the choice, kept in the app's storage", () => {
  it("is read back as written, and is none before, or when the file is damaged", async () => {
    const priv = memoryFiles();
    expect(await readChoice(priv)).toBeNull();
    await writeChoice(priv, "folder");
    expect(await readChoice(priv)).toBe("folder");
    await priv.write("state/storage.json", bytes("{ not json"));
    expect(await readChoice(priv)).toBeNull();
  });

  it("does not make a fresh install look used, but a note, a folder or a Dropbox connection does", async () => {
    const fresh = memoryFiles();
    expect(await hasBeenUsed(fresh)).toBe(false);
    await writeChoice(fresh, "app");
    expect(await hasBeenUsed(fresh)).toBe(false);

    const withNote = memoryFiles();
    await withNote.write("vault/Note.md", bytes("n"));
    expect(await hasBeenUsed(withNote)).toBe(true);

    const withFolder = memoryFiles();
    await withFolder.mkdir("vault/Ideas");
    expect(await hasBeenUsed(withFolder)).toBe(true);

    const connected = memoryFiles();
    await connected.write("state/binding.json", bytes("{}"));
    expect(await hasBeenUsed(connected)).toBe(true);
  });
});

describe("the folder Android still reaches", () => {
  const access = (trees: { tree: string; root: string }[], gone: string[] = []) => {
    const released: string[] = [];
    const { plugin } = fakeFolderAccess();
    return {
      released,
      plugin: {
        ...plugin,
        persisted: async () => ({ trees: trees.filter((t) => !released.includes(t.tree)) }),
        release: async ({ tree }: { tree: string }) => {
          released.push(tree);
        },
        list: async ({ tree }: { tree: string }) => {
          if (gone.includes(tree))
            throw Object.assign(new Error("Missing file"), { code: "MISSING" });
          return { entries: [] };
        },
      },
    };
  };
  const A = { tree: "a", root: "primary:Documents/A" };
  const B = { tree: "b", root: "primary:Documents/B" };

  it("is none when nothing was granted, or the granted folder was moved or removed", async () => {
    expect(await reachableFolder(access([]).plugin)).toBeNull();
    expect(await reachableFolder(access([A], ["a"]).plugin)).toBeNull();
    expect(await reachableFolder(access([A]).plugin)).toEqual(A);
  });

  it("gives every other grant back once a folder is chosen again", async () => {
    const { plugin, released } = access([A, B], ["a"]);
    expect(await reachableFolder(plugin, B)).toEqual(B);
    expect(released).toEqual(["a"]);
    expect(await reachableFolder(plugin)).toEqual(B);
  });

  it("does not take an error that is not 'missing' for a lost folder", async () => {
    const { plugin } = access([A]);
    plugin.list = async () => {
      throw new Error("the provider died");
    };
    await expect(reachableFolder(plugin)).rejects.toThrow(/provider died/);
  });
});

describe("a move to a folder, kept with the choice", () => {
  it("is read back: the folder being copied into, then the clearing", async () => {
    const priv = memoryFiles();
    await writeChoice(priv, "app", { moving: FOLDER });
    expect(await readStorage(priv)).toEqual({ kind: "app", moving: FOLDER });
    // Until every file is in the folder, the notes are the app's.
    expect(await readChoice(priv)).toBe("app");
    await writeChoice(priv, "folder", { clearing: true });
    expect(await readStorage(priv)).toEqual({ kind: "folder", clearing: true });
    await writeChoice(priv, "folder");
    expect(await readStorage(priv)).toEqual({ kind: "folder" });
  });

  it("reads a damaged move as none, never as a folder", async () => {
    const priv = memoryFiles();
    await priv.write("state/storage.json", bytes('{"kind":"app","moving":{"tree":7}}'));
    expect(await readStorage(priv)).toEqual({ kind: "app" });
  });
});
