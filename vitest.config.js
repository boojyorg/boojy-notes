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
      // The denominator is every source file, imported by a test or not. Vitest 4
      // only reports files the tests load unless told otherwise, which hid a
      // quarter of the source (BoojyNotes.jsx, EditorArea.jsx, electron/main.js
      // among it) and made the percentages read 12-15 points too high.
      include: ["src/**", "electron/**"],
      // Floors sit just below the honest actuals, measured 2026-09-23 on master
      // d1801e2: lines 67.8, statements 66.5, branches 65.0, functions 62.8. A
      // regression guard to ratchet UP as code gets covered, never a target,
      // and never lifted by excluding a source directory.
      thresholds: {
        lines: 66,
        branches: 63,
        functions: 61,
        statements: 65,
      },
    },
  },
});
