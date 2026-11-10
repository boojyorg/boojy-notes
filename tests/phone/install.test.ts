/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/** The app's private storage as a start finds it: `state/`'s files, and the storage choice. */
const disk = vi.hoisted(() => ({
  state: [] as string[],
  choice: null as string | null,
  /** What a move under way adds to the choice's file. */
  under: {} as Record<string, unknown>,
  written: [] as [string, string][],
}));
vi.mock("../../src/phone/files", () => ({
  capacitorFiles: () => ({
    recover: async () => {},
    read: async (path: string) =>
      path === "state/storage.json" && disk.choice
        ? new TextEncoder().encode(JSON.stringify({ kind: disk.choice, ...disk.under }))
        : null,
    list: async (dir: string) =>
      dir === "state" ? disk.state.map((name) => ({ name, kind: "file", mtime: 0, size: 1 })) : [],
    write: async (path: string, bytes: Uint8Array) => {
      disk.written.push([path, new TextDecoder().decode(bytes)]);
    },
  }),
  fileAddress: async () => (rel: string) => `https://localhost/_capacitor_file_/vault/${rel}`,
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
    checkOutside.mockClear();
    disk.written.length = 0;
    await (await import("../../src/phone/install")).installPhone();
    device.native = true;
  };
  const fresh = () => Object.assign(disk, { state: [], choice: null, under: {} });

  it("asks a fresh install once, and keeps the answer", async () => {
    fresh();
    await startOf(true);
    expect(screens.askStorage).toHaveBeenCalledOnce();
    expect(disk.written).toContainEqual(["state/storage.json", '{"kind":"app"}']);
  });

  it("keeps a folder picked at first launch as the choice", async () => {
    fresh();
    screens.askStorage.mockResolvedValueOnce({ tree: "t", root: "primary:Documents/Boojy Notes" });
    await startOf(true);
    expect(disk.written).toContainEqual(["state/storage.json", '{"kind":"folder"}']);
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
    expect(disk.written).toEqual([]);
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
      expect(order).toEqual(["copy, 0 written", 'clear after {"kind":"folder","clearing":true}']);
      expect(storage().at(-1)?.[1]).toBe('{"kind":"folder"}');
      expect(reachable).toHaveBeenCalledWith(expect.anything(), TO);
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
      expect(storage()).toEqual([["state/storage.json", '{"kind":"folder"}']]);
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
