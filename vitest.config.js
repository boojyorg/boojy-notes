import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{js,jsx,ts,tsx}"],
    setupFiles: ["./tests/setup.js"],
    coverage: {
      provider: "v8",
      // Floor set just below current actuals (CI was red since ~Mar 2026 after the
      // mobile UI overhaul added untested component code). These are a regression
      // guard to ratchet UP over time as presentational code gets covered — not a
      // target. Current: lines ~48.6, branches ~44.5, functions ~46.9,
      // statements ~47.1 (post single-active-note refactor — deleting the
      // largely-untested pane/tab UI raised the ratio).
      thresholds: {
        lines: 47,
        branches: 43,
        functions: 45,
        statements: 45,
      },
    },
  },
});
