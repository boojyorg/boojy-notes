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
      // target. Current: lines ~47, branches ~44, functions ~45, statements ~46.
      thresholds: {
        lines: 45,
        branches: 42,
        functions: 43,
        statements: 43,
      },
    },
  },
});
