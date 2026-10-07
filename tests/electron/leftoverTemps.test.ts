import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recoverLeftoverTemps } from "../../electron/leftoverTemps";

// A save the app died in the middle of leaves `.~Name.md.tmp`. When the vault
// opens, a superseded one goes; one that may hold the last save is kept as a
// note of its own. Nothing is deleted that a newer note does not replace.
let vault: string;
const now = new Date(2026, 9, 7, 12, 0, 0);
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000);
const put = (rel: string, text: string, when: Date) => {
  const full = path.join(vault, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, text);
  fs.utimesSync(full, when, when);
  return full;
};
const names = (rel = "") => fs.readdirSync(path.join(vault, rel)).sort();

beforeEach(() => {
  vault = fs.mkdtempSync(path.join(os.tmpdir(), "boojy-temps-"));
});
afterEach(() => fs.rmSync(vault, { recursive: true, force: true }));

describe("recoverLeftoverTemps", () => {
  it("removes a temp file its note has superseded: older, the same text, or empty", () => {
    put("Old.md", "kept\n", at(5));
    put(".~Old.md.tmp", "older draft\n", at(10));
    put("Same.md", "same\n", at(10));
    put(".~Same.md.tmp", "same\n", at(5));
    put(".~Empty.md.tmp", "", at(5));
    const { removed, recovered } = recoverLeftoverTemps(vault, now);
    expect(removed).toHaveLength(3);
    expect(recovered).toEqual([]);
    expect(names()).toEqual(["Old.md", "Same.md"]);
  });

  it("keeps one newer than its note, or with no note, as a recovered note beside it", () => {
    put("Folder/Plan.md", "the saved plan\n", at(10));
    put("Folder/.~Plan.md.tmp", "the plan, edited\n", at(5));
    put(".~Lost.md.tmp", "only copy\n", at(5));
    const { recovered } = recoverLeftoverTemps(vault, now);
    expect(recovered).toHaveLength(2);
    expect(names("Folder")).toEqual(["Plan (recovered 2026-10-07).md", "Plan.md"]);
    expect(fs.readFileSync(path.join(vault, "Folder/Plan.md"), "utf-8")).toBe("the saved plan\n");
    expect(
      fs.readFileSync(path.join(vault, "Folder/Plan (recovered 2026-10-07).md"), "utf-8"),
    ).toBe("the plan, edited\n");
    expect(names()).toContain("Lost (recovered 2026-10-07).md");
  });

  it("never takes a name a note already has", () => {
    put("Lost (recovered 2026-10-07).md", "an earlier recovery\n", at(60));
    put(".~Lost.md.tmp", "only copy\n", at(5));
    recoverLeftoverTemps(vault, now);
    expect(names()).toEqual(["Lost (recovered 2026-10-07) 2.md", "Lost (recovered 2026-10-07).md"]);
  });

  it("leaves alone a temp file under a minute old (a save in flight), a non-note's, and dot-directories", () => {
    put(".~Busy.md.tmp", "being written\n", at(0.5));
    put(".~image.png.tmp", "not a note\n", at(5));
    put(".obsidian/.~workspace.md.tmp", "not walked\n", at(5));
    put("attachments/.~a.md.tmp", "not walked\n", at(5));
    const { removed, recovered } = recoverLeftoverTemps(vault, now);
    expect(removed).toEqual([]);
    expect(recovered).toEqual([]);
  });
});
