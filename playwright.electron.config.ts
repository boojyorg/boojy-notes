import { defineConfig } from "@playwright/test";

/**
 * The real-Electron core-journey suite (`e2e/electron/`). Runs the built desktop
 * app against a throwaway vault. Each test owns its own app process, vault
 * and userData, so two tests can run side by side without touching each
 * other; two workers halve the wall time (measured 2026-09-06: 113 s to 57 s
 * locally, four runs in a row green), because most of a test is waiting on
 * the app's own debounces, not on the CPU. More workers than two showed
 * diminishing returns and leave less headroom on a 4 vCPU CI runner. Files
 * are the unit of distribution; tests inside a file still run in order.
 * Build first: `pnpm test:electron` does.
 *
 * The app runs with its window hidden (harness.ts sets `BOOJY_TEST_HIDDEN=1`)
 * so a routine run never takes over the desktop; `BOOJY_TEST_HEADED=1` shows
 * the window for watching a run locally. No spec needs real OS focus, the
 * clipboard or native menus, so there is no separate headed project.
 */
export default defineConfig({
  testDir: "./e2e/electron",
  // Fetches the Electron binary once, before the workers race to (global-setup.ts).
  globalSetup: "./e2e/electron/global-setup.ts",
  fullyParallel: false,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 40_000,
  expect: { timeout: 5_000 },
});
