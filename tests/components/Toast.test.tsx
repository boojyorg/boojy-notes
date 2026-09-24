/** @vitest-environment jsdom */
/**
 * A notification is the menus' own surface with one coloured mark on it, never
 * a slab of colour: the info toast used to be a 360px fill of the accent — the
 * largest accent surface in the app — with white text on it at about 2:1
 * (2026-09-19). What varies by kind is the mark, whether the thing waits to be
 * dismissed, and how loudly it is announced.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Toast from "../../src/components/Toast";

const theme = {
  BG: { elevated: "#1a1a1e", divider: "#444", surface: "#26262b" },
  TEXT: { primary: "#f4f4f5", muted: "#8a8a91" },
  ACCENT: { text: "#9CC9CE" },
  SEMANTIC: { error: "#ef4444", warning: "#f59e0b" },
  modalShadow: "0 24px 48px rgba(0,0,0,0.12)",
};

afterEach(cleanup);

const box = (): HTMLElement => document.querySelector("[data-toast-kind]") as HTMLElement;

describe("Toast", () => {
  it("is the elevated surface with a hairline, ordinary ink and no accent fill", () => {
    render(<Toast message="Moved to the Trash" kind="done" onDismiss={vi.fn()} theme={theme} />);
    const el = box();
    expect(el.style.background).toBe("rgb(26, 26, 30)");
    expect(el.style.border).toBe("1px solid rgb(68, 68, 68)");
    expect(el.style.color).toBe("rgb(244, 244, 245)");
    // The menus' shadow: in Light the elevated ground is the sheet's own white.
    expect(el.style.boxShadow).toBe("0 24px 48px rgba(0,0,0,0.12)");
    expect(screen.getByText("Moved to the Trash")).toBeInTheDocument();
  });

  it("a receipt is polite, fades by itself, and a click anywhere takes it early", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Moved to the Trash" kind="done" onDismiss={onDismiss} theme={theme} />);
    const el = box();
    expect(el).toHaveAttribute("role", "status");
    expect(el).toHaveAttribute("aria-live", "polite");
    // No × on a receipt: it is going anyway.
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    fireEvent.click(el);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("anything that waits is announced, dismissed by its own ×, and not by a stray click", () => {
    const onDismiss = vi.fn();
    render(<Toast message="Could not write" kind="error" onDismiss={onDismiss} theme={theme} />);
    const el = box();
    expect(el).toHaveAttribute("role", "alert");
    expect(el).toHaveAttribute("aria-live", "assertive");
    // The message can be read and selected; only the × ends it.
    fireEvent.click(screen.getByText("Could not write"));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("the meaning is in the mark's colour: muted, accent, warning, error", () => {
    const mark = () => (box().firstElementChild as HTMLElement).style.color;

    render(<Toast message="a" kind="done" onDismiss={vi.fn()} theme={theme} />);
    expect(mark()).toBe("rgb(138, 138, 145)");
    cleanup();

    render(<Toast message="a" kind="notice" onDismiss={vi.fn()} theme={theme} />);
    expect(mark()).toBe("rgb(156, 201, 206)");
    cleanup();

    render(<Toast message="a" kind="warning" onDismiss={vi.fn()} theme={theme} />);
    expect(mark()).toBe("rgb(245, 158, 11)");
    cleanup();

    render(<Toast message="a" kind="error" onDismiss={vi.fn()} theme={theme} />);
    expect(mark()).toBe("rgb(239, 68, 68)");
  });

  it("draws the glyph the message asked for, and the kind's own otherwise", () => {
    render(
      <Toast
        message="Moved to the Trash"
        kind="done"
        icon="trash"
        onDismiss={vi.fn()}
        theme={theme}
      />,
    );
    // Lucide names its glyphs in a class, which is how the two are told apart.
    expect(box().querySelector("svg.lucide-trash")).not.toBeNull();
    cleanup();

    render(<Toast message="Kept in a copy" kind="notice" onDismiss={vi.fn()} theme={theme} />);
    expect(box().querySelector("svg.lucide-info")).not.toBeNull();
  });

  it("defaults to an error, the kind a bare showToast raises", () => {
    render(<Toast message="Could not write" onDismiss={vi.fn()} theme={theme} />);
    expect(box()).toHaveAttribute("data-toast-kind", "error");
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });
});
