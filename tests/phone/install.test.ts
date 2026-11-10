/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/** The app's private storage as a start finds it: `state/`'s files, and the storage choice. */
const disk = vi.hoisted(() => ({
  state: [] as string[],
  choice: null as string | null,
  written: [] as [string, string][],
}));
vi.mock("../../src/phone/files", () => ({
  capacitorFiles: () => ({
    recover: async () => {},
    read: async (path: string) =>
      path === "state/storage.json" && disk.choice
        ? new TextEncoder().encode(JSON.stringify({ kind: disk.choice }))
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
  createPhoneVault: () => ({ api: {}, store: {}, checkOutside }),
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
}));
vi.mock("../../src/phone/storageScreens", () => screens);
const reachable = vi.hoisted(() =>
  vi.fn(async () => null as { tree: string; root: string } | null),
);
vi.mock("../../src/phone/folderFiles", () => ({
  FolderAccess: {},
  reachableFolder: reachable,
  folderFiles: () => ({ recover: async () => {} }),
  folderAddress: () => (rel: string) => rel,
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
  const fresh = () => Object.assign(disk, { state: [], choice: null });

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
});
