import { ipcMain, app, safeStorage } from "electron";
import path from "node:path";
import fs from "node:fs";

const SECURE_STORE_FILE = path.join(app.getPath("userData"), "secure-keys.json");

function loadSecureStore() {
  try {
    return JSON.parse(fs.readFileSync(SECURE_STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSecureStore(store) {
  fs.writeFileSync(SECURE_STORE_FILE, JSON.stringify(store, null, 2));
}

// ─── Register IPC handlers ───

function registerSecureStorageIPC() {
  ipcMain.handle("secure-store", (_event, key, value) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Encryption not available");
    }
    const encrypted = safeStorage.encryptString(value).toString("base64");
    const store = loadSecureStore();
    store[key] = encrypted;
    saveSecureStore(store);
  });

  ipcMain.handle("secure-read", (_event, key) => {
    if (!safeStorage.isEncryptionAvailable()) return "";
    const store = loadSecureStore();
    const encrypted = store[key];
    if (!encrypted) return "";
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return "";
    }
  });

  ipcMain.handle("secure-delete", (_event, key) => {
    const store = loadSecureStore();
    delete store[key];
    saveSecureStore(store);
  });
}

export { registerSecureStorageIPC };
