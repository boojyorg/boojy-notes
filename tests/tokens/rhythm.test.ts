import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  DEFAULT_RHYTHM,
  getRhythm,
  headingStyle,
  isHeadingType,
  setRhythm,
  useRhythm,
} from "../../src/tokens/rhythm";

afterEach(() => setRhythm(null));

describe("rhythm", () => {
  it("puts much more space above a heading than below it, H1 the most", () => {
    const h1 = headingStyle("h1", DEFAULT_RHYTHM);
    const h2 = headingStyle("h2", DEFAULT_RHYTHM);
    const h3 = headingStyle("h3", DEFAULT_RHYTHM);
    expect(h2.margin).toBe(`${DEFAULT_RHYTHM.headingAbove}px 0 ${DEFAULT_RHYTHM.headingBelow}px`);
    const above = (m: string) => Number.parseInt(m, 10);
    expect(above(h1.margin)).toBeGreaterThan(above(h2.margin));
    expect(above(h3.margin)).toBeLessThan(above(h2.margin));
  });

  it("scales heading sizes with the body size", () => {
    expect(headingStyle("h2", DEFAULT_RHYTHM).fontSize).toBe(22);
    expect(headingStyle("h2", { ...DEFAULT_RHYTHM, bodySize: 16 }).fontSize).toBe(23.5);
  });

  it("knows the heading types", () => {
    expect(isHeadingType("h4")).toBe(true);
    expect(isHeadingType("p")).toBe(false);
  });

  it("lays overrides over the defaults and tells every reader", () => {
    const { result } = renderHook(() => useRhythm());
    expect(result.current).toBe(DEFAULT_RHYTHM);
    act(() => setRhythm({ paragraphGap: 14 }));
    expect(result.current.paragraphGap).toBe(14);
    expect(result.current.headingAbove).toBe(DEFAULT_RHYTHM.headingAbove);
    act(() => setRhythm(null));
    expect(getRhythm()).toBe(DEFAULT_RHYTHM);
  });
});
