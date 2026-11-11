/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/** The app's private storage as a start finds it: `state/`'s files, and the storage choice. */
const disk = vi.hoisted(() => ({
  state: [] as string[],
  choice: null as string | null,
  /** What a move under way adds to the choice's file. */
  under: {} as Record<string, unknown>,
  written: [] as [string, string][],
  /** Any other file a start reads: the list of storage locations, another location's choice. */
  files: {} as Record<string, string>,
  /** The directories `fileAddress` was asked for. */
  addressed: [] as string[],
}));
vi.mock("../../src/phone/files", () => ({
  capacitorFiles: () => ({
    recover: async () => {},
    read: async (path: string) =>
      path === "state/storage.json" && disk.choice
        ? new TextEncoder().encode(JSON.stringify({ kind: disk.choice, ...disk.under }))
        : path in disk.files
          ? new TextEncoder().encode(disk.files[path])
          : null,
    list: async (dir: string) =>
      dir === "state" ? disk.state.map((name) => ({ name, kind: "file", mtime: 0, size: 1 })) : [],
    write: async (path: string, bytes: Uint8Array) => {
      disk.written.push([path, new TextDecoder().decode(bytes)]);
    },
  }),
  fileAddress: async (dir: string) => {
    disk.addressed.push(dir);
    return (rel: string) => `https://localhost/_capacitor_file_/${dir}/${rel}`;
  },
}));
const checkOutside = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/phone/phoneVault", () => ({
  VAULT: "vault",
  createPhoneVault: () => ({
    api: {},
    store: {},
    checkOutside,
    atRest: (work: () => Promise<unknown>) => work(),
  }),
}));
/** Android, or the page in a browser; and the app's coming to the front, as Android says it. */
const device = vi.hoisted(() => ({
  native: true,
  stateChange: null as ((state: { isActive: boolean }) => void) | null,
}));
vi.mock("@capacitor/core", async (original) => ({
  ...(await original<typeof import("@capacitor/core")>()),
  Capacitor: { isNativePlatform: () => device.native, convertFileSrc: (uri: string) => uri },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (_: string, cb: (state: { isActive: boolean }) => void) => {
      device.stateChange = cb;
    },
  },
}));
const start = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/phone/phoneSync", () => ({
  readBinding: async (files: { read(path: string): Promise<Uint8Array | null> }) => {
    const bytes = await files.read("state/binding.json");
    return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
  },
  createPhoneSync: () => ({
    start: () => start(),
    localChanged() {},
    status: { status: () => null, subscribe: () => () => {} },
  }),
}));
vi.mock("../../src/phone/commands", () => ({ onCommand: () => () => {} }));
const screens = vi.hoisted(() => ({
  askStorage: vi.fn(async () => null as { tree: string; root: string } | null),
  askFolderAgain: vi.fn(async () => ({ tree: "again", root: "primary:Documents/Again" })),
  showMoving: vi.fn(() => ({ progress() {}, close() {} })),
  sayNotMoved: vi.fn(async (_reason: string) => {}),
}));
const move = vi.hoisted(() => ({
  copyNotes: vi.fn(async () => {}),
  clearCopied: vi.fn(async () => {}),
}));
vi.mock("../../src/phone/moveToFolder", () => move);
const released = vi.hoisted(() => [] as string[]);
/** Android's folder screen: what it answers, and what the folder taken holds. */
const picker = vi.hoisted(() => ({
  answer: { picked: false } as { picked: boolean; tree?: string; root?: string; refused?: string },
  holds: [] as string[],
}));
vi.mock("../../src/phone/storageScreens", () => screens);
const reachable = vi.hoisted(() =>
  vi.fn(async () => null as { tree: string; root: string } | null),
);
/** Whether Android still reaches a folder the choice names: by default it does. */
const reached = vi.hoisted(() =>
  vi.fn(async (folder: { tree: string; root: string }) => folder as typeof folder | null),
);
vi.mock("../../src/phone/folderFiles", () => ({
  FolderAccess: {
    ensureDefault: async () => ({ made: true, initial: "initial" }),
    pick: async () => picker.answer,
    list: async () => ({ entries: picker.holds.map((name) => ({ name })) }),
    release: async ({ tree }: { tree: string }) => {
      released.push(tree);
    },
  },
  reachableFolder: reachable,
  folderReached: reached,
  folderFiles: () => ({ recover: async () => {} }),
  folderAddress: () => (rel: string) => rel,
  folderLabel: ({ root }: { root: string }) => root.slice(root.indexOf(":") + 1),
}));

import config from "../../capacitor.config";
import { installPhone } from "../../src/phone/install";

const COVER = "width=device-width, initial-scale=1.0, viewport-fit=cover";

/**
 * Capacitor reads `viewport-fit` once, as the page commits. The phone's start
 * once swapped `cover` for `contain`, so by timing the app was either under
 * Android's bars or inside them, the bars painted grey around a white note.
 * The app always draws under them (it keeps its own top clear).
 */
describe("the phone draws under Android's bars", () => {
  it("asks for it in the page and tells Capacitor before the page loads", () => {
    const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/);
    expect(config.plugins?.SystemBars?.initialViewportFitValueHint).toBe("cover");
  });

  it("keeps it through the phone's start", async () => {
    document.head.innerHTML = `<meta name="viewport" content="${COVER}">`;
    await installPhone();
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(COVER);
  });
});

describe("the phone's start", () => {
  // It once stopped on "Sign in to Dropbox", and the app couldn't be used without it.
  it("opens the app with no Dropbox connected, and starts sync's worker", async () => {
    document.body.innerHTML = "";
    start.mockClear();
    await installPhone();
    expect(start).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toMatch(/Dropbox/);
  });
});

describe("where a start keeps the notes", () => {
  /** A start on Android, or of the page in a browser, where there is no folder to pick. */
  const startOf = async (native: boolean) => {
    vi.resetModules();
    device.native = native;
    device.stateChange = null;
    screens.askStorage.mockClear();
    screens.askFolderAgain.mockClear();
    reachable.mockClear();
    reached.mockClear();
    checkOutside.mockClear();
    disk.written.length = 0;
    disk.addressed.length = 0;
    await (await import("../../src/phone/install")).installPhone();
    device.native = true;
  };
  const fresh = () => Object.assign(disk, { state: [], choice: null, under: {}, files: {} });

  it("asks a fresh install once, and keeps the answer", async () => {
    fresh();
    await startOf(true);
    expect(screens.askStorage).toHaveBeenCalledOnce();
    expect(disk.written).toContainEqual(["state/storage.json", '{"kind":"app"}']);
  });

  it("keeps a folder picked at first launch as the choice", async () => {
    fresh();
    const picked = { tree: "t", root: "primary:Documents/Boojy Notes" };
    screens.askStorage.mockResolvedValueOnce(picked);
    await startOf(true);
    expect(disk.written).toContainEqual([
      "state/storage.json",
      JSON.stringify({ kind: "folder", folder: picked }),
    ]);
  });

  // Their notes are in the app's storage: a welcome screen would be a question about notes they already have.
  it("never asks an install that already holds notes or a Dropbox connection", async () => {
    Object.assign(disk, { state: ["ids.json"], choice: null });
    await startOf(true);
    expect(screens.askStorage).not.toHaveBeenCalled();
    expect(disk.written).toEqual([]);
  });

  it("asks nothing, and Android nothing, in a browser", async () => {
    fresh();
    await startOf(false);
    expect(screens.askStorage).not.toHaveBeenCalled();
    expect(reachable).not.toHaveBeenCalled();
  });

  it("asks for the folder again when the chosen one is out of reach, and never falls back", async () => {
    Object.assign(disk, { state: ["ids.json"], choice: "folder" });
    reachable.mockResolvedValueOnce(null);
    await startOf(false);
    expect(screens.askFolderAgain).toHaveBeenCalledOnce();
    expect(screens.askStorage).not.toHaveBeenCalled();
    // The folder chosen again is the choice's from now on; it is never the app's storage.
    expect(disk.written).toEqual([
      [
        "state/storage.json",
        JSON.stringify({
          kind: "folder",
          folder: { tree: "again", root: "primary:Documents/Again" },
        }),
      ],
    ]);
  });

  describe("with more than one storage location", () => {
    const T1 = { tree: "t1", root: "primary:Documents/Personal" };
    const T2 = { tree: "t2", root: "primary:Documents/Work" };
    const listed = (open: string) =>
      JSON.stringify({ open, list: [{ id: "main" }, { id: "work", name: "Work" }] });
    const WORK = "locations/work/state/storage.json";
    afterEach(() => {
      disk.files = {};
    });

    it("builds the app for the open one: its own choice, its own vault, the first's untouched", async () => {
      Object.assign(disk, {
        state: ["ids.json"],
        choice: "app",
        under: {},
        files: { "state/locations.json": listed("work"), [WORK]: '{"kind":"app"}' },
      });
      await startOf(true);
      expect(screens.askStorage).not.toHaveBeenCalled();
      expect(disk.addressed).toEqual(["locations/work/vault"]);
      expect(disk.written).toEqual([]);
    });

    it("asks a new location where to keep its notes, and keeps the answer in its own state", async () => {
      Object.assign(disk, {
        state: ["ids.json"],
        choice: "app",
        under: {},
        files: { "state/locations.json": listed("work") },
      });
      screens.askStorage.mockResolvedValueOnce(T2);
      await startOf(true);
      expect(disk.written).toEqual([[WORK, JSON.stringify({ kind: "folder", folder: T2 })]]);
      // The first location's folder, had it one, is spared when the new one is kept.
      expect(reachable).toHaveBeenLastCalledWith(expect.anything(), T2, []);
    });

    it("asks a location added later for its folder alone, under its name", async () => {
      Object.assign(disk, {
        state: ["ids.json"],
        choice: "app",
        under: {},
        files: { "state/locations.json": listed("work") },
      });
      await startOf(true);
      expect(screens.askStorage).toHaveBeenCalledWith("Work", null, "Work");
    });

    describe("listed, opened and added from Home", () => {
      type Rows = { id: string; name: string; open: boolean; cloud: boolean }[];
      const api = () =>
        (
          window as unknown as {
            boojyPhoneAPI: {
              locations: {
                list(): Promise<Rows>;
                open(id: string, saved: () => Promise<unknown>): Promise<void>;
                add(name: string, saved: () => Promise<unknown>): Promise<void>;
              };
            };
          }
        ).boojyPhoneAPI.locations;
      const lists = () => disk.written.filter(([path]) => path === "state/locations.json");
      const two = async (extra: Record<string, string> = {}) => {
        Object.assign(disk, {
          state: ["ids.json"],
          choice: "app",
          under: {},
          files: { "state/locations.json": listed("main"), [WORK]: '{"kind":"app"}', ...extra },
        });
        await startOf(true);
      };

      // The first has no name of its own until it is renamed: it reads as Home's heading does.
      it("names each one: its own name, else its Dropbox folder, else Phone", async () => {
        await two();
        expect(await api().list()).toEqual([
          { id: "main", name: "Phone", open: true, cloud: false },
          { id: "work", name: "Work", open: false, cloud: false },
        ]);
        await two({ "state/binding.json": JSON.stringify({ folder: "Personal" }) });
        expect((await api().list())[0]).toMatchObject({ name: "Personal", cloud: true });
        await two({ "state/binding.json": JSON.stringify({ folder: "" }) });
        expect((await api().list())[0].name).toBe("Boojy Notes");
        // One with a name of its own that syncs keeps the name, and is a cloud.
        await two({ "locations/work/state/binding.json": JSON.stringify({ folder: "Team" }) });
        expect((await api().list())[1]).toMatchObject({ name: "Work", cloud: true });
      });

      it("is one location, listed, on a phone that never added another", async () => {
        Object.assign(disk, { state: ["ids.json"], choice: "app", under: {}, files: {} });
        await startOf(true);
        expect(await api().list()).toEqual([
          { id: "main", name: "Phone", open: true, cloud: false },
        ]);
      });

      it("opens another only once the edits waiting are saved, by writing which is open", async () => {
        await two();
        const saved = vi.fn(async () => {
          expect(lists()).toEqual([]);
        });
        await api().open("work", saved);
        expect(saved).toHaveBeenCalledOnce();
        expect(lists()).toEqual([["state/locations.json", listed("work")]]);
        expect(() => api().open("nowhere", saved)).toThrow(/No such/);
      });

      it("adds one under a new id and opens it, the rest of the list kept", async () => {
        await two();
        await api().add("  Private ", async () => {});
        const { open, list } = JSON.parse(lists()[0][1]);
        expect(list.slice(0, 2)).toEqual([{ id: "main" }, { id: "work", name: "Work" }]);
        expect(list[2]).toEqual({ id: open, name: "Private" });
        expect(open).toMatch(/^[a-z0-9]+$/);
      });

      it("refuses a name another location shows, writing nothing", async () => {
        await two();
        await expect(api().add("work", async () => {})).rejects.toThrow(/Another location/);
        await expect(api().add("Phone", async () => {})).rejects.toThrow(/Another location/);
        expect(lists()).toEqual([]);
      });
    });

    it("opens the folder the open location chose, never another's", async () => {
      Object.assign(disk, {
        state: ["ids.json"],
        choice: "folder",
        under: { folder: T1 },
        files: {
          "state/locations.json": listed("main"),
          [WORK]: JSON.stringify({ kind: "folder", folder: T2 }),
        },
      });
      await startOf(true);
      expect(reached).toHaveBeenCalledWith(T1);
      expect(reachable).not.toHaveBeenCalled();
      expect(disk.written).toEqual([]);
    });

    // A choice from before the folder was kept: Android's grant was the only record of it.
    it("takes the grant no other location holds for a folder chosen before it was kept", async () => {
      Object.assign(disk, {
        state: ["ids.json"],
        choice: "folder",
        under: {},
        files: {
          "state/locations.json": listed("main"),
          [WORK]: JSON.stringify({ kind: "folder", folder: T2 }),
        },
      });
      reachable.mockResolvedValueOnce(T1);
      await startOf(true);
      expect(reachable).toHaveBeenCalledWith(expect.anything(), undefined, ["t2"]);
      expect(disk.written).toEqual([
        ["state/storage.json", JSON.stringify({ kind: "folder", folder: T1 })],
      ]);
    });

    it("asks for the open location's folder again when it is out of reach, sparing the others'", async () => {
      Object.assign(disk, {
        state: ["ids.json"],
        choice: "folder",
        under: { folder: T1 },
        files: {
          "state/locations.json": listed("main"),
          [WORK]: JSON.stringify({ kind: "folder", folder: T2 }),
        },
      });
      reached.mockResolvedValueOnce(null);
      await startOf(true);
      expect(screens.askFolderAgain).toHaveBeenCalledOnce();
      expect(reachable).toHaveBeenCalledWith(
        expect.anything(),
        { tree: "again", root: "primary:Documents/Again" },
        ["t2"],
      );
    });
  });

  it("looks for other apps' changes when the app comes back to the front, with a folder", async () => {
    Object.assign(disk, { state: ["ids.json"], choice: "folder" });
    reachable.mockResolvedValueOnce({ tree: "t", root: "primary:Documents/Boojy Notes" });
    await startOf(true);
    expect(checkOutside).not.toHaveBeenCalled();
    device.stateChange?.({ isActive: true });
    expect(checkOutside).toHaveBeenCalledWith({ thorough: true });
  });

  // Nothing else writes the app's own storage.
  it("never looks when the notes are in the app's own storage", async () => {
    Object.assign(disk, { state: ["ids.json"], choice: "app" });
    await startOf(true);
    expect(device.stateChange).toBeNull();
  });

  const TO = { tree: "to", root: "primary:Documents/Boojy Notes" };
  const storage = () => disk.written.filter(([path]) => path === "state/storage.json");

  describe("with a move to a folder under way", () => {
    it("copies, makes the folder the choice, then clears the app's copies, in that order", async () => {
      Object.assign(disk, { state: ["ids.json"], choice: "app", under: { moving: TO } });
      const order: string[] = [];
      move.copyNotes.mockImplementationOnce(async () => {
        order.push(`copy, ${storage().length} written`);
      });
      move.clearCopied.mockImplementationOnce(async () => {
        order.push(`clear after ${storage().at(-1)?.[1]}`);
      });
      await startOf(true);
      expect(order).toEqual([
        "copy, 0 written",
        `clear after ${JSON.stringify({ kind: "folder", folder: TO, clearing: true })}`,
      ]);
      expect(storage().at(-1)?.[1]).toBe(JSON.stringify({ kind: "folder", folder: TO }));
      expect(reachable).toHaveBeenCalledWith(expect.anything(), TO, []);
      expect(screens.sayNotMoved).not.toHaveBeenCalled();
      // The app is in the folder: other apps' changes are looked for.
      expect(device.stateChange).not.toBeNull();
    });

    it("failed, keeps the notes in the app's storage, gives the folder back and says so", async () => {
      Object.assign(disk, { state: ["ids.json"], choice: "app", under: { moving: TO } });
      screens.sayNotMoved.mockClear();
      move.clearCopied.mockClear();
      released.length = 0;
      move.copyNotes.mockRejectedValueOnce(new Error("No space left"));
      await startOf(true);
      expect(storage()).toEqual([["state/storage.json", '{"kind":"app"}']]);
      expect(released).toEqual(["to"]);
      expect(screens.sayNotMoved).toHaveBeenCalledWith("No space left");
      expect(move.clearCopied).not.toHaveBeenCalled();
      expect(device.stateChange).toBeNull();
    });

    it("killed while clearing, clears at the next start", async () => {
      Object.assign(disk, { state: ["ids.json"], choice: "folder", under: { clearing: true } });
      move.copyNotes.mockClear();
      move.clearCopied.mockClear();
      reachable.mockResolvedValueOnce(TO);
      await startOf(true);
      expect(move.copyNotes).not.toHaveBeenCalled();
      expect(move.clearCopied).toHaveBeenCalledOnce();
      expect(storage()).toEqual([
        ["state/storage.json", JSON.stringify({ kind: "folder", folder: TO })],
      ]);
    });

    // The folder is where the notes are from the flip on, whatever the clearing does.
    it("opens the folder even when clearing fails, and tries again next time", async () => {
      Object.assign(disk, { state: ["ids.json"], choice: "folder", under: { clearing: true } });
      move.clearCopied.mockRejectedValueOnce(new Error("busy"));
      reachable.mockResolvedValueOnce(TO);
      await startOf(true);
      expect(storage()).toEqual([]);
      expect(device.stateChange).not.toBeNull();
    });
  });

  describe("Move notes to a folder", () => {
    type Move = (saved: () => Promise<unknown>) => Promise<string>;
    const offered = () =>
      (window as unknown as { boojyPhoneAPI: { moveToFolder?: Move } }).boojyPhoneAPI.moveToFolder;
    const inApp = async () => {
      Object.assign(disk, { state: ["ids.json"], choice: "app", under: {} });
      await startOf(true);
      released.length = 0;
      return offered() as Move;
    };

    it("is offered only while the notes are in the app's storage, on Android", async () => {
      expect(await inApp()).toBeTypeOf("function");
      Object.assign(disk, { state: ["ids.json"], choice: "app", under: {} });
      await startOf(false);
      expect(offered()).toBeUndefined();
      Object.assign(disk, { state: ["ids.json"], choice: "folder", under: {} });
      reachable.mockResolvedValueOnce(TO);
      await startOf(true);
      expect(offered()).toBeUndefined();
    });

    it("records the move only once the edits waiting are saved", async () => {
      const moveToFolder = await inApp();
      Object.assign(picker, { answer: { picked: true, ...TO }, holds: [".nomedia"] });
      const saved = vi.fn(async () => {
        expect(storage()).toEqual([]);
      });
      expect(await moveToFolder(saved)).toBe("moving");
      expect(saved).toHaveBeenCalledOnce();
      expect(storage()).toEqual([
        ["state/storage.json", JSON.stringify({ kind: "app", moving: TO })],
      ]);
    });

    // Nothing is merged: whose note wins is a question nobody was asked.
    it("refuses a folder that holds anything, and gives it back", async () => {
      const moveToFolder = await inApp();
      Object.assign(picker, { answer: { picked: true, ...TO }, holds: ["Diary.md"] });
      const saved = vi.fn(async () => {});
      expect(await moveToFolder(saved)).toBe("not-empty");
      expect(released).toEqual(["to"]);
      expect(saved).not.toHaveBeenCalled();
      expect(storage()).toEqual([]);
    });

    it("does nothing when Android's screen is left, or the folder is not on the phone", async () => {
      const moveToFolder = await inApp();
      Object.assign(picker, { answer: { picked: false }, holds: [] });
      expect(await moveToFolder(async () => {})).toBe("cancelled");
      Object.assign(picker, { answer: { picked: false, refused: "cloud" }, holds: [] });
      expect(await moveToFolder(async () => {})).toBe("refused");
      expect(storage()).toEqual([]);
    });
  });
});
