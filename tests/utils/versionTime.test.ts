import { describe, expect, it } from "vitest";
import { editedLabel, versionMoment, versionTime } from "../../src/utils/versionTime";

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

  // A 24-hour clock pads its hour, as the Mac's does; a 12-hour one never.
  it("writes a 24-hour clock's hour in two digits", () => {
    expect(versionTime(at(9, 26, 9, 5), now, false, "en-GB")).toBe("09:05");
    expect(versionTime(at(9, 26, 0, 1), now, false, "es-ES")).toBe("00:01");
    expect(versionTime(at(9, 26, 9, 5), now, undefined, "en-GB")).toBe("09:05");
    expect(versionTime(at(9, 26, 9, 5), now, true, "en-GB")).toBe("9:05 am");
  });

  it("follows a 12-hour clock and the locale's own order", () => {
    expect(versionTime(at(9, 26, 15, 48), now, true, "en-US")).toBe("3:48 PM");
    expect(versionTime(at(8, 25, 9, 0), now, false, "en-US")).toBe("Aug 25");
  });

  it("never writes an all-number date", () => {
    expect(versionTime(at(8, 25, 9, 0, 2025), now, false, "en-US")).not.toMatch(/\d+\/\d+/);
  });
});

describe("editedLabel", () => {
  const ago = (ms: number) => editedLabel(now - ms, now, false, "en-GB");
  it("says how recently within the hour", () => {
    expect(ago(0)).toBe("Edited just now");
    expect(ago(59_999)).toBe("Edited just now");
    expect(ago(60_000)).toBe("Edited 1 min ago");
    expect(ago(59 * 60_000 + 59_999)).toBe("Edited 59 min ago");
  });

  it("then the clock and the day, as Version History says them", () => {
    expect(ago(60 * 60_000)).toBe("Edited at 15:04");
    expect(editedLabel(at(9, 26, 1, 30), now, false, "en-GB")).toBe("Edited at 01:30");
    expect(editedLabel(at(9, 25, 23, 59), now, false, "en-GB")).toBe("Edited yesterday at 23:59");
    expect(editedLabel(at(9, 20, 10, 12), now, false, "en-GB")).toBe("Edited Sun at 10:12");
    expect(editedLabel(at(9, 19, 10, 12), now, false, "en-GB")).toBe("Edited 19 Sept");
    expect(editedLabel(at(12, 31, 9, 0, 2025), now, false, "en-GB")).toBe("Edited 31 Dec 2025");
  });

  it("reads a time ahead of the clock (another device's) as just now", () => {
    expect(ago(-5 * 60_000)).toBe("Edited just now");
  });

  it("follows a 12-hour clock", () => {
    expect(editedLabel(at(9, 25, 21, 40), now, true, "en-GB")).toMatch(
      /^Edited yesterday at 9:40\spm$/i,
    );
  });
});

describe("versionMoment", () => {
  it("says the whole moment for a tooltip", () => {
    expect(versionMoment(at(9, 23, 10, 12), false, "en-GB")).toMatch(
      /^Wednesday 23 September.*10:12$/,
    );
  });
});
