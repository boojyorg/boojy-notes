/**
 * Saving a note never changes the file's permission bits.
 *
 * The permission bits are the user's (`chmod 600` on a private note, a vault
 * a group may only read), and the crash-safe save lands a fresh temp file
 * over the old one by rename. Reproduced on master 2026-09-09: an existing
 * 0600 note was 0644 after its first save. The rule now is that a save keeps
 * the bits the file has, a rename carries them to the new name, and a note
 * that never existed is made the way any new file is, from the umask alone.
 * Needs the real app: the write path is the main process's, reached through
 * the text-commit and write debounces. Windows has no bits to keep.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  END_OF_LINE,
  SETTLE_MS,
  expectNoTempFiles,
  launchApp,
  sleep,
  waitForFile,
} from "./harness";

test.skip(process.platform === "win32", "no permission bits on Windows");

const modeOf = (p: string) => (fs.statSync(p).mode & 0o777).toString(8);

test("a 0600 note is still 0600 after it is edited, and after it is renamed", async () => {
  const h = await launchApp({ "Private.md": "Mine.\n", "Shared.md": "Everyone's.\n" });
  try {
    fs.chmodSync(h.vault.file("Private.md"), 0o600);
    const ordinary = modeOf(h.vault.file("Shared.md"));
    expect(ordinary).not.toBe("600");

    await h.openNote("Private");
    await h.page.locator("[data-block-id]").first().click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" Still mine.");
    await waitForFile(h.vault.file("Private.md"), (t) => t === "Mine. Still mine.\n");
    await sleep(SETTLE_MS);
    expect(modeOf(h.vault.file("Private.md")), "after the edit").toBe("600");

    const title = h.page.getByRole("textbox", { name: "Note title" });
    await title.click();
    await h.page.keyboard.press(END_OF_LINE);
    await h.page.keyboard.type(" note");
    await waitForFile(h.vault.file("Private note.md"), (t) => t === "Mine. Still mine.\n", {
      label: "the renamed file",
    });
    await sleep(SETTLE_MS);
    expect(h.vault.exists("Private.md")).toBe(false);
    expect(modeOf(h.vault.file("Private note.md")), "after the rename").toBe("600");
    expect(modeOf(h.vault.file("Shared.md")), "the untouched note").toBe(ordinary);
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a new note gets ordinary permissions beside a private one", async () => {
  const h = await launchApp({ "Private.md": "Mine.\n" });
  try {
    fs.chmodSync(h.vault.file("Private.md"), 0o600);
    // What a newly created file gets on this machine, under this umask.
    fs.writeFileSync(h.vault.file(".reference"), "");
    const ordinary = modeOf(h.vault.file(".reference"));
    fs.unlinkSync(h.vault.file(".reference"));

    // A fresh profile opens on a draft; naming it makes the file.
    const title = h.page.getByRole("textbox", { name: "Note title" });
    await expect(title).toHaveText("");
    await title.click();
    await h.page.keyboard.type("Fresh");
    await waitForFile(h.vault.file("Fresh.md"), (t) => t === "", { label: "the new note" });
    await sleep(SETTLE_MS);

    expect(modeOf(h.vault.file("Fresh.md"))).toBe(ordinary);
    expect(modeOf(h.vault.file("Private.md"))).toBe("600");
    expectNoTempFiles(h.vault);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});
