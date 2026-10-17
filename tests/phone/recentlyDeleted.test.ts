import { describe, expect, it, vi } from "vitest";
import { createPhoneVault } from "../../src/phone/phoneVault";
import { contentHash } from "../../src/sync/contentHash";
import { syncPass } from "../../src/sync/engine";
import type { Note } from "../../src/types/notes";
import { markdownToBlocks } from "../../src/utils/markdown";
import { FakeDropbox } from "../sync/fakes";
import { memoryFiles } from "./memoryFiles";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 17, 12);

const note = (id: string, title: string, text: string, folder: string | null = null): Note => ({
  id,
  title,
  folder,
  content: { title, blocks: markdownToBlocks(text) },
});
const bytes = (text: string) => new TextEncoder().encode(text);
const textOf = (files: ReturnType<typeof memoryFiles>, path: string) => {
  const v = files.store.get(path);
  return v && v !== "dir" ? new TextDecoder().decode(v) : null;
};
const under = (files: ReturnType<typeof memoryFiles>, dir: string) =>
  [...files.store.keys()].filter((p) => p.startsWith(`${dir}/`)).sort();

function setup(files = memoryFiles()) {
  let clock = T0;
  const onLocalChange = vi.fn();
  const open = () => createPhoneVault(files, { onLocalChange, now: () => clock });
  return {
    files,
    vault: open(),
    /** The app started again on the same storage. */
    restart: open,
    onLocalChange,
    later: (ms: number) => {
      clock += ms;
    },
  };
}

describe("Recently Deleted on the phone", () => {
  it("lists a deleted note by its name, folder and time, and shows its text", async () => {
    const { vault, later } = setup();
    await vault.api.writeNote(note("n1", "Penne", "boil", "Recipes"));
    later(1000);
    await vault.api.trashNote("n1");
    expect(await vault.api.listDeletedNotes()).toEqual([
      { id: "n1", name: "Penne", folder: "Recipes", at: T0 + 1000 },
    ]);
    expect(await vault.api.readDeletedNote("n1")).toBe("boil");
  });

  it("lists the newest first", async () => {
    const { vault, later } = setup();
    await vault.api.writeNote(note("n1", "First", "a"));
    await vault.api.writeNote(note("n2", "Second", "b"));
    await vault.api.trashNote("n1");
    later(1000);
    await vault.api.trashNote("n2");
    expect((await vault.api.listDeletedNotes()).map((r) => r.id)).toEqual(["n2", "n1"]);
  });

  it("restores a note as the same note, its bytes untouched, and tells sync", async () => {
    const { vault, files, onLocalChange } = setup();
    await vault.api.writeNote(note("n1", "Note", "x"));
    // Bytes the editor would spell differently, as a download can leave them.
    const authored = "Line one  \r\n*emphasis*\r\n";
    await vault.store.writeIfUnchanged("Note.md", bytes(authored), await contentHash(bytes("x")));
    await vault.api.trashNote("n1");
    onLocalChange.mockClear();
    const changed = vi.fn();
    vault.api.onDeletedNotesChanged(changed);

    const restored = await vault.api.restoreDeletedNote("n1");
    expect(restored).toMatchObject({ id: "n1", title: "Note", folder: null });
    expect(textOf(files, "vault/Note.md")).toBe(authored);
    expect(await vault.api.listDeletedNotes()).toEqual([]);
    expect(Object.keys(await vault.api.readAllNotes())).toEqual(["n1"]);
    expect(onLocalChange).toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();
    // The bin holds nothing once its last note is out.
    expect(under(files, "deleted")).toEqual([]);
  });

  it("puts a note back in its folder, making the folder again if it went", async () => {
    const { vault } = setup();
    await vault.api.writeNote(note("n1", "Penne", "boil", "Recipes/Pasta"));
    await vault.api.trashNote("n1");
    expect(await vault.api.deleteFolder("Recipes")).toEqual({ removed: true });
    const folders = vi.fn();
    vault.api.onFoldersChanged(folders);

    expect(await vault.api.restoreDeletedNote("n1")).toMatchObject({
      id: "n1",
      folder: "Recipes/Pasta",
    });
    expect(await vault.api.readFolders()).toEqual(["Recipes", "Recipes/Pasta"]);
    expect(folders).toHaveBeenCalled();
  });

  it("gives a restored note a -2 when its name is taken", async () => {
    const { vault } = setup();
    await vault.api.writeNote(note("n1", "Note", "old"));
    await vault.api.trashNote("n1");
    await vault.api.writeNote(note("n2", "Note", "new"));
    expect(await vault.api.restoreDeletedNote("n1")).toMatchObject({ id: "n1", title: "Note-2" });
  });

  it("lists a note sync deleted, and restores it", async () => {
    const { vault } = setup();
    await vault.api.writeNote(note("n1", "Gone", "x"));
    await vault.store.removeIfUnchanged("Gone.md", await contentHash(bytes("x")));
    expect((await vault.api.listDeletedNotes()).map((r) => r.id)).toEqual(["n1"]);
    expect(await vault.api.restoreDeletedNote("n1")).toMatchObject({ id: "n1", title: "Gone" });
  });

  it("deletes a note for good: its file, its entry and the folders left empty", async () => {
    const { vault, files } = setup();
    await vault.api.writeNote(note("n1", "Penne", "boil", "Recipes"));
    await vault.api.trashNote("n1");
    expect(await vault.api.purgeDeletedNote("n1")).toBe(true);
    expect(await vault.api.listDeletedNotes()).toEqual([]);
    expect(under(files, "deleted")).toEqual([]);
    expect(await vault.api.restoreDeletedNote("n1")).toBeNull();
  });

  it("keeps a note 30 days, then deletes it for good with whatever went with it", async () => {
    const { vault, files, later } = setup();
    await vault.api.writeNote(note("n1", "Old", "a"));
    await vault.api.trashNote("n1");
    // A picture sync removed at the same moment has no row, and goes with it.
    const [moment] = under(files, "deleted");
    await files.write(
      `${moment.split("/").slice(0, 2).join("/")}/attachments/cat.png`,
      bytes("png"),
    );

    later(29 * DAY);
    expect((await vault.api.listDeletedNotes()).map((r) => r.id)).toEqual(["n1"]);
    later(2 * DAY);
    expect(await vault.api.listDeletedNotes()).toEqual([]);
    expect(under(files, "deleted")).toEqual([]);
  });

  it("adopts a note deleted before ids were kept, under an id that lasts", async () => {
    const { files, restart } = setup();
    await files.write("deleted/2026-10-10T08-30-00-000Z/Ideas/Old.md", bytes("kept"));
    const [row] = await restart().api.listDeletedNotes();
    expect(row).toMatchObject({
      name: "Old",
      folder: "Ideas",
      at: Date.parse("2026-10-10T08:30:00.000Z"),
    });
    const [again] = await restart().api.listDeletedNotes();
    expect(again.id).toBe(row.id);
    expect(await restart().api.restoreDeletedNote(row.id)).toMatchObject({ id: row.id });
  });
});

/**
 * The app killed between two steps of a delete or a restore: started again,
 * the note is in exactly one place, under its own id.
 */
describe("a delete or restore cut short", () => {
  const killedAt = async (
    failOn: (op: string, path: string) => boolean,
    act: "trash" | "restore",
  ) => {
    let armed = false;
    const files = memoryFiles({ failOn: (op, path) => armed && failOn(op, path) });
    const env = setup(files);
    await env.vault.api.writeNote(note("n1", "Note", "text"));
    await env.vault.api.readAllNotes();
    if (act === "restore") await env.vault.api.trashNote("n1");
    armed = true;
    const run =
      act === "trash" ? env.vault.api.trashNote("n1") : env.vault.api.restoreDeletedNote("n1");
    await expect(run).rejects.toThrow(/killed/);
    const next = env.restart();
    return {
      live: Object.keys(await next.api.readAllNotes()),
      deleted: (await next.api.listDeletedNotes()).map((r) => r.id),
    };
  };

  it("a delete killed before its file moved leaves the note where it was", async () => {
    const state = await killedAt(
      (op, path) => op === "rename" && path === "vault/Note.md",
      "trash",
    );
    expect(state).toEqual({ live: ["n1"], deleted: [] });
  });

  it("a delete killed after its file moved leaves the note in the bin", async () => {
    const state = await killedAt(
      (op, path) => op === "write" && path === "state/ids.json",
      "trash",
    );
    expect(state).toEqual({ live: [], deleted: ["n1"] });
  });

  it("a restore killed before its file moved leaves the note in the bin", async () => {
    const state = await killedAt(
      (op, path) => op === "rename" && path.startsWith("deleted/"),
      "restore",
    );
    expect(state).toEqual({ live: [], deleted: ["n1"] });
  });

  it("a restore killed after its file moved leaves the note restored", async () => {
    const state = await killedAt(
      (op, path) => op === "write" && path === "state/deleted.json",
      "restore",
    );
    expect(state).toEqual({ live: ["n1"], deleted: [] });
  });
});

/** The bin against the sync engine and a stand-in Dropbox: the engine reconciles a restore. */
describe("restoring, as sync sees it", () => {
  async function synced(notes: Record<string, string>, files = memoryFiles()) {
    const env = setup(files);
    const dropbox = new FakeDropbox();
    for (const [path, text] of Object.entries(notes)) await dropbox.macWrite(path, text);
    // Passes until one has nothing left to do, as the runner would; a local
    // change (onLocalChange) during a pass asks for another, as in the app.
    const settle = async (vault = env.vault) => {
      for (let i = 0; i < 6; i++) {
        const asked = env.onLocalChange.mock.calls.length;
        const { again } = await syncPass({ local: vault.store, remote: dropbox });
        if (!again && env.onLocalChange.mock.calls.length === asked) return;
      }
      throw new Error("sync never settled");
    };
    await settle();
    const notesNow = await env.vault.api.readAllNotes();
    const idOf = (title: string) =>
      Object.values(notesNow).find((n) => n.title === title)?.id as string;
    return { ...env, dropbox, settle, idOf };
  }

  it("restored before Dropbox heard of the delete: nothing changes in Dropbox", async () => {
    const env = await synced({ "A.md": "alpha" });
    const rev = env.dropbox.files.get("a.md")?.rev;
    await env.vault.api.trashNote(env.idOf("A"));
    await env.vault.api.restoreDeletedNote(env.idOf("A"));
    await env.settle();
    expect(env.dropbox.paths()).toEqual(["A.md"]);
    expect(env.dropbox.files.get("a.md")?.rev).toBe(rev);
  });

  it("restored after Dropbox deleted it: it goes back up", async () => {
    const env = await synced({ "Ideas/A.md": "alpha" });
    const id = env.idOf("A");
    await env.vault.api.trashNote(id);
    await env.settle();
    expect(env.dropbox.paths()).toEqual([]);
    await env.vault.api.restoreDeletedNote(id);
    await env.settle();
    expect(env.dropbox.read("Ideas/A.md")).toBe("alpha");
  });

  it("restored while a pass is deleting it in Dropbox: the next pass puts it back", async () => {
    const env = await synced({ "A.md": "alpha" });
    const id = env.idOf("A");
    await env.vault.api.trashNote(id);
    env.dropbox.before("remove", async () => {
      await env.vault.api.restoreDeletedNote(id);
    });
    await env.settle();
    expect(env.dropbox.read("A.md")).toBe("alpha");
    expect(textOf(env.files, "vault/A.md")).toBe("alpha");
  });

  it("restored, then the app started again: the same note, nothing more to send", async () => {
    const env = await synced({ "A.md": "alpha" });
    const id = env.idOf("A");
    await env.vault.api.trashNote(id);
    await env.settle();
    await env.vault.api.restoreDeletedNote(id);
    await env.settle();
    const next = env.restart();
    expect(Object.keys(await next.api.readAllNotes())).toEqual([id]);
    const calls = env.dropbox.calls.length;
    await env.settle(next);
    expect(env.dropbox.calls.slice(calls)).toEqual(["listContinue"]);
    expect(await next.api.listDeletedNotes()).toEqual([]);
  });

  // Sync binned a note the Mac deleted, then the app died before the record
  // said so: the next pass took the restored note, unchanged since the record,
  // for one Dropbox had deleted, and binned it again.
  it("restored after a pass died between binning it and recording that: it stays restored", async () => {
    let binned = false;
    const files = memoryFiles({
      failOn: (op, path) => {
        if (op === "rename" && path === "vault/A.md") binned = true;
        return binned && op === "write" && path === "state/sync-record.json";
      },
    });
    const env = await synced({ "A.md": "alpha" }, files);
    env.dropbox.macDelete("A.md");
    await expect(syncPass({ local: env.vault.store, remote: env.dropbox })).rejects.toThrow(
      /killed/,
    );
    const next = env.restart();
    const [row] = await next.api.listDeletedNotes();
    expect(await next.api.restoreDeletedNote(row.id)).toMatchObject({ title: "A" });
    await env.settle(next);
    expect(textOf(env.files, "vault/A.md")).toBe("alpha");
    expect(env.dropbox.read("A.md")).toBe("alpha");
    expect(await next.api.listDeletedNotes()).toEqual([]);
  });

  it("deleted here but edited on the Mac: sync brings it back, and a restore keeps both", async () => {
    const env = await synced({ "A.md": "alpha" });
    const id = env.idOf("A");
    await env.vault.api.trashNote(id);
    await env.dropbox.macWrite("A.md", "alpha, edited on the Mac");
    await env.settle();
    expect(textOf(env.files, "vault/A.md")).toBe("alpha, edited on the Mac");
    expect(await env.vault.api.restoreDeletedNote(id)).toMatchObject({ id, title: "A-2" });
    await env.settle();
    expect(env.dropbox.paths()).toEqual(["A-2.md", "A.md"]);
    expect(env.dropbox.read("A-2.md")).toBe("alpha");
  });
});
