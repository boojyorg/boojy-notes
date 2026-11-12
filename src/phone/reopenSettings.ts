/**
 * Settings to come back to: opening another storage location starts the app
 * again, and one opened from Settings should land there, not on Home. Kept
 * for the one restart in the page's own session storage, which a reload
 * keeps and a fresh launch does not.
 */
const KEY = "boojy-reopen-settings";

export function reopenSettingsAfterRestart(on = true) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    // No session storage: the restart lands on Home.
  }
}

/** Whether this start should open Settings, asked once. */
export function settingsToReopen() {
  try {
    const marked = sessionStorage.getItem(KEY) === "1";
    sessionStorage.removeItem(KEY);
    return marked;
  } catch {
    return false;
  }
}

type SettingsPage = typeof import("./PhoneSettings").default;
let page: SettingsPage | null = null;

/**
 * Before the app's first render, on a start that is to open Settings: its
 * page is loaded now, so the first frame is Settings itself. Opened by an
 * effect, or loaded lazily, Home showed for a moment first. Answers whether
 * this start opens on Settings.
 */
export async function prepareSettingsToReopen() {
  if (settingsToReopen()) page = (await import("./PhoneSettings")).default;
  return page !== null;
}

/** The Settings page loaded for this start to open on; null on any other start. */
export const settingsPageToOpen = () => page;
