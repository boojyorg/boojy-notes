import { act, render } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useExitGhost } from "../../src/hooks/useExitGhost";
import { MOTION_EXIT_MS } from "../../src/tokens/motion";

const realMatchMedia = window.matchMedia;
const setReducedMotion = (on: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

function Surface({ open = true, fixed = true }: { open?: boolean; fixed?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useExitGhost(ref, open);
  if (!open) return null;
  return (
    <div
      ref={ref}
      id="menu"
      data-folder-path="a"
      className="motion-pop"
      style={fixed ? { position: "fixed", left: 12, top: 34 } : undefined}
    >
      <input id="q" data-x="1" autoFocus defaultValue="" />
      <button type="button">Rename</button>
    </div>
  );
}

const ghosts = () => document.body.querySelectorAll(".motion-ghost");
const flush = () => act(async () => {});

describe("useExitGhost", () => {
  beforeEach(() => {
    setReducedMotion(false);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = realMatchMedia;
    for (const g of ghosts()) g.remove();
  });

  it("leaves an inert, unreachable copy when the surface unmounts, and removes it", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<Surface />);
    const field = document.getElementById("q") as HTMLInputElement;
    field.value = "typed";
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    const [ghost] = [...ghosts()] as HTMLElement[];
    expect(ghost).toBeTruthy();
    expect(ghost.hasAttribute("inert")).toBe(true);
    expect(ghost.getAttribute("aria-hidden")).toBe("true");
    // Position is the surface's own inline position.
    expect(ghost.style.left).toBe("12px");
    // Nothing the app looks a surface up by, and nothing that could take focus.
    expect(ghost.querySelector("[id]")).toBeNull();
    expect(ghost.id).toBe("");
    expect(ghost.querySelector("[data-x]")).toBeNull();
    expect(ghost.hasAttribute("data-folder-path")).toBe(false);
    expect(ghost.querySelector("[autofocus]")).toBeNull();
    // What had been typed survives the copy.
    expect((ghost.querySelector("input") as HTMLInputElement).value).toBe("typed");

    act(() => {
      vi.advanceTimersByTime(MOTION_EXIT_MS + 60);
    });
    expect(ghosts().length).toBe(0);
  });

  it("makes one when a component that stays mounted stops rendering its surface", async () => {
    const { rerender } = render(<Surface open />);
    rerender(<Surface open={false} />);
    await flush();
    expect(ghosts().length).toBe(1);
  });

  it("finds a surface that mounts after the component's first pass (a menu waiting to measure)", async () => {
    function LateSurface() {
      const ref = useRef<HTMLDivElement>(null);
      const [ready, setReady] = useState(false);
      useExitGhost(ref);
      useLayoutEffect(() => setReady(true), []);
      return ready ? (
        <div ref={ref} style={{ position: "fixed", left: 1, top: 2 }}>
          Late
        </div>
      ) : null;
    }
    const { unmount } = render(<LateSurface />);
    unmount();
    await flush();
    expect(ghosts().length).toBe(1);
  });

  it("makes none for a surface it could not place: detached and not fixed", async () => {
    const { rerender } = render(<Surface open fixed={false} />);
    rerender(<Surface open={false} fixed={false} />);
    await flush();
    expect(ghosts().length).toBe(0);
  });

  it("does not take StrictMode's rehearsal of a mount for a close", async () => {
    render(
      <StrictMode>
        <Surface />
      </StrictMode>,
    );
    await flush();
    expect(ghosts().length).toBe(0);
  });

  it("makes none under reduced motion", async () => {
    setReducedMotion(true);
    const { unmount } = render(<Surface />);
    unmount();
    await flush();
    expect(ghosts().length).toBe(0);
  });
});
