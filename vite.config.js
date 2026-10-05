import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

// `--mode web` builds the browser target alone, without Electron, and
// `--mode tweak` opens the desktop app with the ?tweak panel. Modes rather
// than `VAR=1 vite`, which no Windows shell runs. ELECTRON_DISABLE still works.
export default defineConfig(({ mode }) => {
  if (mode === "tweak") process.env.BOOJY_TWEAK = "1";
  return {
    plugins: [
      react(),
      ...(mode === "web" || process.env.ELECTRON_DISABLE
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
  };
});
