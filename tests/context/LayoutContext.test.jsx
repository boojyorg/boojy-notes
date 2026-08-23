/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: { dark: "#111", editor: "#000", divider: "#333" },
      ACCENT: { primary: "#A4CACE" },
      // LayoutContext reads this to hand usePanelResize the drag colour.
      sidebarHandle: { hover: "#3A3D4A", active: "#4A4D5A" },
    },
  }),
}));

import { LayoutProvider, useLayout } from "../../src/context/LayoutContext";
import { MIN_EDITOR_WIDTH, FIT_HYSTERESIS } from "../../src/hooks/useSidebarFits";
import { SIDEBAR_DEFAULT_W } from "../../src/constants/layout";

const ORIGINAL_WIDTH = window.innerWidth;
/** Default sidebar width; the fit threshold is this plus the editor floor. */
// Imported, not duplicated: the fit threshold moves with the real default.
const DEFAULT_W = SIDEBAR_DEFAULT_W;
const THRESHOLD = DEFAULT_W + MIN_EDITOR_WIDTH;

let layout;

function Probe() {
  layout = useLayout();
  return null;
}

function renderLayout(width = 1200) {
  window.innerWidth = width;
  return render(
    <LayoutProvider>
      <Probe />
    </LayoutProvider>,
  );
}

function setWidth(px) {
  act(() => {
    window.innerWidth = px;
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  window.innerWidth = ORIGINAL_WIDTH;
});

afterEach(() => {
  cleanup();
  window.innerWidth = ORIGINAL_WIDTH;
});

describe("LayoutContext sidebar presentation", () => {
  it("keeps the sidebar in flow when there is room", () => {
    renderLayout(1200);
    expect(layout.sidebarOverlay).toBe(false);
    expect(layout.sidebarInFlow).toBe(true);
    expect(layout.sidebarVisible).toBe(true);
  });

  it("switches to overlay, closed, when the window can't hold both", () => {
    renderLayout(1200);
    setWidth(THRESHOLD - 1);
    expect(layout.sidebarOverlay).toBe(true);
    expect(layout.sidebarInFlow).toBe(false);
    // Closed by default: the space goes to the editor until asked otherwise.
    expect(layout.sidebarVisible).toBe(false);
  });

  describe("the user's preference survives the window", () => {
    it("does not write `collapsed` when the sidebar is squeezed out", () => {
      renderLayout(1200);
      expect(layout.collapsed).toBe(false);
      setWidth(THRESHOLD - 1);
      expect(layout.collapsed).toBe(false);
      setWidth(THRESHOLD + FIT_HYSTERESIS);
      // Widening restores exactly what was there before.
      expect(layout.sidebarVisible).toBe(true);
      expect(layout.sidebarInFlow).toBe(true);
    });

    it("leaves a deliberately hidden sidebar hidden after a round trip", () => {
      renderLayout(1200);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(true);
      expect(layout.sidebarVisible).toBe(false);

      setWidth(THRESHOLD - 1);
      act(() => layout.toggleSidebar()); // open the overlay
      expect(layout.sidebarVisible).toBe(true);

      setWidth(THRESHOLD + FIT_HYSTERESIS);
      // Back in flow: still hidden, because that is what the user chose.
      expect(layout.collapsed).toBe(true);
      expect(layout.sidebarVisible).toBe(false);
    });
  });

  describe("one toggle, one meaning", () => {
    it("toggles `collapsed` in flow and `overlayOpen` in overlay", () => {
      renderLayout(1200);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(true);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(false);

      setWidth(THRESHOLD - 1);
      const collapsedBefore = layout.collapsed;
      act(() => layout.toggleSidebar());
      expect(layout.overlayOpen).toBe(true);
      act(() => layout.toggleSidebar());
      expect(layout.overlayOpen).toBe(false);
      expect(layout.collapsed).toBe(collapsedBefore);
    });

    it("revealSidebar shows the sidebar without toggling it away", () => {
      renderLayout(1200);
      act(() => layout.toggleSidebar()); // hidden
      act(() => layout.revealSidebar());
      expect(layout.sidebarVisible).toBe(true);
      act(() => layout.revealSidebar());
      expect(layout.sidebarVisible).toBe(true);

      setWidth(THRESHOLD - 1);
      act(() => layout.revealSidebar());
      expect(layout.overlayOpen).toBe(true);
      act(() => layout.revealSidebar());
      expect(layout.overlayOpen).toBe(true);
    });
  });

  it("drops a stale open overlay when the window widens", () => {
    renderLayout(1200);
    setWidth(THRESHOLD - 1);
    act(() => layout.toggleSidebar());
    expect(layout.overlayOpen).toBe(true);

    setWidth(THRESHOLD + FIT_HYSTERESIS);
    expect(layout.overlayOpen).toBe(false);
    // ...so narrowing again starts closed rather than resurrecting the panel.
    setWidth(THRESHOLD - 1);
    expect(layout.sidebarVisible).toBe(false);
  });

  it("closeOverlay is a no-op for an in-flow sidebar", () => {
    renderLayout(1200);
    act(() => layout.closeOverlay());
    expect(layout.sidebarVisible).toBe(true);
    expect(layout.collapsed).toBe(false);
  });

  describe("overlay width", () => {
    it("preserves the width the user dragged to", () => {
      renderLayout(1200);
      expect(layout.overlayWidth).toContain(`${DEFAULT_W}px`);
    });

    it("caps against the viewport so a strip of editor always shows", () => {
      renderLayout(1200);
      act(() => layout.setSidebarWidth(400));
      // min() against the viewport does the capping; max() keeps a usable floor.
      expect(layout.overlayWidth).toMatch(/^max\(\d+px, min\(400px, calc\(100vw - \d+px\)\)\)$/);
    });
  });
});
