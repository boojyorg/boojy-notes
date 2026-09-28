import { describe, expect, it } from "vitest";
import {
  MOTION_ENTER_MS,
  MOTION_EXIT_MS,
  MOTION_FAST_MS,
  MOTION_VARS,
  PANEL_MS,
  prefersReducedMotion,
} from "../../src/tokens/motion";

describe("motion tokens", () => {
  it("leaves quicker than it arrives, and nothing small is as slow as the panel", () => {
    expect(MOTION_EXIT_MS).toBeLessThan(MOTION_ENTER_MS);
    expect(MOTION_FAST_MS).toBeLessThanOrEqual(MOTION_ENTER_MS);
    expect(MOTION_ENTER_MS).toBeLessThan(PANEL_MS);
  });

  it("hands CSS every clock as a variable, in ms", () => {
    expect(MOTION_VARS["--motion-enter"]).toBe(`${MOTION_ENTER_MS}ms`);
    expect(MOTION_VARS["--motion-exit"]).toBe(`${MOTION_EXIT_MS}ms`);
    expect(MOTION_VARS["--motion-fast"]).toBe(`${MOTION_FAST_MS}ms`);
  });

  it("reads reduced motion from the system", () => {
    const real = window.matchMedia;
    const ask = (on: boolean) => {
      window.matchMedia = ((query: string) => ({
        matches: on && query.includes("prefers-reduced-motion"),
      })) as unknown as typeof window.matchMedia;
      return prefersReducedMotion();
    };
    try {
      expect(ask(true)).toBe(true);
      expect(ask(false)).toBe(false);
    } finally {
      window.matchMedia = real;
    }
  });
});
