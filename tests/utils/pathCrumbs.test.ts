import { describe, expect, it } from "vitest";
import { formWidth, parentFolders, pickCrumbForm } from "../../src/utils/pathCrumbs";

/**
 * Which folders the chrome row shows for a note, given the room it has. The
 * rule is a judged product decision (2026-09-15), so the test pins its two
 * promises: the outer folders go before the nearer ones and the name goes
 * last, and a wider band never shows less than a narrower one did.
 */
describe("parentFolders", () => {
  it("is empty for a root note however the root is spelt", () => {
    expect(parentFolders(null)).toEqual([]);
    expect(parentFolders(undefined)).toEqual([]);
    expect(parentFolders("")).toEqual([]);
    expect(parentFolders("/")).toEqual([]);
  });

  it("splits a vault-relative path outermost first", () => {
    expect(parentFolders("University")).toEqual(["University"]);
    expect(parentFolders("University/Archive")).toEqual(["University", "Archive"]);
    // A stray leading or trailing slash is not a folder.
    expect(parentFolders("/University/Archive/")).toEqual(["University", "Archive"]);
  });
});

const widths = { parents: [60, 50, 120], sep: 16, ellipsis: 11, name: 80 };

describe("formWidth", () => {
  it("adds the kept parents, their separators, the ellipsis and the name", () => {
    expect(formWidth(widths, 3, false)).toBe(60 + 50 + 120 + 3 * 16 + 80);
    expect(formWidth(widths, 1, true)).toBe(120 + 16 + 11 + 16 + 80);
    expect(formWidth(widths, 0, true)).toBe(11 + 16 + 80);
    expect(formWidth(widths, 0, false)).toBe(80);
  });
});

describe("pickCrumbForm", () => {
  it("shows the full path when it fits", () => {
    expect(pickCrumbForm(widths, 400)).toEqual({ keep: 3, ellipsis: false, truncated: false });
  });

  it("drops the outer folders first and keeps the nearest one longest", () => {
    // Full path is 358; `… / B / C / name` is 293; `… / C / name` is 227.
    expect(pickCrumbForm(widths, 357)).toEqual({ keep: 2, ellipsis: true, truncated: false });
    expect(pickCrumbForm(widths, 292)).toEqual({ keep: 1, ellipsis: true, truncated: false });
    expect(pickCrumbForm(widths, 226)).toEqual({ keep: 0, ellipsis: true, truncated: false });
  });

  it("prefers the whole name to any folder, and cuts the name only when it must", () => {
    // `… / name` is 107; the bare name is 80.
    expect(pickCrumbForm(widths, 106)).toEqual({ keep: 0, ellipsis: false, truncated: false });
    expect(pickCrumbForm(widths, 80)).toEqual({ keep: 0, ellipsis: false, truncated: false });
    expect(pickCrumbForm(widths, 79)).toEqual({ keep: 0, ellipsis: false, truncated: true });
  });

  it("never shows an ellipsis for a root note", () => {
    const root = { parents: [], sep: 16, ellipsis: 11, name: 80 };
    expect(pickCrumbForm(root, 1000)).toEqual({ keep: 0, ellipsis: false, truncated: false });
    expect(pickCrumbForm(root, 10)).toEqual({ keep: 0, ellipsis: false, truncated: true });
  });

  it("is monotonic: widening the room never hides a folder a narrower room showed", () => {
    let last = -1;
    let lastTruncated = true;
    for (let available = 0; available <= 400; available += 1) {
      const form = pickCrumbForm(widths, available);
      const shown = form.keep + (form.ellipsis ? 0.5 : 0);
      expect(shown).toBeGreaterThanOrEqual(last);
      if (lastTruncated === false) expect(form.truncated).toBe(false);
      last = shown;
      lastTruncated = form.truncated;
    }
  });
});
