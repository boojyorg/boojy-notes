import { defineConfig } from "@playwright/test";

/** `pnpm screenshots`: the README and website images (hero.spec.ts). */
export default defineConfig({
  testDir: ".",
  globalSetup: "../../e2e/electron/global-setup.ts",
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/screenshots",
});
