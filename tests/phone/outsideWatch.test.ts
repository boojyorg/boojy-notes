import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchOutside } from "../../src/phone/outsideWatch";

describe("when the phone looks at its notes folder", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const watching = (check = vi.fn(async (_: { thorough: boolean }) => {})) => {
    const lost = vi.fn();
    const stillThere = vi.fn(async () => true);
    const watch = watchOutside({ check, stillThere, lost, everyMs: 30_000 });
    return { watch, check, lost, stillThere };
  };

  it("looks thoroughly on coming back to the front, quickly every half minute after", async () => {
    const { watch, check } = watching();
    watch.active(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(check.mock.calls).toEqual([[{ thorough: true }]]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(check.mock.calls.slice(1)).toEqual([[{ thorough: false }], [{ thorough: false }]]);
  });

  it("never looks from the background", async () => {
    const { watch, check } = watching();
    watch.active(true);
    watch.active(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(check).toHaveBeenCalledOnce();
  });

  it("runs one look at a time, and the one asked for meanwhile after it", async () => {
    let finish = () => {};
    const check = vi.fn(
      (_: { thorough: boolean }) =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { watch } = watching(check);
    watch.active(true, false);
    await vi.advanceTimersByTimeAsync(30_000);
    watch.active(true);
    expect(check.mock.calls).toEqual([[{ thorough: false }]]);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(check.mock.calls[1]).toEqual([{ thorough: true }]);
  });

  it("says the folder is lost when a look fails and it is no longer there, once", async () => {
    const check = vi.fn(async (_: { thorough: boolean }) => {
      throw new Error("The notes folder can't be reached");
    });
    const { watch, lost, stillThere } = watching(check);
    stillThere.mockResolvedValue(false);
    watch.active(true);
    await vi.advanceTimersByTimeAsync(90_000);
    expect(lost).toHaveBeenCalledOnce();
    expect(check).toHaveBeenCalledOnce();
  });

  it("tries again after a look that failed with the folder still there", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const check = vi.fn(async (_: { thorough: boolean }) => {
      throw new Error("busy");
    });
    const { watch, lost } = watching(check);
    watch.active(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(lost).not.toHaveBeenCalled();
    expect(check).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
