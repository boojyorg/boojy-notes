/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", surface: "#333", divider: "#444", hover: "#555" },
      ACCENT: { primary: "#A4CACE" },
      SEMANTIC: { error: "#ef4444" },
      modalBg: "#1a1a1e",
      modalShadow: "0 0 20px rgba(0,0,0,0.5)",
      overlay: (opacity) => `rgba(255,255,255,${opacity})`,
    },
  }),
}));

vi.mock("../../src/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

let _trashedNotes = {};
vi.mock("../../src/context/SidebarContext", () => ({
  useSidebar: () => ({ trashedNotes: _trashedNotes }),
  SidebarProvider: ({ children }) => children,
}));

import RecentlyDeletedModal from "../../src/components/RecentlyDeletedModal.jsx";

const defaultProps = () => ({
  open: true,
  onClose: vi.fn(),
  restoreNote: vi.fn(),
  permanentDeleteNote: vi.fn(),
  emptyAllTrash: vi.fn(),
});

beforeEach(() => {
  _trashedNotes = {};
});

afterEach(() => {
  cleanup();
});

describe("RecentlyDeletedModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<RecentlyDeletedModal {...defaultProps()} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows an empty state when there are no deleted notes", () => {
    render(<RecentlyDeletedModal {...defaultProps()} />);
    expect(screen.getByRole("dialog", { name: "Recently Deleted" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing here/)).toBeInTheDocument();
    expect(screen.queryByText("Delete All")).not.toBeInTheDocument();
  });

  it("lists deleted notes with Restore and Delete actions", () => {
    _trashedNotes = {
      t1: { id: "t1", title: "Old Note", deletedAt: Date.now() },
    };
    const props = defaultProps();
    render(<RecentlyDeletedModal {...props} />);
    expect(screen.getByText("Old Note")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Restore"));
    expect(props.restoreNote).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByLabelText("Delete Old Note permanently"));
    expect(props.permanentDeleteNote).toHaveBeenCalledWith("t1");
  });

  it("offers Delete All when notes exist and closes on Escape", () => {
    _trashedNotes = {
      t1: { id: "t1", title: "Old Note", deletedAt: Date.now() },
    };
    const props = defaultProps();
    render(<RecentlyDeletedModal {...props} />);
    fireEvent.click(screen.getByText("Delete All"));
    expect(props.emptyAllTrash).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });
});
