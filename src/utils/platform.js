export const isElectron = typeof window !== "undefined" && !!window.electronAPI;
// `isNative` means a file-backed platform (local .md storage via the native API).
// Capacitor (iOS/Android) was removed, so the only native target is now Electron.
export const isNative = isElectron;
export const isWeb = !isNative;
// macOS Electron shows the native traffic lights over our chrome
// (titleBarStyle: hiddenInset), so mac-only layout clearances key off this.
export const isElectronMac =
  isElectron && typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
/**
 * Whether the app runs on a Mac, in Electron or a browser alike: what decides
 * whether a shortcut is shown as ⌘B or Ctrl+B. `isElectronMac` above is
 * Electron-gated and decides the window chrome, not the labels.
 */
export const isMac =
  typeof navigator !== "undefined" &&
  (/^Mac/i.test(navigator.platform || "") || /Macintosh/.test(navigator.userAgent || ""));
