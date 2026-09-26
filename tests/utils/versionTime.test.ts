import { describe, expect, it } from "vitest";
import { versionMoment, versionTime } from "../../src/utils/versionTime";

const now = new Date(2026, 8, 26, 16, 4).getTime(); // Sat 26 Sep 2026, 16:04
const at = (m: number, d: number, h: number, min: number, y = 2026) =>
  new Date(y, m - 1, d, h, min).getTime();

describe("versionTime", () => {
  it("is precise while recent and coarser as it gets old", () => {
    expect(versionTime(at(9, 26, 15, 48), now, false, "en-GB")).toBe("15:48");
    expect(versionTime(at(9, 25, 21, 40), now, false, "en-GB")).toBe("Yesterday 21:40");
    expect(versionTime(at(9, 22, 10, 12), now, false, "en-GB")).toBe("Tue 10:12");
    expect(versionTime(at(8, 25, 9, 0), now, false, "en-GB")).toBe("25 Aug");
    expect(versionTime(at(8, 25, 9, 0, 2025), now, false, "en-GB")).toBe("25 Aug 2025");
  });

  it("follows a 12-hour clock and the locale's own order", () => {
    expect(versionTime(at(9, 26, 15, 48), now, true, "en-US")).toBe("3:48 PM");
    expect(versionTime(at(8, 25, 9, 0), now, false, "en-US")).toBe("Aug 25");
  });

  it("never writes an all-number date", () => {
    expect(versionTime(at(8, 25, 9, 0, 2025), now, false, "en-US")).not.toMatch(/\d+\/\d+/);
  });
});

describe("versionMoment", () => {
  it("says the whole moment for a tooltip", () => {
    expect(versionMoment(at(9, 23, 10, 12), false, "en-GB")).toMatch(
      /^Wednesday 23 September.*10:12$/,
    );
  });
});
