/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { divider: "#444" },
      ACCENT: { primary: "#A4CACE", onAccent: "#13151C" },
      SEMANTIC: { error: "#ef4444" },
      modalBg: "#1a1a1e",
      modalShadow: "0 4px 12px rgba(0,0,0,0.4)",
    },
  }),
}));

import ConfirmDialog from "../../src/components/ConfirmDialog.jsx";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const baseConfirm = {
  title: "Delete note?",
  message: "This can't be undone.",
  confirmLabel: "Delete",
  danger: true,
};

describe("ConfirmDialog", () => {
  it("renders nothing when confirm is null", () => {
    const { container } = render(
      <ConfirmDialog confirm={null} accentColor="#abc" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it("renders the title, message, and labels when open", () => {
    render(
      <ConfirmDialog
        confirm={baseConfirm}
        accentColor="#abc"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Delete note?")).toBeTruthy();
    expect(screen.getByText("This can't be undone.")).toBeTruthy();
    expect(screen.getByText("Delete")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });

  it("fires onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        confirm={baseConfirm}
        accentColor="#abc"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("fires onCancel when the cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        confirm={baseConfirm}
        accentColor="#abc"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        confirm={baseConfirm}
        accentColor="#abc"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Enter activates the focused button, natively; the dialog never takes the
  // key itself (review 2026-09-07, §4.1: Enter confirmed with Cancel focused).
  it("Enter is left to the focused button: a danger dialog opens on Cancel, a plain one on Confirm", () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        confirm={baseConfirm}
        accentColor="#abc"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(screen.getByText("Cancel"));
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();

    rerender(
      <ConfirmDialog
        confirm={{ title: "Rename?", confirmLabel: "Rename" }}
        accentColor="#abc"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    expect(document.activeElement).toBe(screen.getByText("Rename"));
  });

  it("a re-render with fresh callbacks does not move focus back to the default button", () => {
    const confirm = baseConfirm;
    const { rerender } = render(
      <ConfirmDialog confirm={confirm} accentColor="#abc" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    screen.getByText("Delete").focus();
    // The app re-renders (a toast expiring) and hands the dialog new arrows.
    rerender(
      <ConfirmDialog confirm={confirm} accentColor="#abc" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(document.activeElement).toBe(screen.getByText("Delete"));
  });

  it("falls back to default labels when none are given", () => {
    render(
      <ConfirmDialog
        confirm={{ title: "Sure?" }}
        accentColor="#abc"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Confirm")).toBeTruthy();
    expect(screen.getByText("Cancel")).toBeTruthy();
  });
});
