import "@testing-library/jest-dom/vitest";

// Supabase mock — prevents real network calls from sync code
vi.mock("../src/lib/supabase", () => ({ supabase: null }));

// structuredClone polyfill (some test envs lack it)
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Stub window.electronAPI for component tests running in jsdom
if (typeof globalThis.window !== "undefined") {
  globalThis.window.electronAPI = {
    saveImage: async () => "test.png",
    saveAttachment: async () => ({ filename: "test.pdf", size: 1024 }),
    getFileSize: async () => 1024,
    openExternal: () => {},
    showItemInFolder: () => {},
    onMenuAction: () => () => {},
  };

  // Mock matchMedia for theme detection
  globalThis.window.matchMedia =
    globalThis.window.matchMedia ||
    ((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
}
