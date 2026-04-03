import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.boojy.notes",
  appName: "Boojy Notes",
  webDir: "dist",
  plugins: {
    SplashScreen: { launchAutoHide: false },
    Keyboard: { resize: "body", resizeOnFullScreen: true },
  },
};

export default config;
