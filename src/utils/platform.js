import { Capacitor } from "@capacitor/core";

export const isElectron = typeof window !== "undefined" && !!window.electronAPI;
export const isCapacitor = typeof window !== "undefined" && Capacitor.isNativePlatform();
export const isNative = isElectron || isCapacitor;
export const isWeb = !isNative;
export const platform = isElectron ? "electron" : isCapacitor ? Capacitor.getPlatform() : "web";
