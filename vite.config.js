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
            },
          ]),
          renderer(),
        ]),
  ],
});
