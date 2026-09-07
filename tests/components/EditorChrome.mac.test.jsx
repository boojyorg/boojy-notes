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

vi.mock("../../src/context/LayoutContext", () => ({
  useLayout: () => ({ sidebarVisible: false, toggleSidebar: vi.fn() }),
}));

// macOS Electron: the traffic lights hold the viewport's top-left corner once
// the sidebar is hidden, so the collapsed toggle shifts right of them.
vi.mock("../../src/utils/platform", () => ({ isElectronMac: true }));

import EditorChrome, {
  CHROME_BTN,
  COLLAPSED_TOGGLE_CLEARANCE,
  MAC_TRAFFIC_INSET,
} from "../../src/components/EditorChrome.jsx";

afterEach(cleanup);

/**
 * Review H12: the note label kept clear of the toggle as if it sat at the web
 * inset, so on macOS the glyph was drawn over the first letters of the name.
 * The clearance EditorArea reserves must follow the toggle to wherever it is.
 */
describe("EditorChrome on macOS with the sidebar hidden", () => {
  it("pins the toggle right of the traffic lights and publishes a clearance past its box", () => {
    const { getByTitle } = render(<EditorChrome activeNote="n1" onNoteActions={vi.fn()} />);
    const toggle = getByTitle("Show sidebar");
    const wrapper = toggle.parentElement;
    const left = Number.parseInt(wrapper.style.left, 10);
    expect(left).toBe(MAC_TRAFFIC_INSET);
    // Right edge of the toggle plus air; the label starts here or later.
    expect(COLLAPSED_TOGGLE_CLEARANCE).toBeGreaterThanOrEqual(left + CHROME_BTN + 8);
  });
});
