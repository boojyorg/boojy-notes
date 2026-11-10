import { describe, expect, it } from "vitest";
import { MOVES, routedFiles } from "../../src/phone/routedFiles";
import { memoryFiles } from "./memoryFiles";

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (b: Uint8Array | "dir" | undefined) =>
  b && b !== "dir" ? new TextDecoder().decode(b) : null;

/** Two stores behind one set of paths: the folder holds the vault, the rest is private. */
function setup(failOn?: (store: "priv" | "folder", op: string, path: string) => boolean) {
  const priv = memoryFiles({ failOn: (op, p) => !!failOn?.("priv", op, p) });
  const folder = memoryFiles({ failOn: (op, p) => !!failOn?.("folder", op, p) });
  return { priv, folder, files: routedFiles(priv, folder, "vault") };
}

describe("the vault in a picked folder, the rest in the app's storage", () => {
  it("sends each path to its store", async () => {
    const { files, priv, folder } = setup();
    await files.write("vault/Recipes/Penne.md", bytes("boil"));
    await files.write("state/ids.json", bytes("{}"));
    expect([...folder.store.keys()].sort()).toEqual(["Recipes", "Recipes/Penne.md"]);
    expect([...priv.store.keys()].sort()).toEqual(["state", "state/ids.json"]);
    expect((await files.list("vault")).map((e) => e.name)).toEqual(["Recipes"]);
    await files.rename("vault/Recipes/Penne.md", "vault/Penne.md");
    expect(folder.store.has("Penne.md")).toBe(true);
  });

  it("moves a file between the stores, both ways, and refuses a name that is taken", async () => {
    const { files, priv, folder } = setup();
    await files.write("vault/Note.md", bytes("text"));
    await files.rename("vault/Note.md", "deleted/now/Note.md");
    expect(folder.store.has("Note.md")).toBe(false);
    expect(text(priv.store.get("deleted/now/Note.md"))).toBe("text");
    await files.write("vault/Other.md", bytes("other"));
    await expect(files.rename("deleted/now/Note.md", "vault/Other.md")).rejects.toThrow(/exists/);
    await files.rename("deleted/now/Note.md", "vault/Note.md");
    expect(text(folder.store.get("Note.md"))).toBe("text");
    expect(priv.store.has("deleted/now/Note.md")).toBe(false);
    expect([...priv.store.keys()].filter((p) => p.startsWith(`${MOVES}/`))).toEqual([]);
  });
});

/**
 * A delete into the bin or a restore out of it, killed at each step: after
 * the next start's `recover`, the note is whole in exactly one place.
 */
describe("a move between the stores cut short", () => {
  const steps: [string, (store: string, op: string, path: string) => boolean][] = [
    ["before it is noted", (s, op, p) => s === "priv" && op === "write" && p.startsWith(MOVES)],
    ["before it is written there", (s, op, p) => op === "write" && /Note\.md$/.test(p)],
    ["before it is removed here", (s, op, p) => op === "remove" && /Note\.md$/.test(p)],
    [
      "before its note is dropped",
      (s, op, p) => s === "priv" && op === "remove" && p.startsWith(MOVES),
    ],
  ];
  for (const [direction, from, to] of [
    ["out of the folder", "vault/Note.md", "deleted/now/Note.md"],
    ["into the folder", "deleted/now/Note.md", "vault/Note.md"],
  ]) {
    it.each(steps)(`${direction}, killed %s`, async (_name, at) => {
      let armed = false;
      const { files, priv, folder } = setup((s, op, p) => armed && at(s, op, p));
      await files.write(from, bytes("the note"));
      armed = true;
      await expect(files.rename(from, to)).rejects.toThrow(/killed/);
      armed = false;
      await files.recover("vault");
      const held = [await files.read(from), await files.read(to)].filter(Boolean);
      expect(held.map((b) => text(b as Uint8Array))).toEqual(["the note"]);
      expect([...priv.store.keys()].filter((p) => p.startsWith(`${MOVES}/`))).toEqual([]);
      void folder;
    });
  }
});
