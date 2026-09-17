/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#fff", divider: "#E9E9E9", surface: "#F4F4F5", hover: "#ECECEC" },
      ACCENT: { primary: "#8FC1C6", onAccentText: "#14110F" },
      button: { bg: "transparent", border: "#DCDCDC" },
      overlay: (alpha) => `rgba(0,0,0,${alpha})`,
    },
  }),
}));

import StorageTab from "../../../src/components/settings/StorageTab";

const Header = ({ title }) => <h2>{title}</h2>;

// Settings → Notes folder: the glyph and path are one control that shows the
// folder; Change folder… is separate because it does something else.
describe("StorageTab (Notes folder)", () => {
  afterEach(cleanup);

  it("renders nothing off the desktop", () => {
    const { container } = render(
      <StorageTab
        isDesktop={false}
        notesDir="/x"
        changeNotesDir={() => {}}
        SectionHeader={Header}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the path as the Show in Finder control, with Change folder… beside it", () => {
    const changeNotesDir = vi.fn();
    const revealNotesDir = vi.fn();
    const { getByRole, getByTestId } = render(
      <StorageTab
        isDesktop
        notesDir="/Users/tyr/Documents/Boojy Notes"
        changeNotesDir={changeNotesDir}
        revealNotesDir={revealNotesDir}
        SectionHeader={Header}
      />,
    );
    const pathControl = getByRole("button", { name: /Show in Finder|Show in folder/ });
    expect(pathControl).toHaveTextContent("~/Documents/Boojy Notes");
    expect(pathControl).toHaveClass("settings-path-control");
    // No native title: the chip names it after the rest.
    expect(pathControl).not.toHaveAttribute("title");
    expect(getByTestId("notes-folder-path")).toBe(pathControl);
    fireEvent.click(pathControl);
    expect(revealNotesDir).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("button", { name: "Change folder…" }));
    expect(changeNotesDir).toHaveBeenCalledTimes(1);
  });

  it("breaks a long path only at its separators", () => {
    const { getByTestId } = render(
      <StorageTab
        isDesktop
        notesDir="/Users/tyr/Documents/University/2026 Semester 1/Notes"
        changeNotesDir={() => {}}
        revealNotesDir={() => {}}
        SectionHeader={Header}
      />,
    );
    const el = getByTestId("notes-folder-path");
    expect(el.querySelectorAll("wbr").length).toBe(4);
    expect(el.textContent).toBe("~/Documents/University/2026 Semester 1/Notes");
  });

  it("shows the path as plain text with no reveal handler (the web build)", () => {
    const { queryByRole, getByRole, getByTestId } = render(
      <StorageTab isDesktop notesDir="/x" changeNotesDir={() => {}} SectionHeader={Header} />,
    );
    expect(queryByRole("button", { name: /Show in Finder|Show in folder/ })).toBeNull();
    expect(getByTestId("notes-folder-path").tagName).toBe("DIV");
    expect(getByRole("button", { name: "Change folder…" })).toBeInTheDocument();
  });
});
