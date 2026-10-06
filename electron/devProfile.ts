import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * `pnpm dev` keeps its own userData (`boojy-notes-dev`), so it can run beside
 * the installed app without the two writing one config, one note index and
 * one version history through the same temp files (a rename of the other
 * copy's temp file away was an uncaught exception). Its first launch starts
 * from a copy of the installed app's config and settings, so it opens the
 * same storage locations; from then on the two part ways.
 *
 * Imported first by `main.js`: the settings and note-index modules read the
 * userData path when they load.
 */
if (process.env.VITE_DEV_SERVER_URL) {
  const shared = app.getPath("userData");
  const own = path.join(app.getPath("appData"), "boojy-notes-dev");
  if (!fs.existsSync(own)) {
    fs.mkdirSync(own, { recursive: true });
    for (const name of ["config.json", "settings.json"]) {
      try {
        fs.copyFileSync(path.join(shared, name), path.join(own, name));
      } catch {
        /* none yet: the dev copy starts fresh */
      }
    }
  }
  app.setPath("userData", own);
}
