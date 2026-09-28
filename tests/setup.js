import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";

// A closing surface leaves a fading copy in <body> for ~150ms (useExitGhost);
// one test's must never answer the next test's queries.
const sweepGhosts = () => {
  for (const ghost of document.querySelectorAll(".motion-ghost")) ghost.remove();
};
beforeEach(sweepGhosts);
afterEach(sweepGhosts);

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
    onAppWillClose: () => () => {},
    flushBeforeCloseDone: () => {},
  };

  // Mock matchMedia for theme detection. Reduced motion is on: a closing
  // surface leaves a fading copy in <body> (useExitGhost) that would otherwise
  // answer the next test's queries. The ghost's own spec turns it off.
  globalThis.window.matchMedia =
    globalThis.window.matchMedia ||
    ((query) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
}
