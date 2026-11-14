import { describe, expect, it } from "vitest";
import { trafficLightsAt } from "../../electron/trafficLights";

describe("trafficLightsAt", () => {
  it("is the launch position at 100%", () => {
    expect(trafficLightsAt(1)).toEqual({ x: 14, y: 18 });
    expect(trafficLightsAt()).toEqual({ x: 14, y: 18 });
  });

  it("keeps the lights' middle on the row's middle at every scale", () => {
    // The row's middle is 25px at 100%, and a light is 14px across.
    for (const scale of [0.5, 0.8, 1, 1.25, 1.5, 2]) {
      const { x, y } = trafficLightsAt(scale);
      expect(x).toBe(14);
      expect(Math.abs(y + 7 - 25 * scale)).toBeLessThanOrEqual(0.5);
    }
  });

  it("holds a scale outside the app's range inside it", () => {
    expect(trafficLightsAt(0.1)).toEqual(trafficLightsAt(0.5));
    expect(trafficLightsAt(9)).toEqual(trafficLightsAt(2));
  });

  it("reads anything that is not a number as 100%", () => {
    for (const junk of [Number.NaN, Number.POSITIVE_INFINITY, "1.5", null, {}]) {
      expect(trafficLightsAt(junk)).toEqual({ x: 14, y: 18 });
    }
  });
});
