/**
 * The UI scale as a number: the ends a custom value is held between, one rule
 * for stepping (the keys walk the presets, from a custom value to the nearest
 * one on the side they point), and what a typed percentage means.
 */
import { describe, expect, it } from "vitest";
import {
  SCALE_DEFAULT,
  SCALE_MAX,
  SCALE_MIN,
  clampScale,
  isPresetScale,
  parseScale,
  stepScale,
} from "../../src/utils/uiScale";

describe("uiScale", () => {
  it("knows its range and its default", () => {
    expect(SCALE_MIN).toBe(50);
    expect(SCALE_MAX).toBe(200);
    expect(SCALE_DEFAULT).toBe(100);
    expect(isPresetScale(120)).toBe(true);
    expect(isPresetScale(93)).toBe(false);
  });

  it("holds a value inside the range, as a whole percentage", () => {
    expect(clampScale(93)).toBe(93);
    expect(clampScale(93.4)).toBe(93);
    expect(clampScale(0)).toBe(SCALE_MIN);
    expect(clampScale(5000)).toBe(SCALE_MAX);
    expect(clampScale(-20)).toBe(SCALE_MIN);
  });

  it("steps to the next preset, and to the nearest one from a custom value", () => {
    expect(stepScale(100, 1)).toBe(110);
    expect(stepScale(100, -1)).toBe(90);
    // A custom 93% sits between two presets: up is 100, down is 90.
    expect(stepScale(93, 1)).toBe(100);
    expect(stepScale(93, -1)).toBe(90);
    // At the ends it answers with the scale it is on, so the shortcut is never
    // silent (`useAppKeyboard`).
    expect(stepScale(SCALE_MAX, 1)).toBe(SCALE_MAX);
    expect(stepScale(SCALE_MIN, -1)).toBe(SCALE_MIN);
    // Above the largest preset, a custom value still steps down into the list.
    expect(stepScale(195, -1)).toBe(170);
  });

  it("reads a typed percentage, and nothing from what is not one", () => {
    expect(parseScale("93")).toBe(93);
    expect(parseScale(" 93 ")).toBe(93);
    expect(parseScale("93%")).toBe(93);
    expect(parseScale("93.6")).toBe(94);
    // Out of range is held rather than refused: a typed 500 is the largest.
    expect(parseScale("500")).toBe(SCALE_MAX);
    expect(parseScale("1")).toBe(SCALE_MIN);
    expect(parseScale("")).toBeNull();
    expect(parseScale("big")).toBeNull();
    expect(parseScale("%")).toBeNull();
  });
});
