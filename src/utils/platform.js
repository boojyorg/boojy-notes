export const isElectron = typeof window !== "undefined" && !!window.electronAPI;
// The Android app (proof of concept, Dropbox sync step 2): Capacitor's bridge
// is in the page before any script runs. Its vault is src/phone/.
export const isPhone =
  typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform?.() && !isElectron;
// `isNative` means a file-backed platform (local .md storage via the native API).
export const isNative = isElectron || isPhone;
export const isWeb = !isNative;
// `?keybar` shows the phone's bar above the keyboard in the web build, with
// no keyboard to wait for: the e2e suite drives it there.
export const keyBarInWeb =
  isWeb && typeof location !== "undefined" && new URLSearchParams(location.search).has("keybar");
// macOS Electron shows the native traffic lights over our chrome
// (titleBarStyle: hiddenInset), so mac-only layout clearances key off this.
export const isElectronMac =
  isElectron && typeof navigator !== "undefined" && navigator.userAgent.includes("Macintosh");
/**
 * Windows and Linux: the window has no title bar of its own, and the app
 * draws a strip across its top with the menu and the system's window buttons
 * (WindowStrip). The Mac's lights sit in the sidebar header instead.
 */
export const hasWindowStrip = isElectron && !isElectronMac;
/**
 * Whether the app runs on a Mac, in Electron or a browser alike: what decides
 * whether a shortcut is shown as ⌘B or Ctrl+B. `isElectronMac` above is
 * Electron-gated and decides the window chrome, not the labels.
 */
export const isMac =
  typeof navigator !== "undefined" &&
  (/^Mac/i.test(navigator.platform || "") || /Macintosh/.test(navigator.userAgent || ""));
