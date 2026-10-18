import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_SLOP,
  drifted,
  HOLD_MS,
  HOLD_SLOP,
  isSecondTap,
  tapFrom,
} from "../../src/utils/holdGesture";

describe("drifted", () => {
  it("lets a still finger wobble", () => {
    expect(drifted({ x: 0, y: 0 }, { x: 3, y: HOLD_SLOP - 4 })).toBe(false);
  });

  it("makes a finger past the slop a scroll", () => {
    expect(drifted({ x: 0, y: 0 }, { x: 0, y: HOLD_SLOP + 1 })).toBe(true);
  });
});

describe("isSecondTap", () => {
  const last = { x: 100, y: 200, at: 1000 };

  it("takes a quick press near the last tap as the double-tap's second", () => {
    expect(isSecondTap(last, { x: 110, y: 205 }, 1000 + DOUBLE_TAP_MS - 1)).toBe(true);
  });

  it("is not a second tap once too late", () => {
    expect(isSecondTap(last, { x: 100, y: 200 }, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
  });

  it("is not a second tap somewhere else", () => {
    expect(isSecondTap(last, { x: 100 + DOUBLE_TAP_SLOP + 1, y: 200 }, 1100)).toBe(false);
  });

  it("is not a second tap with no tap before", () => {
    expect(isSecondTap(null, { x: 100, y: 200 }, 1100)).toBe(false);
  });
});

describe("tapFrom", () => {
  const start = { x: 50, y: 50, at: 0 };

  it("records a short, still touch as a tap", () => {
    expect(tapFrom(start, { x: 52, y: 51 }, 120)).toEqual({ x: 52, y: 51, at: 120 });
  });

  it("never records a held touch", () => {
    expect(tapFrom(start, { x: 50, y: 50 }, HOLD_MS)).toBeNull();
  });

  it("never records a scroll", () => {
    expect(tapFrom(start, { x: 50, y: 50 + HOLD_SLOP + 5 }, 120)).toBeNull();
  });
});
