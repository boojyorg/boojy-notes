export const isElectron = typeof window !== "undefined" && !!window.electronAPI;
// `isNative` means a file-backed platform (local .md storage via the native API).
// Capacitor (iOS/Android) was removed, so the only native target is now Electron.
export const isNative = isElectron;
export const isWeb = !isNative;
export const platform = isElectron ? "electron" : "web";
// macOS Electron shows the native traffic lights over our chrome
// (titleBarStyle: hiddenInset), so mac-only layout clearances key off this.
export const isElectronMac =
  isElectron && typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
