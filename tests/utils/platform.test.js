import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @capacitor/core before importing the module
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
  },
}));

let isElectron, isNative, isWeb, isCapacitor, platform;

beforeEach(async () => {
  vi.resetModules();
  // Remove electronAPI stub set by test setup so platform detects "web"
  delete window.electronAPI;
  const mod = await import("../../src/utils/platform.js");
  isElectron = mod.isElectron;
  isNative = mod.isNative;
  isWeb = mod.isWeb;
  isCapacitor = mod.isCapacitor;
  platform = mod.platform;
});

describe("platform detection", () => {
  it("isElectron is false in test environment", () => {
    expect(isElectron).toBe(false);
  });

  it("isNative is false in test environment", () => {
    expect(isNative).toBe(false);
  });

  it("isWeb is correct based on env", () => {
    // In test env, neither Electron nor Capacitor is active, so isWeb should be true
    expect(isWeb).toBe(true);
  });

  it("isCapacitor is false in test environment", () => {
    expect(isCapacitor).toBe(false);
  });

  it("platform string is 'web' when not electron or capacitor", () => {
    expect(platform).toBe("web");
  });
});
