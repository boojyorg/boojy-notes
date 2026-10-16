import { describe, expect, it } from "vitest";
import { menuRoom } from "../../src/phone/menuRoom";

// A phone with the keyboard up: the header ends at 60, the bar starts at 500.
const band = { bandTop: 60, bandBottom: 500, cap: 200 };

describe("a menu under the caret on the phone", () => {
  it("opens below the line, at its cap, when there is room", () => {
    expect(menuRoom({ ...band, lineTop: 100, lineBottom: 124 })).toEqual({
      side: "below",
      height: 200,
    });
  });

  it("opens above a line near the bar, never over the bar", () => {
    expect(menuRoom({ ...band, lineTop: 440, lineBottom: 464 })).toEqual({
      side: "above",
      height: 200,
    });
  });

  it("shrinks to the room its side has, never over the header", () => {
    const room = menuRoom({ ...band, lineTop: 250, lineBottom: 274, cap: 400 });
    expect(room).toEqual({ side: "below", height: 500 - 274 - 8 });
  });
});
