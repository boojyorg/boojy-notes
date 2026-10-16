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
};

export default config;
