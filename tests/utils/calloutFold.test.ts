/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { revealFolded } from "../../src/utils/calloutFold";
import { registerBlockOpener } from "../../src/utils/blockOpen";

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** A callout block, folded or not, with a text node in its body. */
function callout(folded: boolean) {
  document.body.innerHTML = `<div data-block-id="c1"><div class="callout-fold"${
    folded ? " data-folded" : ""
  }><p>hidden words</p></div></div>`;
  return document.querySelector("p")!.firstChild!;
}

describe("revealFolded", () => {
  it("resolves at once for text outside a folded callout, asking nothing", async () => {
    const open = vi.fn();
    const off = registerBlockOpener("c1", open);
    await revealFolded(callout(false));
    await revealFolded(null);
    expect(open).not.toHaveBeenCalled();
    off();
  });

  it("asks the callout to unfold and resolves when its slide ends", async () => {
    const open = vi.fn();
    const off = registerBlockOpener("c1", open);
    const text = callout(true);
    let done = false;
    const shown = revealFolded(text).then(() => {
      done = true;
    });
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ what: "unfold" }));
    await Promise.resolve();
    expect(done).toBe(false);
    document.querySelector(".callout-fold")!.dispatchEvent(new Event("transitionend"));
    await shown;
    expect(done).toBe(true);
    off();
  });

  it("resolves without a slide (reduced motion) after the slide's length", async () => {
    vi.useFakeTimers();
    const off = registerBlockOpener("c1", () => {});
    const shown = revealFolded(callout(true));
    vi.advanceTimersByTime(600);
    await expect(shown).resolves.toBeUndefined();
    off();
  });
});
