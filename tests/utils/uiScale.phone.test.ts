/**
 * The phone's interface size: every size is drawn a step up, so the size the
 * phone was designed at reads 100%, and a size saved before that was so is
 * brought across once, looking as it did.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/platform")>()),
  isPhone: true,
}));

import { applyUiScale, drawnScale, initialUiScale } from "../../src/utils/uiScale";

describe("uiScale on the phone", () => {
  beforeEach(() => localStorage.clear());

  it("opens a new install at 100%", () => {
    expect(initialUiScale()).toBe(100);
  });

  it("draws 100% at the size the phone was designed at", () => {
    expect(drawnScale(100)).toBe(110);
    applyUiScale(100);
    expect(document.documentElement.style.zoom).toBe("110%");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.1");
  });

  it("brings a size saved before across once, to the step that looks the same", () => {
    localStorage.setItem("boojy-ui-scale", "110");
    expect(initialUiScale()).toBe(100);
    expect(localStorage.getItem("boojy-ui-scale")).toBe("100");
    // The next start, and a 110% chosen since, are left as they are.
    localStorage.setItem("boojy-ui-scale", "110");
    expect(initialUiScale()).toBe(110);
  });

  it("brings any other saved size to the nearest step", () => {
    localStorage.setItem("boojy-ui-scale", "100");
    expect(initialUiScale()).toBe(90);
    localStorage.clear();
    localStorage.setItem("boojy-ui-scale", "150");
    expect(initialUiScale()).toBe(133);
  });

  it("never converts a size first saved after the change", () => {
    expect(initialUiScale()).toBe(100);
    localStorage.setItem("boojy-ui-scale", "110");
    expect(initialUiScale()).toBe(110);
  });
});
