import { defineConfig } from "@playwright/test";

/**
 * The real-Electron core-journey suite (`e2e/electron/`). Runs the built desktop
 * app against a throwaway vault, one test at a time: each test owns an app
 * process, and the assertions are about files on disk, so parallel workers
 * would only add noise. Build first: `pnpm test:electron` does.
 *
 * Two projects. `hidden` (the default) runs the app with its window hidden so a
 * routine run never takes over the desktop. `headed` runs the few specs that
 * genuinely need the foreground (`*.headed.spec.ts`: real OS focus, the system
 * clipboard, native menus) with a visible window; opt in with
 * `pnpm test:electron:headed`.
 */
export default defineConfig({
  testDir: "./e2e/electron",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  timeout: 40_000,
  expect: { timeout: 5_000 },
  projects: [
    { name: "hidden", testIgnore: ["**/*.headed.spec.ts"] },
    { name: "headed", testMatch: ["**/*.headed.spec.ts"] },
  ],
});
