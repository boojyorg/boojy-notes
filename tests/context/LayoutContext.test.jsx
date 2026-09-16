/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: { dark: "#111", editor: "#000", divider: "#333" },
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF" },
      // LayoutContext reads this to hand usePanelResize the drag colour.
      sidebarHandle: { hover: "#3A3D4A", active: "#4A4D5A" },
    },
  }),
}));

import { LayoutProvider, useLayout } from "../../src/context/LayoutContext";
import {
  EDITOR_FLOOR_W,
  SIDEBAR_HANDLE_W,
  SIDEBAR_MIN_W,
  WINDOW_MIN_W,
} from "../../src/constants/layout";

const ORIGINAL_WIDTH = window.innerWidth;

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
  it("derives its palette directly from the active theme", () => {
    renderLayout();
    expect(layout.chromeBg).toBe("#111");
    expect(layout.editorBg).toBe("#000");
    expect(layout.accentColor).toBe("#A4CACE");
    expect(layout).not.toHaveProperty("setChromeBg");
    expect(layout).not.toHaveProperty("selectionStyle");
  });

  it("shows the sidebar in the layout by default", () => {
    renderLayout(1200);
    expect(layout.collapsed).toBe(false);
    expect(layout.sidebarVisible).toBe(true);
  });

  // The sidebar has one presentation, in the layout, at every width. Until
  // 2026-09-14 a narrow window took it out of flow and brought it back as an
  // overlay over the note with its own open state; the window now changes only
  // how much room the editor has beside it.
  describe("the window never decides the sidebar", () => {
    it("stays visible when the window narrows past any editor floor", () => {
      renderLayout(1200);
      setWidth(600);
      expect(layout.collapsed).toBe(false);
      expect(layout.sidebarVisible).toBe(true);
      setWidth(1200);
      expect(layout.sidebarVisible).toBe(true);
    });

    it("leaves a deliberately hidden sidebar hidden through a resize", () => {
      renderLayout(1200);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(true);
      expect(layout.sidebarVisible).toBe(false);
      setWidth(600);
      expect(layout.sidebarVisible).toBe(false);
      setWidth(1200);
      expect(layout.collapsed).toBe(true);
      expect(layout.sidebarVisible).toBe(false);
    });

    // The sidebar yields before the note does. The width the user dragged to
    // is kept as the preference; the drawn width is capped so the editor keeps
    // its floor, and widening the window gives the dragged width back.
    it("caps a wide sidebar in a narrow window and gives it back", () => {
      renderLayout(1200);
      act(() => layout.setSidebarWidth(380));
      expect(layout.sidebarWidth).toBe(380);
      setWidth(600);
      expect(layout.sidebarWidth).toBe(600 - SIDEBAR_HANDLE_W - EDITOR_FLOOR_W);
      setWidth(WINDOW_MIN_W);
      expect(layout.sidebarWidth).toBe(SIDEBAR_MIN_W);
      setWidth(1200);
      expect(layout.sidebarWidth).toBe(380);
    });

    it("exposes no overlay state", () => {
      renderLayout(600);
      for (const key of ["sidebarOverlay", "overlayOpen", "overlayWidth", "closeOverlay"]) {
        expect(layout).not.toHaveProperty(key);
      }
    });
  });

  describe("one toggle, one meaning", () => {
    it("toggles `collapsed` at any width", () => {
      renderLayout(1200);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(true);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(false);

      setWidth(600);
      act(() => layout.toggleSidebar());
      expect(layout.collapsed).toBe(true);
      expect(layout.sidebarVisible).toBe(false);
      act(() => layout.toggleSidebar());
      expect(layout.sidebarVisible).toBe(true);
    });

    it("revealSidebar shows the sidebar without toggling it away", () => {
      renderLayout(1200);
      act(() => layout.toggleSidebar()); // hidden
      act(() => layout.revealSidebar());
      expect(layout.sidebarVisible).toBe(true);
      act(() => layout.revealSidebar());
      expect(layout.sidebarVisible).toBe(true);
    });
  });
});
