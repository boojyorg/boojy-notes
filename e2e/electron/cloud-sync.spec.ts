/**
 * A vault inside a sync folder (Dropbox first): what a sync client does to
 * files, done here as the plain file operations it is. A downloaded version
 * lands by being written elsewhere and renamed over the note; a clash leaves
 * a conflicted copy beside it; a first sync lands dozens of files at once;
 * Finder and Dropbox leave an invisible `Icon\r` in folders. None of it may
 * lose typing, rewrite a byte the user did not change, or clutter the tree.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  launchApp,
  noteText,
  sidebarNoteTitles,
  sleep,
  waitForFile,
} from "./harness";

/** A sync client's download: written in its own hidden cache, renamed over the note. */
function syncReplace(vaultDir: string, rel: string, text: string) {
  const cache = path.join(vaultDir, ".dropbox.cache");
  fs.mkdirSync(cache, { recursive: true });
  const tmp = path.join(cache, `dl-${Date.now()}.tmp`);
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, path.join(vaultDir, rel));
}

test("a synced version renamed over the open note is shown, with no conflicted copy", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    await h.openNote("Alpha");
    syncReplace(h.vault.dir, "Alpha.md", "Alpha body.\nFrom the other Mac.\n");
    await expect
      .poll(() => noteText(h.page), { timeout: 5_000 })
      .toBe("Alpha body.\nFrom the other Mac.");
    await sleep(SETTLE_MS);
    expect(h.vault.list()).toEqual(["Alpha.md"]);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body.\nFrom the other Mac.\n");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("typing goes on across a synced version of another note, and neither is lost", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Beta.md": "Beta body.\n" });
  try {
    await h.openNote("Alpha");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" one", { delay: 80 });
    syncReplace(h.vault.dir, "Beta.md", "Beta body.\nSynced.\n");
    await h.page.keyboard.type(" two", { delay: 80 });
    await waitForFile(h.vault.file("Alpha.md"), (t) => t.includes("two"));
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body. one two\n");
    expect(h.vault.read("Beta.md")).toBe("Beta body.\nSynced.\n");
    expect(h.vault.list().sort()).toEqual(["Alpha.md", "Beta.md"]);
    expect(await noteText(h.page)).toBe("Alpha body. one two");
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a Dropbox conflicted copy is its own note; the original is untouched", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    const copy = "Alpha (Tyr's conflicted copy 2026-09-25).md";
    h.vault.write(copy, "Alpha body.\nEdited on the other Mac.\n");
    await expect
      .poll(async () => (await sidebarNoteTitles(h.page)).sort(), { timeout: 5_000 })
      .toEqual(["Alpha", "Alpha (Tyr's conflicted copy 2026-09-25)"]);
    await sleep(SETTLE_MS);
    expect(h.vault.read("Alpha.md")).toBe("Alpha body.\n");
    expect(h.vault.list().sort()).toEqual([copy, "Alpha.md"].sort());
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a first sync landing forty notes at once shows every one, and writes none back", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n" });
  try {
    const before = fs.statSync(h.vault.file("Alpha.md")).mtimeMs;
    fs.mkdirSync(path.join(h.vault.dir, "Synced"));
    for (let i = 1; i <= 40; i++) {
      fs.writeFileSync(path.join(h.vault.dir, "Synced", `Note ${i}.md`), `Body ${i}.\n`);
    }
    await h.page.getByRole("treeitem", { name: "Synced" }).click();
    await expect
      .poll(async () => (await sidebarNoteTitles(h.page)).length, { timeout: 10_000 })
      .toBe(41);
    await sleep(SETTLE_MS);
    const synced = fs.readdirSync(path.join(h.vault.dir, "Synced"));
    expect(synced).toHaveLength(40);
    for (const f of synced) {
      expect(fs.readFileSync(path.join(h.vault.dir, "Synced", f), "utf-8")).toMatch(
        /^Body \d+\.\n$/,
      );
    }
    expect(fs.statSync(h.vault.file("Alpha.md")).mtimeMs).toBe(before);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("the invisible Icon file Finder and Dropbox leave in a folder is not an other file", async () => {
  const h = await launchApp({ "Alpha.md": "Alpha body.\n", "Uni/Week 1.md": "x\n" });
  try {
    fs.writeFileSync(path.join(h.vault.dir, "Icon\r"), "");
    fs.writeFileSync(path.join(h.vault.dir, "Uni", "Icon\r"), "");
    fs.writeFileSync(h.vault.file("handout.pdf"), "%PDF\n");
    await h.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(h.page.getByRole("treeitem", { name: "handout.pdf" })).toBeVisible();
    await h.page.getByRole("treeitem", { name: "Uni" }).click();
    await expect(h.page.getByRole("treeitem", { name: "Week 1" })).toBeVisible();
    await expect(h.page.getByRole("treeitem", { name: /^Icon/ })).toHaveCount(0);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
