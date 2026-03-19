// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock platform module so we're always in "web" mode (no Electron, no Capacitor)
vi.mock("../../../src/utils/platform", () => ({
  isElectron: false,
  isCapacitor: false,
}));

let storeKey, readKey, deleteKey;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  const mod = await import("../../../src/services/ai/keyStorage.js");
  storeKey = mod.storeKey;
  readKey = mod.readKey;
  deleteKey = mod.deleteKey;
});

describe("readKey", () => {
  it("returns empty string when no key stored", async () => {
    const result = await readKey("openai");
    expect(result).toBe("");
  });

  it("returns stored key from localStorage", async () => {
    localStorage.setItem("boojy-ai-key-openai", "sk-test-123");
    const result = await readKey("openai");
    expect(result).toBe("sk-test-123");
  });
});

describe("storeKey", () => {
  it("stores key in localStorage", async () => {
    await storeKey("openai", "sk-test-456");
    expect(localStorage.getItem("boojy-ai-key-openai")).toBe("sk-test-456");
  });

  it("stores with correct key prefix", async () => {
    await storeKey("anthropic", "sk-ant-xyz");
    // Should use the "boojy-ai-key-" prefix
    expect(localStorage.getItem("boojy-ai-key-anthropic")).toBe("sk-ant-xyz");
    // Should not exist without prefix
    expect(localStorage.getItem("anthropic")).toBeNull();
  });
});

describe("readKey / storeKey integration", () => {
  it("different providers use different keys", async () => {
    await storeKey("openai", "openai-key");
    await storeKey("anthropic", "anthropic-key");
    await storeKey("gemini", "gemini-key");

    expect(await readKey("openai")).toBe("openai-key");
    expect(await readKey("anthropic")).toBe("anthropic-key");
    expect(await readKey("gemini")).toBe("gemini-key");
  });
});
