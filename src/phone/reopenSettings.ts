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
