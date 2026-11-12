/**
 * The phone's interface size: every size is drawn a step up, so the size the
 * phone was designed at reads 100%, and a size saved before that was so is
 * brought across once, looking as it did.
 */
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/utils/platform")>()),
  isPhone: true,
}));

import { SettingsProvider } from "../../src/context/SettingsContext";
import { useHeldScale } from "../../src/hooks/useHeldScale";
import {
  applyUiScale,
  drawnScale,
  initialUiScale,
  rebasePhoneScale,
} from "../../src/utils/uiScale";

/** A start: the conversion, then the read (`main.jsx`). */
const start = () => {
  rebasePhoneScale();
  return initialUiScale();
};

describe("uiScale on the phone", () => {
  beforeEach(() => localStorage.clear());

  it("opens a new install at 100%", () => {
    expect(start()).toBe(100);
  });

  it("draws 100% at the size the phone was designed at, and every size whole", () => {
    expect(drawnScale(100)).toBe(110);
    expect(drawnScale(133)).toBe(146);
    applyUiScale(100);
    expect(document.documentElement.style.zoom).toBe("110%");
    expect(document.documentElement.style.getPropertyValue("--ui-scale")).toBe("1.1");
  });

  it("brings a size saved before across once", () => {
    localStorage.setItem("boojy-ui-scale", "110");
    expect(start()).toBe(100);
    expect(localStorage.getItem("boojy-ui-scale")).toBe("100");
    // A 110% chosen since is left as it is at the next start.
    localStorage.setItem("boojy-ui-scale", "110");
    expect(start()).toBe(110);
  });

  it("brings any saved size to the figure that draws what it drew", () => {
    for (const before of [50, 67, 80, 90, 100, 120, 133, 150, 170, 200]) {
      localStorage.clear();
      localStorage.setItem("boojy-ui-scale", String(before));
      const after = start();
      // Within a percentage point of what was on screen, bar the smallest:
      // 50% is the least that may be chosen, and now draws at 55.
      if (before > 50) expect(Math.abs(drawnScale(after) - before)).toBeLessThanOrEqual(1);
      else expect(after).toBe(50);
    }
  });

  it("never converts a size first saved after the change", () => {
    expect(start()).toBe(100);
    localStorage.setItem("boojy-ui-scale", "110");
    expect(start()).toBe(110);
  });

  it("opens at the default over a saved value that is no number", () => {
    localStorage.setItem("boojy-ui-scale", "big");
    expect(start()).toBe(100);
  });

  it("holds an open Settings surface at the drawn size it opened with", () => {
    const { result } = renderHook(() => useHeldScale(true), { wrapper: SettingsProvider });
    expect((result.current as Record<string, unknown>)["--ui-scale"]).toBe(1.1);
  });
});
