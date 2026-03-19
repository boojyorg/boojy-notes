import "@testing-library/jest-dom/vitest";

// Supabase mock — prevents real network calls from sync code
vi.mock("../src/lib/supabase", () => ({ supabase: null }));

// structuredClone polyfill (some test envs lack it)
if (typeof globalThis.structuredClone === "undefined") {
  globalThis.structuredClone = (obj) => JSON.parse(JSON.stringify(obj));
}

// Mock @capacitor/core to return isNativePlatform() === false in test environment
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => "web",
    convertFileSrc: (uri) => uri,
  },
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: {},
  Directory: { Documents: "DOCUMENTS" },
  Encoding: { UTF8: "utf8" },
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: { get: async () => ({ value: null }), set: async () => {} },
}));

vi.mock("@capacitor/browser", () => ({
  Browser: { open: async () => {} },
}));

vi.mock("@capacitor/camera", () => ({
  Camera: { getPhoto: async () => null },
  CameraResultType: { Base64: "base64" },
  CameraSource: { Photos: "PHOTOS" },
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: async () => {} },
}));

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
