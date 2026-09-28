/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOTION_SETTLE_MS } from "../../src/tokens/motion";
import { measureBlockPlaces, settleBlocks } from "../../src/utils/blockSettle";

type Zoomed = HTMLElement & { currentCSSZoom?: number };

/** A block root at `top`, as the editor holds them; its rect reads `at.top`. */
function root(editor: HTMLElement, id: string, at: { top: number }) {
  const el = document.createElement("div") as Zoomed;
  el.dataset.blockId = id;
  el.getBoundingClientRect = () => ({ top: at.top, height: 30 }) as DOMRect;
  el.animate = vi.fn() as unknown as HTMLElement["animate"];
  editor.appendChild(el);
  return el;
}

const motion = (on: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: !on && query.includes("prefers-reduced-motion"),
  })) as unknown as typeof window.matchMedia;
};

describe("settleBlocks", () => {
  const realMatchMedia = window.matchMedia;
  let editor: HTMLElement;

  beforeEach(() => {
    editor = document.createElement("div");
    document.body.appendChild(editor);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    motion(true);
  });
  afterEach(() => {
    editor.remove();
    window.matchMedia = realMatchMedia;
    vi.unstubAllGlobals();
  });

  it("draws each moved block back at its old place and lets it go, in CSS pixels", () => {
    const a = { top: 100 };
    const b = { top: 140 };
    const elA = root(editor, "a", a) as Zoomed;
    const elB = root(editor, "b", b);
    elA.currentCSSZoom = 2;
    const before = measureBlockPlaces(editor);
    // The reorder: a and b trade places.
    a.top = 140;
    b.top = 100;
    settleBlocks(editor, before);
    expect(elA.animate).toHaveBeenCalledWith(
      [
        { translate: "0 -20px", opacity: 1 }, // −40 viewport px ÷ zoom 2
        { translate: "0 0", opacity: 1 },
      ],
      expect.objectContaining({ duration: MOTION_SETTLE_MS }),
    );
    expect(elB.animate).toHaveBeenCalledWith(
      [expect.objectContaining({ translate: "0 40px" }), expect.anything()],
      expect.anything(),
    );
  });

  it("a dropped block starts as translucent as its copy, even with no distance to travel", () => {
    const el = root(editor, "a", { top: 100 });
    settleBlocks(editor, new Map([["a", { top: 100, opacity: 0.35 }]]));
    expect(el.animate).toHaveBeenCalledWith(
      [expect.objectContaining({ opacity: 0.35 }), expect.objectContaining({ opacity: 1 })],
      expect.anything(),
    );
  });

  it("leaves still blocks, blocks off screen both times, and reduced motion alone", () => {
    const still = root(editor, "still", { top: 100 });
    const far = { top: 5000 };
    const offscreen = root(editor, "far", far);
    const before = measureBlockPlaces(editor);
    far.top = 6000;
    settleBlocks(editor, before);
    expect(still.animate).not.toHaveBeenCalled();
    expect(offscreen.animate).not.toHaveBeenCalled();

    motion(false);
    const moved = { top: 100 };
    const el = root(editor, "moved", moved);
    const again = measureBlockPlaces(editor);
    moved.top = 200;
    settleBlocks(editor, again);
    expect(el.animate).not.toHaveBeenCalled();
  });
});
