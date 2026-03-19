// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset module state between tests
let genBlockId, genNoteId, loadFromStorage, STORAGE_KEY, setBlockIdCounter;

beforeEach(async () => {
  vi.resetModules();
  // Clear localStorage
  localStorage.clear();
  const mod = await import("../../src/utils/storage.js");
  genBlockId = mod.genBlockId;
  genNoteId = mod.genNoteId;
  loadFromStorage = mod.loadFromStorage;
  STORAGE_KEY = mod.STORAGE_KEY;
  setBlockIdCounter = mod.setBlockIdCounter;
});

describe("STORAGE_KEY", () => {
  it("is correct value", () => {
    expect(STORAGE_KEY).toBe("boojy-notes-v1");
  });
});

describe("loadFromStorage", () => {
  it("returns null when no data", () => {
    expect(loadFromStorage()).toBeNull();
  });

  it("returns parsed data", () => {
    const data = { notes: [{ id: "note-1", title: "Test" }] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    expect(loadFromStorage()).toEqual(data);
  });

  it("returns null on corrupt JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json!!!");
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(loadFromStorage()).toBeNull();
    consoleSpy.mockRestore();
  });
});

describe("genNoteId", () => {
  it("returns unique string starting with 'note-'", () => {
    const id1 = genNoteId();
    const id2 = genNoteId();
    expect(id1).toMatch(/^note-/);
    expect(id2).toMatch(/^note-/);
    expect(id1).not.toBe(id2);
  });
});

describe("genBlockId", () => {
  it("returns string starting with 'blk-'", () => {
    const id = genBlockId();
    expect(id).toMatch(/^blk-/);
  });

  it("increments counter", () => {
    setBlockIdCounter(0);
    const id1 = genBlockId();
    const id2 = genBlockId();
    // Both should contain incrementing suffix numbers
    const suffix1 = parseInt(id1.split("-").pop(), 10);
    const suffix2 = parseInt(id2.split("-").pop(), 10);
    expect(suffix2).toBe(suffix1 + 1);
  });
});
