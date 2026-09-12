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
  useLayout: () => ({
    sidebarVisible: false,
    sidebarInFlow: false,
    sidebarWidth: 260,
    toggleSidebar: vi.fn(),
  }),
}));

vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteDataActions: () => ({ canUndo: true, canRedo: true, undo: vi.fn(), redo: vi.fn() }),
}));

// macOS Electron: the traffic lights hold the viewport's top-left corner once
// the sidebar is hidden, so the collapsed group shifts right of them.
vi.mock("../../src/utils/platform", () => ({ isElectronMac: true }));

import EditorChrome, {
  MAC_TRAFFIC_INSET,
  chromeControlsLeft,
  chromeLabelClearance,
} from "../../src/components/EditorChrome.jsx";

afterEach(cleanup);

/**
 * Review H12: the note label kept clear of the toggle as if it sat at the web
 * inset, so on macOS the glyph was drawn over the first letters of the name.
 * The clearance EditorArea reserves must follow the controls to wherever they
 * are — and, since 2026-09-12, past all of them rather than past the toggle.
 */
describe("EditorChrome on macOS with the sidebar hidden", () => {
  it("pins the left group right of the traffic lights and clears its whole width", () => {
    const { getByTitle } = render(
      <EditorChrome
        activeNote="n1"
        onNoteActions={vi.fn()}
        onNewNote={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );
    // toggle → its own group → the pinned left block.
    const group = getByTitle("Show sidebar").parentElement.parentElement;
    expect(Number.parseInt(group.style.left, 10)).toBe(MAC_TRAFFIC_INSET);
    expect(chromeControlsLeft(true)).toBe(MAC_TRAFFIC_INSET);

    // Five controls in two groups, and the label starts past the last of them.
    const controls = ["Show sidebar", "Search notes", "New note", "Undo", "Redo"].map((t) =>
      getByTitle(t),
    );
    expect(controls).toHaveLength(5);
    // 3 buttons at 32 + two 2px gaps, a 12px step, 2 buttons at 32 + one gap,
    // then 8px of air: the reserve must reach past all of it.
    expect(chromeLabelClearance(true)).toBe(MAC_TRAFFIC_INSET + 100 + 12 + 66 + 8);
    // Expanded, only the history pair is on the row, from the editor's inset.
    expect(chromeLabelClearance(false)).toBe(10 + 66 + 8);
  });
});
