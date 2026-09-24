import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.ELECTRON_DISABLE
      ? []
      : [
          electron([
            { entry: "electron/main.js" },
            {
              entry: "electron/preload.js",
              onstart(args) {
                args.reload();
              },
              // A sandboxed preload runs as a classic script, never a module.
              // Vite 8 (Rolldown) emits ESM for this `"type": "module"`
              // package unless told otherwise, and an ESM preload fails to
              // load, which leaves the window with no `electronAPI` at all.
              vite: {
                build: {
                  lib: false,
                  rolldownOptions: {
                    input: "electron/preload.js",
                    output: { format: "cjs", entryFileNames: "preload.js" },
                  },
                },
              },
            },
          ]),
          renderer(),
        ]),
  ],
});
