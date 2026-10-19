import { describe, expect, it, vi } from "vitest";

// The phone has nowhere to keep a picture or file yet: offered, they would be
// written into the note as a data: URI.
vi.mock("../../src/utils/platform", async (actual) => ({
  ...(await actual()),
  addsFiles: false,
}));

const { filterSlashCommands } = await import("../../src/constants/data");

describe("the slash menu where nothing can be added", () => {
  it("offers neither Image nor File, on the opening screen or searched", () => {
    const ids = (q) => filterSlashCommands(q).map((c) => c.id);
    expect(ids("")).not.toContain("image");
    expect(ids("ima")).toEqual([]);
    expect(ids("file")).toEqual([]);
    expect(ids("")).toContain("table");
  });
});
