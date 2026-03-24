// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset module state between tests
let genBlockId, genNoteId, loadFromStorage, STORAGE_KEY;

beforeEach(async () => {
  vi.resetModules();
  // Clear localStorage
  localStorage.clear();
  const mod = await import("../../src/utils/storage.js");
  genBlockId = mod.genBlockId;
  genNoteId = mod.genNoteId;
  loadFromStorage = mod.loadFromStorage;
  STORAGE_KEY = mod.STORAGE_KEY;
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

  it("generates unique IDs", () => {
    const id1 = genBlockId();
    const id2 = genBlockId();
    expect(id1).not.toBe(id2);
    // Both should match blk-{timestamp}-{random} format
    expect(id1).toMatch(/^blk-\d+-[a-z0-9]+$/);
    expect(id2).toMatch(/^blk-\d+-[a-z0-9]+$/);
  });

  it("generates unique IDs across many calls", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(genBlockId());
    }
    expect(ids.size).toBe(100);
  });

  it("genNoteId uses random suffix format", () => {
    const id = genNoteId();
    expect(id).toMatch(/^note-\d+-[a-z0-9]+$/);
  });
});
