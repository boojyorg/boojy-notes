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
  // The app draws under the status and gesture bars and keeps its own top
  // clear (STATUS_BAR_H), as the page's `viewport-fit=cover` says. The hint
  // gives Capacitor that answer before the page loads, so the first frame
  // is laid out the same way as the rest.
  plugins: { SystemBars: { initialViewportFitValueHint: "cover" } },
  // `pnpm android --live`: the app loads the Vite dev server instead of its
  // bundle, so an edit shows on the phone at once. Never in a plain build.
  ...(process.env.BOOJY_LIVE_URL && {
    server: { url: process.env.BOOJY_LIVE_URL, cleartext: true },
  }),
};

export default config;
