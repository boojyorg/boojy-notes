import { describe, expect, it } from "vitest";
import { clashCopyPath, type PassResult, syncPass } from "../../src/sync/engine";
import { RemoteNotFoundError } from "../../src/sync/types";
import { Crash, FakeDropbox, FakeLocal } from "./fakes";

const COPY = "(conflicted copy 2026-10-15)";

function setup() {
  const phone = new FakeLocal();
  const dropbox = new FakeDropbox();
  const sync = () =>
    syncPass({ local: phone, remote: dropbox, now: () => new Date(2026, 9, 15, 12) });
  /** Passes until one has nothing left to do, as the runner would. */
  const settle = async (): Promise<PassResult> => {
    for (let i = 0; i < 6; i++) {
      const result = await sync();
      if (!result.again) return result;
    }
    throw new Error("sync never settled");
  };
  /** The calls Dropbox received during `run`. */
  const callsDuring = async (run: () => Promise<unknown>) => {
    const from = dropbox.calls.length;
    await run();
    return dropbox.calls.slice(from);
  };
  return { phone, dropbox, sync, settle, callsDuring };
}

/** Both sides hold exactly these notes. */
function expectBoth(env: ReturnType<typeof setup>, notes: Record<string, string>) {
  const paths = Object.keys(notes).sort();
  expect(env.phone.paths()).toEqual(paths);
  expect(env.dropbox.paths()).toEqual(paths);
  for (const [path, content] of Object.entries(notes)) {
    expect(env.phone.text(path)).toBe(content);
    expect(env.dropbox.read(path)).toBe(content);
  }
}

async function started(notes: Record<string, string>) {
  const env = setup();
  for (const [path, content] of Object.entries(notes)) await env.dropbox.macWrite(path, content);
  await env.settle();
  return env;
}

describe("the sync engine: one row of the design's table each", () => {
  it("brings a new phone up to date, then has nothing to do", async () => {
    const env = await started({ "A.md": "alpha", "Ideas/B.md": "beta" });
    expectBoth(env, { "A.md": "alpha", "Ideas/B.md": "beta" });
    const calls = await env.callsDuring(env.sync);
    expect(calls).toEqual(["listContinue"]);
  });

  it("uploads a note edited on the phone, only over the revision it last saw", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "alpha, edited on the phone");
    await env.settle();
    expectBoth(env, { "A.md": "alpha, edited on the phone" });
  });

  it("downloads a note edited on the Mac", async () => {
    const env = await started({ "A.md": "alpha" });
    await env.dropbox.macWrite("A.md", "alpha, edited on the Mac");
    await env.settle();
    expectBoth(env, { "A.md": "alpha, edited on the Mac" });
  });

  it("moves nothing when both sides made the same edit", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "same");
    await env.dropbox.macWrite("A.md", "same");
    const calls = await env.callsDuring(env.settle);
    expect(calls).not.toContain("upload");
    expect(calls).not.toContain("download");
    expectBoth(env, { "A.md": "same" });
  });

  it("keeps both versions when both sides edited differently", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "phone's words");
    await env.dropbox.macWrite("A.md", "Mac's words");
    await env.settle();
    expectBoth(env, { "A.md": "Mac's words", [`A ${COPY}.md`]: "phone's words" });
  });

  it("deletes in Dropbox a note deleted on the phone", async () => {
    const env = await started({ "A.md": "alpha", "B.md": "beta" });
    env.phone.files.delete("A.md");
    await env.settle();
    expectBoth(env, { "B.md": "beta" });
  });

  it("brings back a note deleted on the phone but edited on the Mac", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.files.delete("A.md");
    await env.dropbox.macWrite("A.md", "alpha, edited on the Mac");
    await env.settle();
    expectBoth(env, { "A.md": "alpha, edited on the Mac" });
  });

  it("sends back up a note edited on the phone but deleted on the Mac", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "alpha, edited on the phone");
    env.dropbox.macDelete("A.md");
    await env.settle();
    expectBoth(env, { "A.md": "alpha, edited on the phone" });
  });

  it("records, without sending, a note both sides created with the same words", async () => {
    const env = await started({});
    env.phone.type("New.md", "hello");
    await env.dropbox.macWrite("New.md", "hello");
    const calls = await env.callsDuring(env.settle);
    expect(calls).not.toContain("upload");
    expect(calls).not.toContain("download");
    expectBoth(env, { "New.md": "hello" });
  });

  it("keeps both when both sides created the same name with different words", async () => {
    const env = await started({});
    env.phone.type("New.md", "phone");
    await env.dropbox.macWrite("New.md", "Mac");
    await env.settle();
    expectBoth(env, { "New.md": "Mac", [`New ${COPY}.md`]: "phone" });
  });

  it("carries pictures both ways, byte for byte", async () => {
    const env = await started({});
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255, 128, 7]);
    env.phone.files.set("attachments/one.png", png);
    await env.settle();
    expect(env.dropbox.files.get("attachments/one.png")?.bytes).toEqual(png);
    await env.dropbox.macWrite("attachments/two.png", "not really a png");
    await env.settle();
    expect(env.phone.text("attachments/two.png")).toBe("not really a png");
  });

  it("never syncs dot files", async () => {
    const env = await started({});
    env.phone.type(".DS_Store", "x");
    await env.dropbox.macWrite(".~A.md.tmp", "half a save");
    await env.settle();
    expect(env.dropbox.paths()).toEqual([".~A.md.tmp"]);
    expect(env.phone.paths()).toEqual([".DS_Store"]);
  });

  it("holds back two phone names that differ only in case", async () => {
    const env = await started({});
    env.phone.type("Note.md", "one");
    env.phone.type("note.md", "two");
    const result = await env.settle();
    expect(result.attention).toEqual([{ kind: "case", paths: ["Note.md", "note.md"] }]);
    expect(env.dropbox.paths()).toEqual([]);
  });

  it("never takes a note held back for case for one renamed on the phone", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("a.md", "other");
    env.phone.type("B.md", "alpha"); // A's bytes under a new name
    const calls = await env.callsDuring(env.settle);
    expect(calls).not.toContain("move");
    expect(env.dropbox.read("A.md")).toBe("alpha");
    expect(env.dropbox.read("B.md")).toBe("alpha");
  });

  it("leaves a note held back for case where it is when the Mac renames it", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("a.md", "other");
    env.dropbox.macMove("A.md", "C.md");
    await env.settle();
    expect(env.phone.text("A.md")).toBe("alpha");
    expect(env.phone.text("a.md")).toBe("other");
    expect(env.dropbox.read("C.md")).toBe("alpha");
  });

  it("holds back a file too big for Dropbox and syncs the rest", async () => {
    const env = await started({});
    env.dropbox.maxUpload = 10;
    env.phone.type("Big.pdf", "far more than ten bytes");
    env.phone.type("A.md", "alpha");
    const result = await env.settle();
    expect(result.attention).toEqual([{ kind: "too-large", path: "Big.pdf" }]);
    expect(env.dropbox.paths()).toEqual(["A.md"]);
  });

  it("holds back a conflicted copy too big for Dropbox and finishes the clash", async () => {
    const env = await started({ "A.md": "alpha" });
    env.dropbox.maxUpload = 10;
    env.phone.type("A.md", "phone's long version");
    await env.dropbox.macWrite("A.md", "mac's");
    const result = await env.settle();
    expect(result.attention).toEqual([{ kind: "too-large", path: `A ${COPY}.md` }]);
    expect(env.dropbox.read("A.md")).toBe("mac's");
    expect(env.phone.text(`A ${COPY}.md`)).toBe("phone's long version");
  });
});

describe("renames", () => {
  it("follows a rename made on the Mac without downloading the note again", async () => {
    const env = await started({ "A.md": "alpha" });
    env.dropbox.macMove("A.md", "Renamed.md");
    const calls = await env.callsDuring(env.settle);
    expect(calls).not.toContain("download");
    expectBoth(env, { "Renamed.md": "alpha" });
  });

  it("sends a phone rename as a move, so the note keeps its Dropbox id", async () => {
    const env = await started({ "A.md": "alpha" });
    const id = env.dropbox.files.get("a.md")?.id;
    env.phone.files.set("Renamed.md", env.phone.files.get("A.md") as Uint8Array);
    env.phone.files.delete("A.md");
    await env.settle();
    expectBoth(env, { "Renamed.md": "alpha" });
    expect(env.dropbox.files.get("renamed.md")?.id).toBe(id);
  });

  it("carries the phone's offline edit to the name the Mac gave the note", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "alpha, edited offline");
    env.dropbox.macMove("A.md", "Renamed.md");
    await env.settle();
    expectBoth(env, { "Renamed.md": "alpha, edited offline" });
  });

  it("keeps one note under Dropbox's name when both sides renamed it differently", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.files.set("Phone name.md", env.phone.files.get("A.md") as Uint8Array);
    env.phone.files.delete("A.md");
    env.dropbox.macMove("A.md", "Mac name.md");
    await env.settle();
    expectBoth(env, { "Mac name.md": "alpha" });
  });

  it("handles a phone rename followed by a new note at the old name", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.files.set("Moved.md", env.phone.files.get("A.md") as Uint8Array);
    env.phone.type("A.md", "a new note");
    await env.settle();
    expectBoth(env, { "A.md": "a new note", "Moved.md": "alpha" });
  });

  it("handles a Mac rename followed by a new note at the old name", async () => {
    const env = await started({ "A.md": "alpha" });
    env.dropbox.macMove("A.md", "Moved.md");
    await env.dropbox.macWrite("A.md", "a new note");
    await env.settle();
    expectBoth(env, { "A.md": "a new note", "Moved.md": "alpha" });
  });

  it("moves the renamed note itself, not a new note the Mac just put at its old name", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.files.set("B.md", env.phone.files.get("A.md") as Uint8Array);
    env.phone.files.delete("A.md");
    // After the phone's listing, before its move: the Mac renames A and makes a new A.
    env.dropbox.before("move", async () => {
      env.dropbox.macMove("A.md", "C.md");
      await env.dropbox.macWrite("A.md", "a new note");
    });
    await env.settle();
    await env.settle(); // the pass Dropbox's long-poll asks for after the Mac's change
    expectBoth(env, { "A.md": "a new note", "B.md": "alpha" });
  });

  it("never overwrites a conflicted copy: a second clash the same day gets -2", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "phone 1");
    await env.dropbox.macWrite("A.md", "Mac 1");
    await env.settle();
    env.phone.type("A.md", "phone 2");
    await env.dropbox.macWrite("A.md", "Mac 2");
    await env.settle();
    expectBoth(env, {
      "A.md": "Mac 2",
      [`A ${COPY}.md`]: "phone 1",
      [`A ${COPY}-2.md`]: "phone 2",
    });
  });
});

describe("interruptions: the app killed at each point", () => {
  it("re-sends an upload cut off before it reached Dropbox", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "edited");
    env.dropbox.failAt("upload", "before");
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    await env.settle();
    expectBoth(env, { "A.md": "edited" });
  });

  it("recognises an upload that reached Dropbox before the record was saved", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "edited");
    env.dropbox.failAt("upload", "after");
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    const calls = await env.callsDuring(env.settle);
    expect(calls).not.toContain("upload");
    expectBoth(env, { "A.md": "edited" });
  });

  it("finishes a download cut off before it was written", async () => {
    const env = await started({ "A.md": "alpha" });
    await env.dropbox.macWrite("A.md", "from the Mac");
    env.phone.failAt("write", "before");
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    await env.settle();
    expectBoth(env, { "A.md": "from the Mac" });
  });

  it("recognises a download written before the record was saved", async () => {
    const env = await started({ "A.md": "alpha" });
    await env.dropbox.macWrite("A.md", "from the Mac");
    env.phone.failAt("write", "after");
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    await env.settle();
    expectBoth(env, { "A.md": "from the Mac" });
  });

  describe("a clash cut off at each step", () => {
    const clashing = async () => {
      const env = await started({ "A.md": "alpha" });
      env.phone.type("A.md", "phone's words");
      await env.dropbox.macWrite("A.md", "Mac's words");
      return env;
    };
    const kept = { "A.md": "Mac's words", [`A ${COPY}.md`]: "phone's words" };

    it("before the phone's version is renamed", async () => {
      const env = await clashing();
      env.phone.failAt("rename", "before");
      await expect(env.sync()).rejects.toBeInstanceOf(Crash);
      await env.settle();
      expectBoth(env, kept);
    });

    it("between the rename and its tick in the record", async () => {
      const env = await clashing();
      env.phone.failAt("rename", "after");
      await expect(env.sync()).rejects.toBeInstanceOf(Crash);
      await env.settle();
      expectBoth(env, kept);
    });

    it("between the download and its tick", async () => {
      const env = await clashing();
      env.phone.failAt("write", "after");
      await expect(env.sync()).rejects.toBeInstanceOf(Crash);
      await env.settle();
      expectBoth(env, kept);
    });

    it("after the copy reached Dropbox but before the plan was cleared", async () => {
      const env = await clashing();
      env.dropbox.failAt("upload", "after");
      await expect(env.sync()).rejects.toBeInstanceOf(Crash);
      await env.settle();
      expectBoth(env, kept);
    });
  });

  it("keeps both when an upload landed, the Mac edited again, and the phone restarted on its old record", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "phone's edit");
    env.dropbox.failAt("upload", "after");
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    await env.dropbox.macWrite("A.md", "Mac's later edit");
    await env.settle();
    expectBoth(env, { "A.md": "Mac's later edit", [`A ${COPY}.md`]: "phone's edit" });
  });

  it("never deletes anything after an interrupted first sync", async () => {
    const env = setup();
    for (const n of [1, 2, 3, 4, 5]) await env.dropbox.macWrite(`N${n}.md`, `note ${n}`);
    env.phone.type("Local.md", "written before the first sync");
    // The third download fails: two notes arrived, the rest did not.
    env.dropbox.failAt("download", "before", { skip: 2 });
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    await env.settle();
    expect(env.dropbox.paths()).toEqual(["Local.md", "N1.md", "N2.md", "N3.md", "N4.md", "N5.md"]);
    expect(env.phone.paths()).toEqual(env.dropbox.paths());
  });

  it("makes the vault's folder in Dropbox on the first sync when it isn't there", async () => {
    const env = setup();
    env.dropbox.rootExists = false;
    env.phone.type("Hello.md", "from the phone");
    await env.settle();
    expect(env.dropbox.rootExists).toBe(true);
    expectBoth(env, { "Hello.md": "from the phone" });
  });

  it("stops, deleting nothing, when a synced vault's folder has gone from Dropbox", async () => {
    const env = await started({ "A.md": "a", "B.md": "b" });
    env.dropbox.rootExists = false;
    env.dropbox.expireCursors();
    await expect(env.sync()).rejects.toBeInstanceOf(RemoteNotFoundError);
    expect(env.dropbox.rootExists).toBe(false);
    expect(env.phone.paths()).toEqual(["A.md", "B.md"]);
  });

  it("never treats an unfinished listing as deletions", async () => {
    const env = await started({ "A.md": "a", "B.md": "b", "C.md": "c", "D.md": "d" });
    env.dropbox.pageSize = 2;
    env.dropbox.expireCursors();
    env.dropbox.failAt("listContinue", "after");
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    expect(env.phone.paths()).toEqual(["A.md", "B.md", "C.md", "D.md"]);
    await env.settle();
    expectBoth(env, { "A.md": "a", "B.md": "b", "C.md": "c", "D.md": "d" });
  });

  it("recovers from an expired cursor, cut off partway through the fresh listing", async () => {
    const env = await started({ "A.md": "a", "B.md": "b", "C.md": "c" });
    env.dropbox.pageSize = 1;
    await env.dropbox.macWrite("B.md", "b, edited");
    env.dropbox.macDelete("C.md");
    env.dropbox.expireCursors();
    // The old cursor is refused; the fresh listing is cut off after its first page.
    env.dropbox.failAt("listContinue", "before", { skip: 1 });
    await expect(env.sync()).rejects.toBeInstanceOf(Crash);
    await env.settle();
    expectBoth(env, { "A.md": "a", "B.md": "b, edited" });
  });

  it("reads every page of a listing that spans several", async () => {
    const env = setup();
    env.dropbox.pageSize = 3;
    const notes: Record<string, string> = {};
    for (let n = 0; n < 10; n++) notes[`Note ${n}.md`] = `words ${n}`;
    for (const [path, content] of Object.entries(notes)) await env.dropbox.macWrite(path, content);
    await env.settle();
    expectBoth(env, notes);
    // The change feed pages too.
    for (let n = 0; n < 10; n++) notes[`Note ${n}.md`] = `edited ${n}`;
    for (const [path, content] of Object.entries(notes)) await env.dropbox.macWrite(path, content);
    await env.settle();
    expectBoth(env, notes);
  });
});

describe("edits made while a transfer runs", () => {
  it("keeps what the person typed during a download, and both versions after", async () => {
    const env = await started({ "A.md": "alpha" });
    await env.dropbox.macWrite("A.md", "from the Mac");
    env.dropbox.before("download", () => env.phone.type("A.md", "typed during the download"));
    await env.settle();
    expectBoth(env, { "A.md": "from the Mac", [`A ${COPY}.md`]: "typed during the download" });
  });

  it("marks as synced only the bytes an upload sent", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "first edit");
    env.dropbox.before("upload", () => env.phone.type("A.md", "typed during the upload"));
    const first = await env.sync();
    expect(first.log).toContain("uploaded: A.md");
    expect(env.dropbox.read("A.md")).toBe("first edit");
    await env.settle();
    expectBoth(env, { "A.md": "typed during the upload" });
  });

  it("takes a Mac edit that lands between the listing and the upload as a clash, never an overwrite", async () => {
    const env = await started({ "A.md": "alpha" });
    env.phone.type("A.md", "phone's edit");
    env.dropbox.before("upload", async () => {
      await env.dropbox.macWrite("A.md", "Mac's edit");
    });
    await env.settle();
    expectBoth(env, { "A.md": "Mac's edit", [`A ${COPY}.md`]: "phone's edit" });
  });
});

describe("folders", () => {
  it("makes empty folders on both sides", async () => {
    const env = await started({});
    await env.dropbox.createFolder("From the Mac");
    env.phone.folders.add("From the phone");
    await env.settle();
    expect([...env.phone.folders].sort()).toEqual(["From the Mac", "From the phone"]);
    expect([...env.dropbox.folders.values()].sort()).toEqual(["From the Mac", "From the phone"]);
  });

  it("follows a folder the Mac deleted, once its notes are gone", async () => {
    const env = await started({ "Old/A.md": "alpha" });
    await env.dropbox.createFolder("Old");
    await env.settle();
    env.dropbox.macDeleteFolder("Old");
    await env.settle();
    expect(env.phone.paths()).toEqual([]);
    expect(env.phone.folders.has("Old")).toBe(false);
  });

  it("never deletes a folder in Dropbox, and doesn't bring it back to the phone", async () => {
    const env = await started({});
    await env.dropbox.createFolder("Keep");
    await env.settle();
    env.phone.folders.delete("Keep");
    await env.settle();
    expect(env.dropbox.folders.has("keep")).toBe(true);
    expect(env.phone.folders.has("Keep")).toBe(false);
  });
});

describe("clashCopyPath", () => {
  it("names the copy beside the note, keeping the extension", () => {
    expect(clashCopyPath("Ideas/Plan.md", "2026-10-15", () => false)).toBe(
      "Ideas/Plan (conflicted copy 2026-10-15).md",
    );
    expect(clashCopyPath("No extension", "2026-10-15", () => false)).toBe(
      "No extension (conflicted copy 2026-10-15)",
    );
    expect(clashCopyPath("v1.2/notes", "2026-10-15", () => false)).toBe(
      "v1.2/notes (conflicted copy 2026-10-15)",
    );
  });

  it("counts up past every name taken on either side", () => {
    const taken = new Set([
      "a (conflicted copy 2026-10-15).md",
      "a (conflicted copy 2026-10-15)-2.md",
    ]);
    expect(clashCopyPath("A.md", "2026-10-15", (k) => taken.has(k))).toBe(
      "A (conflicted copy 2026-10-15)-3.md",
    );
  });
});
