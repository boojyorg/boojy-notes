/** @vitest-environment jsdom */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/phone/files", () => ({
  capacitorFiles: () => ({ recover: async () => {}, read: async () => null }),
}));
vi.mock("../../src/phone/folderSwitch", () => ({ settleFolder: async () => {} }));
vi.mock("../../src/phone/phoneVault", () => ({
  createPhoneVault: () => ({ api: {}, store: {} }),
}));
vi.mock("../../src/phone/phoneSync", () => ({
  createPhoneSync: () => ({
    signedIn: async () => true,
    start: async () => {},
    localChanged() {},
    status: { status: () => null, subscribe: () => () => {} },
  }),
}));
vi.mock("../../src/phone/commands", () => ({ onCommand: () => () => {} }));

import config from "../../capacitor.config";
import { installPhone } from "../../src/phone/install";

const COVER = "width=device-width, initial-scale=1.0, viewport-fit=cover";

/**
 * Capacitor reads `viewport-fit` once, as the page commits. The phone's start
 * once swapped `cover` for `contain`, so by timing the app was either under
 * Android's bars or inside them, the bars painted grey around a white note.
 * The app always draws under them (it keeps its own top clear).
 */
describe("the phone draws under Android's bars", () => {
  it("asks for it in the page and tells Capacitor before the page loads", () => {
    const html = fs.readFileSync(path.join(__dirname, "../../index.html"), "utf8");
    expect(html).toMatch(/<meta name="viewport"[^>]*viewport-fit=cover/);
    expect(config.plugins?.SystemBars?.initialViewportFitValueHint).toBe("cover");
  });

  it("keeps it through the phone's start", async () => {
    document.head.innerHTML = `<meta name="viewport" content="${COVER}">`;
    await installPhone();
    expect(document.querySelector('meta[name="viewport"]')?.getAttribute("content")).toBe(COVER);
  });
});
