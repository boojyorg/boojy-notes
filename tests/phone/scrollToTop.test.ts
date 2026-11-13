/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { scrollToTop } from "../../src/phone/scrollToTop";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const list = (scrollTop: number) => {
  const el = document.createElement("div");
  el.scrollTop = scrollTop;
  return el;
};

// A tap on Home's N: back to the top in one short move, the same length from anywhere.
describe("scrollToTop", () => {
  it("arrives at the top within the app's settle time, however far down it was", () => {
    // The unit suite runs with reduced motion on; this is the moving case.
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
    const near = list(120);
    const far = list(9000);
    scrollToTop(near);
    scrollToTop(far);
    vi.advanceTimersByTime(60);
    // Eased out: most of the way there early, and still moving.
    expect(far.scrollTop).toBeGreaterThan(0);
    expect(far.scrollTop).toBeLessThan(4500);
    vi.advanceTimersByTime(200);
    expect(near.scrollTop).toBe(0);
    expect(far.scrollTop).toBe(0);
  });

  const moving = () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  };

  // The list is the finger's first: a touch ends the move where it is.
  it("stops where it is when the list is touched", () => {
    moving();
    const el = list(9000);
    scrollToTop(el);
    vi.advanceTimersByTime(60);
    const at = el.scrollTop;
    expect(at).toBeGreaterThan(0);
    el.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(400);
    expect(el.scrollTop).toBe(at);
  });

  // Two taps on the N: one move, not two writing in turn.
  it("a second ask takes over from the first", () => {
    moving();
    const el = list(9000);
    scrollToTop(el);
    vi.advanceTimersByTime(60);
    scrollToTop(el);
    const seen = [];
    for (let i = 0; i < 20; i++) {
      vi.advanceTimersByTime(16);
      seen.push(el.scrollTop);
    }
    expect(seen).toEqual([...seen].sort((a, b) => b - a));
    expect(el.scrollTop).toBe(0);
  });

  // A frame's own time can be earlier than the tap that asked for it.
  it("never moves the list down on its way up", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const el = list(9000);
    scrollToTop(el);
    frames[0](performance.now() - 50);
    expect(el.scrollTop).toBe(9000);
  });

  it("jumps under reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    const el = list(800);
    scrollToTop(el);
    expect(el.scrollTop).toBe(0);
  });

  it("asks for no frame when the list is at its top already", () => {
    const frame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", frame);
    scrollToTop(list(0));
    expect(frame).not.toHaveBeenCalled();
  });
});
