/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { surface: "#F4F4F5", divider: "#E9E9E9", hover: "#ECECEC" },
      ACCENT: { primary: "#2A737D" },
    },
    isDark: false,
  }),
}));

// Mutable so one test can put the window into full screen.
const layout = vi.hoisted(() => ({ fullScreen: false }));
vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => ({
    sidebarVisible: false,
    sidebarWidth: 260,
    fullScreen: layout.fullScreen,
    toggleSidebar: vi.fn(),
  }),
}));

// macOS Electron: the traffic lights hold the viewport's top-left corner once
// the sidebar is hidden, so the collapsed group shifts right of them.
vi.mock("../../src/utils/platform", () => ({ isElectronMac: true, isMac: true }));

import EditorChrome, {
  CHROME_INSET,
  MAC_TRAFFIC_INSET,
  chromeControlsLeft,
  chromePathInset,
  CHROME_PATH_RIGHT_INSET,
  PATH_AIR,
  trafficLightsShown,
} from "../../src/components/EditorChrome.jsx";

afterEach(() => {
  cleanup();
  layout.fullScreen = false;
});

/**
 * Review H12: the note label kept clear of the toggle as if it sat at the web
 * inset, so on macOS the glyph was drawn over the first letters of the name.
 * The inset the path band (NotePath) starts at must follow the controls to
 * wherever they are — and, since 2026-09-12, past all of them rather than
 * past the toggle.
 */
describe("EditorChrome on macOS with the sidebar hidden", () => {
  it("pins the left group right of the traffic lights and clears its whole width", () => {
    const { getByLabelText } = render(
      <EditorChrome
        activeNote="n1"
        onNoteActions={vi.fn()}
        onNewNote={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );
    // toggle → its own group → the pinned left block.
    const group = getByLabelText("Toggle sidebar").parentElement.parentElement;
    expect(Number.parseInt(group.style.left, 10)).toBe(MAC_TRAFFIC_INSET);
    expect(chromeControlsLeft(true)).toBe(MAC_TRAFFIC_INSET);

    // Three controls, and the path's band starts past the last of them.
    for (const t of ["Toggle sidebar", "Search notes", "New note"]) {
      expect(getByLabelText(t)).toBeInTheDocument();
    }
    // 3 buttons at 32 + two 2px gaps, then the band's air.
    expect(chromePathInset(true)).toBe(MAC_TRAFFIC_INSET + 100 + PATH_AIR);
    // Expanded, nothing is on the editor's side of the row (Undo and Redo are
    // the menu bar's since 2026-09-24): the band starts at the inset's air.
    expect(chromePathInset(false)).toBe(10 + PATH_AIR);
    // The right edge clears the ··· by the same air, in every state.
    expect(CHROME_PATH_RIGHT_INSET).toBe(10 + 32 + PATH_AIR);
  });
});

/**
 * macOS full screen hides the traffic lights, so the 86px that cleared them
 * was dead space in front of the collapsed group and the note's path sat a
 * long way right for nothing (2026-09-14). Both fall back to the web inset
 * while full screen is on.
 */
describe("EditorChrome on macOS in full screen", () => {
  it("drops the traffic-light inset", () => {
    layout.fullScreen = true;
    const { getByLabelText, container } = render(
      <EditorChrome
        activeNote="n1"
        onNoteActions={vi.fn()}
        onNewNote={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );
    const group = getByLabelText("Toggle sidebar").parentElement.parentElement;
    expect(Number.parseInt(group.style.left, 10)).toBe(CHROME_INSET);
    expect(trafficLightsShown(true)).toBe(false);
    expect(trafficLightsShown(false)).toBe(true);
    expect(chromeControlsLeft(true, true)).toBe(CHROME_INSET);
    expect(chromePathInset(true, true)).toBe(CHROME_INSET + 100 + PATH_AIR);
    // Expanded the group never sat behind the lights, so nothing changes.
    expect(chromePathInset(false, true)).toBe(chromePathInset(false, false));
    // No drag strip anywhere: the path band is the drag region now (NotePath).
    expect(container.querySelector("[data-testid='window-drag-strip']")).toBeNull();
  });
});
