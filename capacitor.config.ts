import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.boojy.notes",
  appName: "Boojy Notes",
  webDir: "dist",
  plugins: {
    SplashScreen: { launchAutoHide: false },
    Keyboard: { resize: "none", resizeOnFullScreen: false },
  },
};

export default config;
