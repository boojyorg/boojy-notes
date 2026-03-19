/**
 * Cross-platform secure key storage.
 * - Electron: safeStorage (OS keychain)
 * - Web: localStorage (with UI warning)
 * - Capacitor: @capacitor/preferences
 */
import { isElectron, isCapacitor } from "../../utils/platform";

const WEB_KEY_PREFIX = "boojy-ai-key-";

export async function storeKey(provider, key) {
  if (isElectron && window.electronAPI?.secureStorage) {
    await window.electronAPI.secureStorage.store(provider, key);
  } else if (isCapacitor) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: `${WEB_KEY_PREFIX}${provider}`, value: key });
  } else {
    localStorage.setItem(`${WEB_KEY_PREFIX}${provider}`, key);
  }
}

export async function readKey(provider) {
  if (isElectron && window.electronAPI?.secureStorage) {
    return await window.electronAPI.secureStorage.read(provider);
  } else if (isCapacitor) {
    const { Preferences } = await import("@capacitor/preferences");
    const { value } = await Preferences.get({ key: `${WEB_KEY_PREFIX}${provider}` });
    return value || "";
  } else {
    return localStorage.getItem(`${WEB_KEY_PREFIX}${provider}`) || "";
  }
}

export async function deleteKey(provider) {
  if (isElectron && window.electronAPI?.secureStorage) {
    await window.electronAPI.secureStorage.delete(provider);
  } else if (isCapacitor) {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: `${WEB_KEY_PREFIX}${provider}` });
  } else {
    localStorage.removeItem(`${WEB_KEY_PREFIX}${provider}`);
  }
}
