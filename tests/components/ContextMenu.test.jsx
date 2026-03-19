/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

// ── Theme mock ──────────────────────────────────────────────────────────────
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: {
        dark: "#1a1a1e",
        editor: "#1a1a1e",
        elevated: "#2a2a2e",
        surface: "#333",
        divider: "#444",
        hover: "#555",
        darkest: "#111",
      },
      ACCENT: { primary: "#A4CACE" },
      SEMANTIC: { error: "#ef4444" },
      overlay: (a) => `rgba(255,255,255,${a})`,
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

// ── Import component after mocks ────────────────────────────────────────────
import ContextMenu from "../../src/components/ContextMenu.jsx";

// ── Helpers ─────────────────────────────────────────────────────────────────
const baseProps = () => ({
  ctxMenu: null,
  setCtxMenu: vi.fn(),
  openNote: vi.fn(),
  duplicateNote: vi.fn(),
  deleteNote: vi.fn(),
  deleteFolder: vi.fn(),
  createNote: vi.fn(),
  setRenamingFolder: vi.fn(),
  restoreNote: vi.fn(),
  permanentDeleteNote: vi.fn(),
  titleRef: { current: null },
  onExportPdf: null,
  onExportDocx: null,
  onImport: null,
  selectedNotes: new Set(),
  selectedCount: 0,
  bulkDeleteNotes: vi.fn(),
  bulkMoveNotes: vi.fn(),
  folderList: [],
});

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ContextMenu", () => {
  it("renders nothing when ctxMenu is null", () => {
    const { container } = render(<ContextMenu {...baseProps()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders note context menu items", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    expect(getByText("Rename")).toBeInTheDocument();
    expect(getByText("Duplicate")).toBeInTheDocument();
    expect(getByText("Delete")).toBeInTheDocument();
  });

  it("renders folder context menu items", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "f1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    expect(getByText("New note here")).toBeInTheDocument();
    expect(getByText("Rename")).toBeInTheDocument();
    expect(getByText("Delete folder")).toBeInTheDocument();
  });

  it("renders trash context menu items", () => {
    const props = baseProps();
    props.ctxMenu = { type: "trash", id: "t1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    expect(getByText("Restore")).toBeInTheDocument();
    expect(getByText("Delete permanently")).toBeInTheDocument();
  });

  it("calls deleteNote when Delete is clicked", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("Delete"));
    expect(props.deleteNote).toHaveBeenCalledWith("n1");
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("calls duplicateNote when Duplicate is clicked", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("Duplicate"));
    expect(props.duplicateNote).toHaveBeenCalledWith("n1");
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("closes menu on Escape key", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    render(<ContextMenu {...props} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("closes menu when clicking the backdrop overlay", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { container } = render(<ContextMenu {...props} />);
    // The first child div is the backdrop overlay (position: fixed, inset: 0)
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });
});
