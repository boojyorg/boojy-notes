/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLinkHoverTooltip } from "../../../src/hooks/editor/useLinkHoverTooltip";

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  container.innerHTML =
    'text <span class="wikilink" data-target="Beta">Beta</span> and <a href="https://x.y" data-url="https://x.y">x</a>';
  const link = container.querySelector(".wikilink") as HTMLElement;
  const anchor = container.querySelector("a") as HTMLElement;
  const hook = renderHook(() => useLinkHoverTooltip({ current: container }));
  const moveOver = (target: Element) =>
    act(() => {
      hook.result.current.onMouseMove({ target } as never);
    });
  const leave = () =>
    act(() => {
      hook.result.current.onMouseLeave();
    });
  return { ...hook, container, link, anchor, moveOver, leave };
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useLinkHoverTooltip", () => {
  it("shows the [[target]] after resting on a wikilink, and hides it on leave", () => {
    const h = setup();
    h.moveOver(h.link);
    expect(h.result.current.tooltip).toBeNull();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(h.result.current.tooltip?.url).toBe("[[Beta]]");
    h.leave();
    expect(h.result.current.tooltip).toBeNull();
  });

  it("never shows a tooltip once the pointer has left before the delay", () => {
    // The old code stored the URL on the timer handle (a number in the
    // browser), threw in strict mode, and left the timer untracked, so leaving
    // could not cancel it.
    const h = setup();
    expect(() => h.moveOver(h.link)).not.toThrow();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    h.moveOver(h.container.firstChild!.parentElement!); // pointer on plain text
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(h.result.current.tooltip).toBeNull();
  });

  it("does not restart the delay while the pointer moves within the same link", () => {
    const h = setup();
    h.moveOver(h.link);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    h.moveOver(h.link);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(h.result.current.tooltip?.url).toBe("[[Beta]]");
  });

  it("moving to another link supersedes the pending hover", () => {
    const h = setup();
    h.moveOver(h.link);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    h.moveOver(h.anchor);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(h.result.current.tooltip).toBeNull();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(h.result.current.tooltip?.url).toBe("https://x.y");
  });

  it("cancels the pending hover on unmount", () => {
    const h = setup();
    h.moveOver(h.link);
    h.unmount();
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});
