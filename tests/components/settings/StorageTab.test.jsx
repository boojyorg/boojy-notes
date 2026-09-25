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

// Settings → Storage locations: every location, one of them open. A row's
// glyph, name and path are one control that shows it in Finder; Open switches;
// Remove from list never touches the folder; Add folder… adds without switching.
const VAULTS = [
  {
    path: "/Users/tyr/Documents/University/2026 Semester 1/Notes",
    name: "Notes",
    current: true,
    exists: true,
    cloud: false,
  },
  { path: "/Users/tyr/Uni", name: "Uni", current: false, exists: true, cloud: false },
  { path: "/Volumes/X/Old", name: "Old", current: false, exists: false, cloud: false },
];

const renderTab = (props = {}) =>
  render(
    <StorageTab
      isDesktop
      SectionHeader={Header}
      vaults={VAULTS}
      switchVault={vi.fn()}
      addVault={vi.fn()}
      forgetVault={vi.fn()}
      revealVault={vi.fn()}
      {...props}
    />,
  );

describe("StorageTab (Storage locations)", () => {
  afterEach(cleanup);

  it("renders nothing off the desktop", () => {
    const { container } = render(
      <StorageTab isDesktop={false} SectionHeader={Header} vaults={VAULTS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is one row a location: its name and place, the open one marked Active", () => {
    const { getAllByTestId, getByTestId } = renderTab();
    const rows = getAllByTestId("settings-location-row");
    expect(rows).toHaveLength(3);
    expect(getByTestId("location-active")).toHaveTextContent("Active");
    expect(rows[0]).toContainElement(getByTestId("location-active"));
  });

  it("shows a location in Finder from its name and place, never a missing one", () => {
    const revealVault = vi.fn();
    const { getByRole } = renderTab({ revealVault });
    const uni = getByRole("button", { name: "Uni, ~/Uni" });
    // The place is wrapped in invisible direction marks (it is cut from its left).
    expect(uni.textContent.replace(/\u200E/g, "")).toBe("Uni~");
    fireEvent.click(uni);
    expect(revealVault).toHaveBeenCalledWith("/Users/tyr/Uni");
    const old = getByRole("button", { name: "Old, not found" });
    expect(old).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(old);
    expect(revealVault).toHaveBeenCalledTimes(1);
  });

  it("switches with Use, which the open and a missing one do not offer", () => {
    const switchVault = vi.fn();
    const { getByRole, queryByRole } = renderTab({ switchVault });
    expect(queryByRole("button", { name: "Use Notes" })).toBeNull();
    expect(queryByRole("button", { name: "Use Old" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Use Uni" }));
    expect(switchVault).toHaveBeenCalledWith("/Users/tyr/Uni");
  });

  it("offers × on every row, the open one too, while another can be switched to", () => {
    const forgetVault = vi.fn();
    const { getByRole } = renderTab({ forgetVault });
    for (const name of ["Notes", "Uni", "Old"]) {
      expect(getByRole("button", { name: `Remove ${name} from Boojy Notes` })).toBeInTheDocument();
    }
    fireEvent.click(getByRole("button", { name: "Remove Notes from Boojy Notes" }));
    expect(forgetVault).toHaveBeenCalledWith(VAULTS[0]);
  });

  it("offers no × on the last location that can be open", () => {
    const { queryByRole } = renderTab({ vaults: [VAULTS[0], VAULTS[2]] });
    expect(queryByRole("button", { name: "Remove Notes from Boojy Notes" })).toBeNull();
    expect(queryByRole("button", { name: "Remove Old from Boojy Notes" })).toBeInTheDocument();
    cleanup();
    const alone = renderTab({ vaults: [VAULTS[0]] });
    expect(alone.queryByRole("button", { name: /^Remove / })).toBeNull();
  });

  it("adds with Add folder…", () => {
    const addVault = vi.fn();
    const { getByRole } = renderTab({ addVault });
    fireEvent.click(getByRole("button", { name: "Add folder…" }));
    expect(addVault).toHaveBeenCalled();
  });
});
