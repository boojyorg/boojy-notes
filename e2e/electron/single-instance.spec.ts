/**
 * Only one copy of the app runs at a time (`requestSingleInstanceLock` in
 * main.js). A second launch against the same userData tells the first and
 * exits before it reads settings or the vault, so two watchers and two indexes
 * never write the same files.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { launchApp } from "./harness";

const here = path.dirname(fileURLToPath(import.meta.url));
const electronBinary: string = createRequire(import.meta.url)("electron");

test("a second launch hands over to the first and exits", async () => {
  const h = await launchApp({ "Welcome.md": "Hello.\n" });
  try {
    await h.app.evaluate(({ app }) => {
      const g = globalThis as { secondLaunches?: number };
      g.secondLaunches = 0;
      app.on("second-instance", () => {
        g.secondLaunches = (g.secondLaunches ?? 0) + 1;
      });
    });
    const display = await h.app.evaluate(() => process.env.DISPLAY);
    const settingsBefore = fs.readFileSync(path.join(h.userData, "settings.json"), "utf8");
    const vaultBefore = h.vault.list();

    const second = spawn(
      electronBinary,
      [path.join(here, "main-wrapper.mjs"), ...(process.env.CI ? ["--no-sandbox"] : [])],
      {
        env: {
          ...process.env,
          ...(display ? { DISPLAY: display } : {}),
          BOOJY_TEST_USERDATA: h.userData,
          BOOJY_TEST_HIDDEN: "1",
        },
        stdio: "ignore",
      },
    );
    const code = await new Promise<number | null>((resolve, reject) => {
      second.on("exit", resolve);
      second.on("error", reject);
    });
    expect(code).toBe(0);

    await expect
      .poll(() => h.app.evaluate(() => (globalThis as { secondLaunches?: number }).secondLaunches))
      .toBe(1);
    // Still the one window, and the second copy touched nothing of the first's.
    expect(await h.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
      1,
    );
    expect(fs.readFileSync(path.join(h.userData, "settings.json"), "utf8")).toBe(settingsBefore);
    expect(h.vault.list()).toEqual(vaultBefore);
    await expect(h.page.getByRole("button", { name: "New note", exact: true })).toBeVisible();
  } finally {
    await h.close();
  }
});
