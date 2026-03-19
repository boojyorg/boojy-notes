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
      thresholds: {
        lines: 60,
        branches: 50,
        functions: 55,
        statements: 60,
      },
    },
  },
});
