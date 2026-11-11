/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const Page = () => null;
vi.mock("../../src/phone/PhoneSettings", () => ({ default: Page }));

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});
const load = () => import("../../src/phone/reopenSettings");

// Opening another storage location starts the app again; from Settings, it should land there.
describe("a start that comes back to Settings", () => {
  it("is asked for once, across the one restart", async () => {
    const m = await load();
    expect(m.settingsToReopen()).toBe(false);
    m.reopenSettingsAfterRestart();
    expect(m.settingsToReopen()).toBe(true);
    expect(m.settingsToReopen()).toBe(false);
    m.reopenSettingsAfterRestart();
    m.reopenSettingsAfterRestart(false);
    expect(m.settingsToReopen()).toBe(false);
  });

  // Opened by an effect, or with its page still to load, Home showed for a moment first.
  it("has the page loaded before the app renders, and only on such a start", async () => {
    const plain = await load();
    await plain.prepareSettingsToReopen();
    expect(plain.settingsPageToOpen()).toBeNull();

    plain.reopenSettingsAfterRestart();
    vi.resetModules();
    const restarted = await load();
    await restarted.prepareSettingsToReopen();
    expect(restarted.settingsPageToOpen()).toBe(Page);
    // The start after that one is an ordinary one.
    vi.resetModules();
    const later = await load();
    await later.prepareSettingsToReopen();
    expect(later.settingsPageToOpen()).toBeNull();
  });
});
