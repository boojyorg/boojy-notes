/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { suppressNextClick } from "../../src/utils/domHelpers";

describe("suppressNextClick", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("swallows exactly the next click, then gets out of the way", () => {
    const target = document.createElement("button");
    document.body.appendChild(target);
    const seen = vi.fn();
    target.addEventListener("click", seen);

    suppressNextClick();
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).not.toHaveBeenCalled();

    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("expires on its own if no click follows, so a later deliberate click is honoured", () => {
    vi.useFakeTimers();
    const target = document.createElement("button");
    document.body.appendChild(target);
    const seen = vi.fn();
    target.addEventListener("click", seen);

    suppressNextClick(200);
    vi.advanceTimersByTime(250);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
