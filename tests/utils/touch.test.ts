import { describe, expect, it } from "vitest";
import { fromTouch } from "../../src/utils/touch";

/** A mouse event as Chromium makes it, from a finger or a mouse. */
const mouse = (firesTouchEvents?: boolean) => {
  const e = new MouseEvent("mouseover");
  if (firesTouchEvents !== undefined)
    Object.defineProperty(e, "sourceCapabilities", { value: { firesTouchEvents } });
  return e;
};

describe("fromTouch", () => {
  it("is true for the mouse events Chromium makes after a tap", () => {
    expect(fromTouch(mouse(true))).toBe(true);
    expect(fromTouch({ nativeEvent: mouse(true) })).toBe(true);
  });

  it("is false for a mouse, and where the browser does not say", () => {
    expect(fromTouch(mouse(false))).toBe(false);
    expect(fromTouch({ nativeEvent: mouse(false) })).toBe(false);
    expect(fromTouch(mouse())).toBe(false);
  });
});
