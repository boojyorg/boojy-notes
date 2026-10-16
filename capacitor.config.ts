import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app, a proof of concept (Dropbox sync, step 2): the web build
 * in a native shell, never published. `pnpm android` builds and installs it
 * on a phone connected by USB.
 */
const config: CapacitorConfig = {
  appId: "org.boojy.notes",
  appName: "Boojy Notes",
  webDir: "dist-phone",
  // `pnpm android --live`: the app loads the Vite dev server instead of its
  // bundle, so an edit shows on the phone at once. Never in a plain build.
  ...(process.env.BOOJY_LIVE_URL && {
    server: { url: process.env.BOOJY_LIVE_URL, cleartext: true },
  }),
};

export default config;
