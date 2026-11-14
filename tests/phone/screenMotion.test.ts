import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/utils/platform", () => ({ isPhone: true }));

import { switchScreen } from "../../src/phone/screenMotion";

type Doc = Document & { startViewTransition?: unknown };

const reduced = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on, media: q })) as typeof window.matchMedia;
};

/** A stand-in for the browser's: runs the update when told, then finishes. */
function fakeTransitions() {
  let run: () => void = () => {};
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  (document as Doc).startViewTransition = vi.fn((update: () => void) => {
    run = update;
    return { finished };
  });
  return { run: () => run(), finish: () => finish(), finished };
}

afterEach(() => {
  delete (document as Doc).startViewTransition;
  delete document.documentElement.dataset.screen;
});

describe("switchScreen", () => {
  it("swaps at once where the browser has no view transitions", () => {
    reduced(false);
    const change = vi.fn();
    switchScreen("note", change);
    expect(change).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.screen).toBeUndefined();
  });

  it("swaps at once when motion is reduced", () => {
    reduced(true);
    const transitions = fakeTransitions();
    const change = vi.fn();
    switchScreen("note", change);
    expect(change).toHaveBeenCalledOnce();
    expect((document as Doc).startViewTransition).not.toHaveBeenCalled();
    transitions.finish();
  });

  it("names the way for the keyframes, changes inside the transition, and clears after", async () => {
    reduced(false);
    const transitions = fakeTransitions();
    const change = vi.fn();
    switchScreen("home", change);
    // The picture of the screen being left is taken before the change.
    expect(change).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.screen).toBe("home");
    transitions.run();
    expect(change).toHaveBeenCalledOnce();
    transitions.finish();
    await transitions.finished;
    await Promise.resolve();
    expect(document.documentElement.dataset.screen).toBeUndefined();
  });

  it("leaves a later switch's direction alone when an earlier one ends", async () => {
    reduced(false);
    const first = fakeTransitions();
    switchScreen("note", () => {});
    fakeTransitions();
    switchScreen("home", () => {});
    first.finish();
    await first.finished;
    await Promise.resolve();
    expect(document.documentElement.dataset.screen).toBe("home");
  });
});
