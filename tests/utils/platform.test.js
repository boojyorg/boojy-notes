import { describe, it, expect, vi, beforeEach } from "vitest";

let isElectron, isNative, isWeb, platform;

beforeEach(async () => {
  vi.resetModules();
  // Remove electronAPI stub set by test setup so platform detects "web"
  delete window.electronAPI;
  const mod = await import("../../src/utils/platform.js");
  isElectron = mod.isElectron;
  isNative = mod.isNative;
  isWeb = mod.isWeb;
  platform = mod.platform;
});

describe("platform detection", () => {
  it("isElectron is false in test environment", () => {
    expect(isElectron).toBe(false);
  });

  it("isNative is false in test environment", () => {
    expect(isNative).toBe(false);
  });

  it("isWeb is true when not electron", () => {
    expect(isWeb).toBe(true);
  });

  it("platform string is 'web' when not electron", () => {
    expect(platform).toBe("web");
  });
});
