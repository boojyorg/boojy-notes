import { vi } from "vitest";

/**
 * Recently Deleted again, every test of it, with the notes in a picked
 * folder and the bin in the app's private storage: a delete and a restore
 * are then a move between two stores (src/phone/routedFiles.ts), and the
 * rules must hold all the same.
 */
vi.mock("./memoryFiles", async () => {
  const actual = await vi.importActual<typeof import("./memoryFiles")>("./memoryFiles");
  const { routedMemory } = await import("./folderMemory");
  return { memoryFiles: routedMemory(actual.memoryFiles) };
});

await import("./recentlyDeleted.test");

const { it, expect } = await import("vitest");
const { memoryFiles } = await import("./memoryFiles");

it("ran over a picked folder: a note written to the vault is in the folder, not the private storage", async () => {
  const files = memoryFiles() as ReturnType<
    ReturnType<typeof import("./folderMemory").routedMemory>
  >;
  await files.write("vault/A.md", new TextEncoder().encode("a"));
  expect([...files.fake.snapshot().keys()]).toEqual(["A.md"]);
  expect([...files.priv.store.keys()].some((p) => p.startsWith("vault"))).toBe(false);
});
