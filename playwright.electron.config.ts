import { defineConfig } from "@playwright/test";

/**
 * The real-Electron core-journey suite (`e2e/electron/`). Runs the built desktop
 * app against a throwaway vault. Each test owns its own app process, vault
 * and userData, so two tests can run side by side without touching each
 * other; two workers halve the wall time (measured 2026-09-06: 113 s to 57 s
 * locally, four runs in a row green), because most of a test is waiting on
 * the app's own debounces, not on the CPU. More workers than two showed
 * diminishing returns and leave less headroom on a 4 vCPU CI runner. Tests,
 * not files, are the unit of distribution (`fullyParallel`): no spec shares
 * state between its tests (each launches its own app in `beforeEach` or its
 * body), and CI splits the suite across runners with `--shard`, which by file
 * left one runner with a minute more than another (2026-09-24).
 * Build first: `pnpm test:electron` does.
 *
 * The app runs with its window hidden (harness.ts sets `BOOJY_TEST_HIDDEN=1`)
 * so a routine run never takes over the desktop; `BOOJY_TEST_HEADED=1` shows
 * the window for watching a run locally, and on CI it is always shown: a
 * hidden window on the Linux runner ticks no animation frames and every
 * Playwright action stalled on one (harness.ts has the numbers). No spec
 * needs real OS focus, the clipboard or native menus, so there is no separate
 * headed project.
 */
export default defineConfig({
  testDir: "./e2e/electron",
  // Fetches the Electron binary once, before the workers race to (global-setup.ts).
  globalSetup: "./e2e/electron/global-setup.ts",
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Its own report and results folders: CI keeps them from a failed shard.
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/electron" }]],
  outputDir: "test-results/electron",
  timeout: 40_000,
  expect: { timeout: 5_000 },
});
