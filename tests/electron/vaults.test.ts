/**
 * The vaults the app has opened: remembered in the order first opened, the
 * open one never forgotten, only a listed vault opened by path.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  forgetVault,
  isCloudPath,
  isKnownVault,
  rememberVault,
  vaultEntries,
} from "../../electron/vaults";

let root: string;
const dir = (name: string) => path.join(root, name);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-vaults-"));
  fs.mkdirSync(dir("Notes"));
  fs.mkdirSync(dir("University"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("rememberVault", () => {
  it("appends a new vault and never reorders a known one", () => {
    const list = rememberVault(rememberVault(undefined, dir("Notes")), dir("University"));
    expect(list).toEqual([dir("Notes"), dir("University")]);
    expect(rememberVault(list, dir("Notes"))).toEqual(list);
  });

  it("treats a trailing separator as the same folder", () => {
    const list = [dir("Notes")];
    expect(rememberVault(list, `${dir("Notes")}${path.sep}`)).toEqual(list);
  });

  it("drops junk a hand-edited config left", () => {
    expect(rememberVault([dir("Notes"), 7 as unknown as string], dir("Notes"))).toEqual([
      dir("Notes"),
    ]);
  });
});

describe("forgetVault", () => {
  it("removes another vault from the list", () => {
    const list = [dir("Notes"), dir("University")];
    expect(forgetVault(list, dir("University"), dir("Notes"))).toEqual([dir("Notes")]);
  });

  it("never forgets the open vault", () => {
    expect(forgetVault([dir("Notes")], dir("Notes"), dir("Notes"))).toEqual([dir("Notes")]);
  });
});

describe("isKnownVault", () => {
  it("answers only for listed paths", () => {
    expect(isKnownVault([dir("Notes")], dir("Notes"))).toBe(true);
    expect(isKnownVault([dir("Notes")], dir("University"))).toBe(false);
    expect(isKnownVault(undefined, dir("Notes"))).toBe(false);
  });
});

describe("vaultEntries", () => {
  it("names each vault by its folder and marks the open one", () => {
    const entries = vaultEntries([dir("Notes"), dir("University")], dir("University"));
    expect(entries.map((e) => [e.name, e.current, e.exists])).toEqual([
      ["Notes", false, true],
      ["University", true, true],
    ]);
  });

  it("lists the open vault even when nothing was remembered yet (an existing user)", () => {
    expect(vaultEntries(undefined, dir("Notes")).map((e) => e.name)).toEqual(["Notes"]);
  });

  it("keeps a missing vault, marked, and never makes it", () => {
    const gone = dir("Old Journal");
    const [entry] = vaultEntries([gone], dir("Notes"));
    expect(entry).toMatchObject({ name: "Old Journal", exists: false });
    expect(fs.existsSync(gone)).toBe(false);
  });
});

describe("isCloudPath", () => {
  it("knows iCloud Drive, the CloudStorage providers and Dropbox", () => {
    const home = path.join(path.sep, "Users", "tyr");
    expect(
      isCloudPath(path.join(home, "Library", "Mobile Documents", "com~apple~CloudDocs", "N")),
    ).toBe(true);
    expect(isCloudPath(path.join(home, "Library", "CloudStorage", "GoogleDrive-x", "N"))).toBe(
      true,
    );
    expect(isCloudPath(path.join(home, "Dropbox", "Notes"))).toBe(true);
    expect(isCloudPath(path.join(home, "Documents", "Boojy", "Notes"))).toBe(false);
  });
});
