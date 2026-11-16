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

  it("hands focus back without scrolling to it", async () => {
    // Handing focus back to the editor, a contentEditable spanning the note,
    // scrolled the note to its caret when the image menu closed (2026-09-23).
    const btn = opener();
    const focus = vi.spyOn(btn, "focus");
    const { rerender } = render(<Surface open />);
    await nextFrame();
    rerender(<Surface open={false} />);
    expect(focus).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }));
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

  const pressTab = (el, shiftKey = false) => {
    const tab = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(tab);
    return tab;
  };

  it("Tab stays on the one field when every other button is no Tab stop", async () => {
    // The search palette: a field, then result rows that are tabindex -1.
    opener();
    const { container } = render(<Palette />);
    await nextFrame();
    const field = container.querySelector("input");
    expect(document.activeElement).toBe(field);
    expect(pressTab(field).defaultPrevented).toBe(true);
    expect(pressTab(field, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
  });

  it("Tab from something that is no stop goes to the nearest stop, never out", async () => {
    opener();
    const { container } = render(<Palette stops />);
    await nextFrame();
    const row = container.querySelector("[data-row]");
    row.focus();
    // Forward from the row, between the field and the last button.
    expect(pressTab(row).defaultPrevented).toBe(true);
    expect(document.activeElement.dataset.close).toBe("true");
    row.focus();
    expect(pressTab(row, true).defaultPrevented).toBe(true);
    expect(document.activeElement.tagName).toBe("INPUT");
  });

  it("Tab goes nowhere in a surface with no Tab stop at all", async () => {
    // The path's folder menu: focus on the container, every row tabindex -1.
    opener();
    const { container } = render(<Rows />);
    await nextFrame();
    const surface = container.querySelector("[data-surface]");
    expect(document.activeElement).toBe(surface);
    expect(pressTab(surface).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(surface);
  });

  it("hands focus back to the opener when the surface autofocuses its own field", async () => {
    // autoFocus lands in the commit, before any effect: the opener is read
    // earlier, or the surface would remember its own field.
    const btn = opener();
    const { rerender } = render(<Host open />);
    await nextFrame();
    expect(document.activeElement.tagName).toBe("INPUT");
    rerender(<Host open={false} />);
    expect(document.activeElement).toBe(btn);
  });
});

function Palette({ stops = false }) {
  const ref = useRef(null);
  useFocusTrap(ref, true, "first");
  return (
    <div ref={ref}>
      {/* biome-ignore lint/a11y/noAutofocus: the case under test */}
      <input autoFocus aria-label="field" />
      <button type="button" tabIndex={-1} data-row>
        row
      </button>
      {stops && (
        <button type="button" data-close>
          close
        </button>
      )}
    </div>
  );
}

function Host({ open }) {
  return open ? <Palette /> : null;
}

function Rows() {
  const ref = useRef(null);
  useFocusTrap(ref, true, "container");
  return (
    <div ref={ref} data-surface tabIndex={-1}>
      <button type="button" tabIndex={-1}>
        row
      </button>
      <button type="button" tabIndex={-1}>
        row
      </button>
    </div>
  );
}
