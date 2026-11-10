import { describe, expect, it } from "vitest";
import { folderFiles } from "../../src/phone/folderFiles";
import { clearCopied, copyNotes } from "../../src/phone/moveToFolder";
import { createPhoneVault } from "../../src/phone/phoneVault";
import { routedFiles } from "../../src/phone/routedFiles";
import { fakeFolderAccess } from "./folderMemory";
import { memoryFiles } from "./memoryFiles";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (v: Uint8Array | "dir" | undefined) =>
  v && v !== "dir" ? new TextDecoder().decode(v) : v;
const FOLDER = { tree: "tree", root: "root" };

/** Notes in the app's storage, written oldest first, and an empty picked folder. */
async function phone(failOn?: (op: string, name: string) => boolean) {
  const priv = memoryFiles();
  await priv.write("vault/Old.md", bytes("the oldest"));
  await priv.write("vault/Trips/Lisbon.md", bytes("pastéis"));
  await priv.write("vault/attachments/map.png", new Uint8Array([0, 255, 7, 200]));
  await priv.write("vault/New.md", bytes("the newest"));
  await priv.mkdir("vault/Empty");
  await priv.write("vault/.~Draft.md.tmp", bytes("a save cut short"));
  await priv.write("state/ids.json", bytes("{}"));
  const fake = fakeFolderAccess({ failOn });
  return { priv, fake, folder: folderFiles(FOLDER, priv, fake.plugin) };
}
const inVault = (priv: ReturnType<typeof memoryFiles>) =>
  [...priv.store.keys()].filter((p) => p.startsWith("vault/")).sort();

describe("copying the app's notes into a picked folder", () => {
  it("copies every note, folder and picture, and leaves the app's storage as it was", async () => {
    const { priv, fake, folder } = await phone();
    const before = inVault(priv);
    await copyNotes(priv, "vault", folder);
    const there = fake.snapshot();
    expect([...there.keys()].sort()).toEqual([
      "Empty",
      "New.md",
      "Old.md",
      "Trips",
      "Trips/Lisbon.md",
      "attachments",
      "attachments/map.png",
    ]);
    expect(text(there.get("Trips/Lisbon.md"))).toBe("pastéis");
    expect(there.get("attachments/map.png")).toEqual(new Uint8Array([0, 255, 7, 200]));
    expect(inVault(priv)).toEqual(before);
  });

  // The folder stamps a file when it lands; the dates go, the order need not.
  it("copies oldest first, so Most recent keeps its order", async () => {
    const { priv, folder } = await phone();
    await copyNotes(priv, "vault", folder);
    const byTime = (await folder.walk?.(""))
      ?.filter((e) => e.kind === "file")
      .sort((a, b) => a.mtime - b.mtime)
      .map((e) => e.path);
    expect(byTime).toEqual(["Old.md", "Trips/Lisbon.md", "attachments/map.png", "New.md"]);
  });

  it("says how far it is", async () => {
    const { priv, folder } = await phone();
    const said: string[] = [];
    await copyNotes(priv, "vault", folder, (done, total) => said.push(`${done}/${total}`));
    expect(said).toEqual(["0/4", "1/4", "2/4", "3/4", "4/4"]);
  });

  it("killed at any call and run again, ends with every file whole and none doubled", async () => {
    for (let at = 0; ; at++) {
      let calls = 0;
      const { priv, fake } = await phone((op) => op !== "list" && calls++ === at);
      const run = async () => {
        // A new start: nothing the page knew is kept, and the journal is finished first.
        const folder = folderFiles(FOLDER, priv, fake.plugin);
        await folder.recover("");
        await copyNotes(priv, "vault", folder);
      };
      const killed = await run().then(
        () => false,
        () => true,
      );
      if (!killed) break;
      await run();
      const there = fake.snapshot();
      expect([...there.keys()].sort(), `killed at call ${at}`).toEqual([
        "Empty",
        "New.md",
        "Old.md",
        "Trips",
        "Trips/Lisbon.md",
        "attachments",
        "attachments/map.png",
      ]);
      expect(text(there.get("Old.md"))).toBe("the oldest");
      expect(text(there.get("New.md"))).toBe("the newest");
      expect(text(there.get("Trips/Lisbon.md"))).toBe("pastéis");
    }
  });

  it("writes again a file the folder holds cut short, even at the right size", async () => {
    const { priv, fake, folder } = await phone();
    fake.outside.put("Old.md", bytes("the oldesX"));
    fake.outside.put("New.md", bytes("the"));
    await copyNotes(priv, "vault", folder);
    expect(text(fake.snapshot().get("Old.md"))).toBe("the oldest");
    expect(text(fake.snapshot().get("New.md"))).toBe("the newest");
  });

  // The folder would hold one of the two under both names.
  it("refuses two names that differ only by capitals, before writing anything", async () => {
    const { priv, fake, folder } = await phone();
    await priv.write("vault/old.md", bytes("another note"));
    await expect(copyNotes(priv, "vault", folder)).rejects.toThrow(/differ only by capitals/);
    expect(fake.snapshot().size).toBe(0);
  });
});

describe("clearing the app's copies once the folder holds the notes", () => {
  it("removes what the folder holds and the folders left empty, and nothing else", async () => {
    const { priv, fake, folder } = await phone();
    await copyNotes(priv, "vault", folder);
    fake.outside.remove("Trips/Lisbon.md");
    await clearCopied(priv, "vault", folderFiles(FOLDER, priv, fake.plugin));
    expect(inVault(priv)).toEqual(["vault/.~Draft.md.tmp", "vault/Trips", "vault/Trips/Lisbon.md"]);
    expect(priv.store.has("state/ids.json")).toBe(true);
  });

  it("killed part-way and run again, finishes", async () => {
    const { priv, fake, folder } = await phone();
    await copyNotes(priv, "vault", folder);
    let removals = 0;
    const dying = {
      ...priv,
      remove: async (p: string) => {
        if (removals++ === 1) throw new Error("killed");
        return priv.remove(p);
      },
    };
    await expect(clearCopied(dying, "vault", folder)).rejects.toThrow("killed");
    await clearCopied(priv, "vault", folderFiles(FOLDER, priv, fake.plugin));
    expect(inVault(priv)).toEqual(["vault/.~Draft.md.tmp"]);
  });
});

describe("the notes after a move", () => {
  // Sync compares paths and content hashes with its record: the same of both is nothing to do.
  it("are the same notes to the editor and to sync: ids, paths and hashes", async () => {
    const { priv, fake, folder } = await phone();
    const listed = async (files: Parameters<typeof createPhoneVault>[0]) => {
      const vault = createPhoneVault(files);
      const notes = Object.values(await vault.api.readAllNotes())
        .map((n) => `${n.id} ${n.folder ?? ""}/${n.title}`)
        .sort();
      const { files: paths, folders } = await vault.store.list();
      const hashes = await Promise.all(paths.map((p) => vault.store.hash?.(p)));
      return { notes, paths, folders, hashes };
    };
    const before = await listed(priv);
    await copyNotes(priv, "vault", folder);
    await clearCopied(priv, "vault", folder);
    const after = await listed(routedFiles(priv, folderFiles(FOLDER, priv, fake.plugin), "vault"));
    expect(after).toEqual(before);
    expect(before.notes).toHaveLength(3);
  });
});
