/**
 * The watcher scales: a vault of hundreds of notes is watched without holding
 * a file open per note. It held one each (chokidar without fsevents), which
 * kept iCloud from evicting any note while the app ran and, near the macOS
 * default of 256 open files, would make saves and the watcher fail. Needs the
 * real app: what is measured is the main process's open files.
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { END_OF_LINE, launchApp, noteText, waitForFile } from "./harness";

const NOTES = 500;

function openFilesUnder(pid: number, dir: string): number {
  const out = execFileSync("lsof", ["-p", String(pid), "-Fn"], { encoding: "utf-8" });
  return out.split("\n").filter((line) => line.startsWith("n") && line.includes(dir)).length;
}

test("a vault of 500 notes is watched without a file held open per note", async () => {
  test.skip(process.platform !== "darwin", "counts open files with lsof");
  test.setTimeout(90_000);
  const files: Record<string, string> = {};
  for (let i = 0; i < NOTES; i++) {
    const folder = i % 5 === 0 ? "" : `Folder ${i % 5}/`;
    files[`${folder}Note ${String(i).padStart(3, "0")}.md`] = `Note ${i}.\n`;
  }
  const h = await launchApp(files);
  try {
    const pid = await h.app.evaluate(() => process.pid);
    const vaultDir = h.vault.file("");
    await expect.poll(() => openFilesUnder(pid, vaultDir)).toBeLessThan(10);

    // Still watching: an outside edit to one of them reaches the app, and a
    // save of the open note lands.
    await h.openNote("Note 005");
    h.vault.write("Note 005.md", "Note 5, from outside.\n");
    await expect.poll(() => noteText(h.page), { timeout: 8_000 }).toBe("Note 5, from outside.");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Typed.");
    await waitForFile(h.vault.file("Note 005.md"), (t) => t.includes("Typed."));
    expect(openFilesUnder(pid, vaultDir)).toBeLessThan(10);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
