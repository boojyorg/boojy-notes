/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ setThemeMode: vi.fn() }));

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#fff", divider: "#E9E9E9", surface: "#F4F4F5", hover: "#ECECEC" },
      ACCENT: { primary: "#8FC1C6", onAccent: "#fff", onAccentText: "#14110F" },
      button: { bg: "transparent", border: "#DCDCDC" },
      modalShadow: "none",
    },
    themeMode: "auto",
    setThemeMode: mocks.setThemeMode,
  }),
}));
vi.mock("../../../src/hooks/useFocusTrap", () => ({ useFocusTrap: vi.fn() }));

import SetupDialog from "../../../src/components/settings/SetupDialog";

const props = () => ({
  notesDir: "/Users/tyr/Documents/Boojy/Notes",
  folderExists: false,
  onChooseFolder: vi.fn(),
  onReveal: vi.fn(),
  onDone: vi.fn(),
});

// First-run setup: one dialog, every way out ends it the same way, the path
// is plain text until the folder exists.
describe("SetupDialog", () => {
  afterEach(cleanup);
  beforeEach(() => mocks.setThemeMode.mockClear());

  it("opens on System, names its parts, and shows the default path as text", () => {
    const p = props();
    render(<SetupDialog {...p} />);
    expect(mocks.setThemeMode).toHaveBeenCalledWith("auto");
    const dialog = screen.getByRole("dialog", { name: "Welcome to Boojy Notes" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent(
      "A simple place to write and organise your notes, saved as Markdown files in a folder you choose.",
    );
    expect(screen.getByTestId("notes-folder-path")).toHaveTextContent("~/Documents/Boojy/Notes");
    expect(screen.queryByRole("button", { name: /Show in Finder|Show in folder/ })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Appearance" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose folder…" }));
    expect(p.onChooseFolder).toHaveBeenCalledTimes(1);
  });

  it("makes the path a control once the folder exists", () => {
    const p = { ...props(), folderExists: true };
    render(<SetupDialog {...p} />);
    fireEvent.click(screen.getByRole("button", { name: /Show in Finder|Show in folder/ }));
    expect(p.onReveal).toHaveBeenCalledTimes(1);
  });

  it("Create note ends with 'create'; ×, Escape and the scrim end with 'dismiss'", () => {
    const p = props();
    render(<SetupDialog {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Create note" }));
    expect(p.onDone).toHaveBeenLastCalledWith("create");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(p.onDone).toHaveBeenLastCalledWith("dismiss");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onDone).toHaveBeenLastCalledWith("dismiss");
    fireEvent.click(screen.getByTestId("setup-scrim"));
    expect(p.onDone).toHaveBeenLastCalledWith("dismiss");
    expect(p.onDone).toHaveBeenCalledTimes(4);
  });
});
