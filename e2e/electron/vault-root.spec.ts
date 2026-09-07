/**
 * The vault root's edge cases. A vault that lives under a dot-directory is
 * watched like any other (the old ignore regex matched the root itself, so
 * `~/.notes` got no watcher and no error). A vault the user chose that is
 * missing (an unmounted volume) is never recreated: the app opens it empty,
 * a write refuses and says so, and nothing appears on disk.
 */
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { launchApp, sidebarNoteTitles, sleep, SETTLE_MS } from "./harness";

test("a vault under a dot-directory is watched", async () => {
  const h = await launchApp({ "Welcome.md": "Hello.\n" }, { vaultDir: ".hidden/vault" });
  try {
    expect(await sidebarNoteTitles(h.page)).toEqual(["Welcome"]);

    fs.writeFileSync(h.vault.file("From outside.md"), "Arrived.\n");

    await expect
      .poll(() => sidebarNoteTitles(h.page), { timeout: 5_000 })
      .toEqual(["From outside", "Welcome"]);
    expect(h.pageErrors).toEqual([]);
  } finally {
    await h.close();
  }
});

test("a chosen vault that is missing is never recreated; a write says it failed", async () => {
  const h = await launchApp({}, { createVault: false });
  try {
    expect(fs.existsSync(h.vault.dir)).toBe(false);
    expect(await sidebarNoteTitles(h.page)).toEqual([]);

    await h.page.getByRole("button", { name: "New note" }).click();
    await expect(h.page.getByText(/Failed to save note to disk/)).toBeVisible({
      timeout: 5_000,
    });
    await sleep(SETTLE_MS);

    expect(fs.existsSync(h.vault.dir)).toBe(false);
    // The failed write is logged, once per note, and nothing else goes wrong.
    expect(h.pageErrors.length).toBeGreaterThan(0);
    for (const err of h.pageErrors) expect(err).toMatch(/write failed .* notes folder is missing/);
  } finally {
    await h.close();
  }
});
