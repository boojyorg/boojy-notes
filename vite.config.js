import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";

// `--mode web` builds the browser target alone, without Electron; `--mode
// phone` builds it into `dist-phone/` for the Android app (capacitor.config.ts);
// `--mode tweak` opens the desktop app with the ?tweak panel. Modes rather
// than `VAR=1 vite`, which no Windows shell runs. ELECTRON_DISABLE still works.
export default defineConfig(({ mode }) => {
  if (mode === "tweak") process.env.BOOJY_TWEAK = "1";
  return {
    plugins: [
      react(),
      // KaTeX's stylesheet offers every font as woff2, woff and ttf. Chromium
      // (Electron and the Android WebView) only ever takes the woff2, so the
      // other two are dropped before Vite copies them into the build.
      {
        name: "katex-woff2-only",
        enforce: "pre",
        transform(code, id) {
          if (!/[\\/]katex[\\/]dist[\\/]katex(\.min)?\.css$/.test(id.split("?")[0])) return null;
          return code.replace(
            /,url\([^)]+\.woff\) format\("woff"\),url\([^)]+\.ttf\) format\("truetype"\)/g,
            "",
          );
        },
      },
      ...(mode === "web" || mode === "phone" || process.env.ELECTRON_DISABLE
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
    ...(mode === "phone" && { build: { outDir: "dist-phone" } }),
  };
});
