/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { useFocusTrap } from "../../src/hooks/useFocusTrap";

/**
 * A surface with a focus trap. `placeOwnFocus` focuses the second button in
 * its own effect, as the confirm dialog focuses Cancel.
 */
function Surface({ open, placeOwnFocus = false, initialFocus }) {
  const ref = useRef(null);
  useFocusTrap(ref, open, initialFocus);
  useEffect(() => {
    if (open && placeOwnFocus) ref.current.querySelector("[data-second]").focus();
  }, [open, placeOwnFocus]);
  if (!open) return null;
  return (
    <div ref={ref} data-surface tabIndex={-1}>
      <button type="button" data-first>
        first
      </button>
      <button type="button" data-second>
        second
      </button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const nextFrame = () =>
  act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r()));
  });

function opener() {
  const btn = document.createElement("button");
  btn.textContent = "open";
  document.body.appendChild(btn);
  btn.focus();
  return btn;
}

describe("useFocusTrap", () => {
  it("focuses the first item on open and hands focus back to the opener on close", async () => {
    const btn = opener();
    const { rerender } = render(<Surface open />);
    await nextFrame();
    expect(document.activeElement.dataset.first).toBe("true");
    rerender(<Surface open={false} />);
    expect(document.activeElement).toBe(btn);
  });

  it("leaves focus where the surface itself put it", async () => {
    opener();
    render(<Surface open placeOwnFocus />);
    expect(document.activeElement.dataset.second).toBe("true");
    await nextFrame();
    // The frame after mount would have moved it to the first item.
    expect(document.activeElement.dataset.second).toBe("true");
  });

  it("does not take focus back from a surface that opened as it closed", async () => {
    // The context menu's Rename: the menu closes and the rename field mounts
    // and autofocuses in the same commit. The closing menu must not put focus
    // back on the row's ··· a frame later, or the field blurs and unmounts.
    const btn = opener();
    const { rerender } = render(<Surface open />);
    await nextFrame();
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    rerender(<Surface open={false} />);
    expect(document.activeElement).toBe(field);
    expect(document.activeElement).not.toBe(btn);
  });

  it("Tab wraps inside the surface", async () => {
    opener();
    const { container } = render(<Surface open />);
    await nextFrame();
    const surface = container.querySelector("[data-surface]");
    const last = surface.querySelector("[data-second]");
    last.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement.dataset.first).toBe("true");
  });
});
