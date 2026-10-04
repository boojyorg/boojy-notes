/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: {
        elevated: "#fff",
        editor: "#fff",
        divider: "#E9E9E9",
        surface: "#F4F4F5",
        hover: "#ECECEC",
      },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccentText: "#14110F" },
      SEMANTIC: { error: "#C62D2D" },
      modalShadow: "none",
      button: { bg: "transparent", border: "#DCDCDC" },
      overlay: (alpha) => `rgba(0,0,0,${alpha})`,
    },
  }),
}));

import StorageTab from "../../../src/components/settings/StorageTab";

const Header = ({ title }) => <h2>{title}</h2>;

// Settings → Storage locations: every location, A–Z as the main process
// sends them, the open one ticked. A row's ··· opens Switch to, Rename…,
// Show in Finder and Remove from list…, leaving out what cannot work there.
// Rename is the name in the app alone; Add folder… adds without switching.
const VAULTS = [
  {
    path: "/Users/tyr/Documents/University/2026 Semester 1/Notes",
    name: "Notes",
    folderName: "Notes",
    current: true,
    exists: true,
    cloud: false,
  },
  {
    path: "/Volumes/X/Old",
    name: "Old",
    folderName: "Old",
    current: false,
    exists: false,
    cloud: false,
  },
  {
    path: "/Users/tyr/Uni",
    name: "Uni",
    folderName: "Uni",
    current: false,
    exists: true,
    cloud: false,
  },
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
      renameVault={vi.fn()}
      revealVault={vi.fn()}
      {...props}
    />,
  );

/** The labels of the row's ··· menu, opened by a click. */
const openMenu = (utils, name) => {
  fireEvent.click(utils.getByRole("button", { name: `${name} options` }));
  return utils.getAllByRole("menuitem").map((el) => el.textContent);
};

describe("StorageTab (Storage locations)", () => {
  afterEach(cleanup);

  it("renders nothing off the desktop", () => {
    const { container } = render(
      <StorageTab isDesktop={false} SectionHeader={Header} vaults={VAULTS} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("is one row a location, in the order given, the open one ticked", () => {
    const { getAllByTestId, getByTestId } = renderTab();
    const rows = getAllByTestId("settings-location-row");
    expect(rows.map((r) => r.getAttribute("data-location-path"))).toEqual(
      VAULTS.map((v) => v.path),
    );
    expect(rows[0]).toContainElement(getByTestId("location-current"));
  });

  it("shows the whole path, cut in the middle, and a missing one's with Not found", () => {
    const { getAllByTestId } = renderTab();
    const [notes, old] = getAllByTestId("settings-location-row");
    expect(notes).toHaveTextContent("Notes~/Documents/University/2026 Semester 1/Notes");
    expect(old).toHaveTextContent("Old/Volumes/X/Old · Not found");
  });

  it("offers in each menu only what can work there", () => {
    const utils = renderTab();
    expect(openMenu(utils, "Uni")).toEqual([
      "Switch to",
      "Rename…",
      expect.stringMatching(/Show in (Finder|folder)/),
      "Remove from list…",
    ]);
    fireEvent.keyDown(utils.getByRole("menu"), { key: "Escape" });
    expect(openMenu(utils, "Notes")).toEqual([
      "Rename…",
      expect.stringMatching(/Show in (Finder|folder)/),
      "Remove from list…",
    ]);
    fireEvent.keyDown(utils.getByRole("menu"), { key: "Escape" });
    expect(openMenu(utils, "Old")).toEqual(["Rename…", "Remove from list…"]);
  });

  it("switches, reveals and removes from the menu", () => {
    const switchVault = vi.fn();
    const revealVault = vi.fn();
    const forgetVault = vi.fn();
    const utils = renderTab({ switchVault, revealVault, forgetVault });
    openMenu(utils, "Uni");
    fireEvent.click(utils.getByTestId("location-switch"));
    expect(switchVault).toHaveBeenCalledWith("/Users/tyr/Uni");
    openMenu(utils, "Uni");
    fireEvent.click(utils.getByTestId("location-reveal"));
    expect(revealVault).toHaveBeenCalledWith("/Users/tyr/Uni");
    openMenu(utils, "Notes");
    fireEvent.click(utils.getByTestId("location-remove"));
    expect(forgetVault).toHaveBeenCalledWith(VAULTS[0]);
  });

  it("switches on a click on the row, never on the open or a missing one, nor via its ···", () => {
    const switchVault = vi.fn();
    const utils = renderTab({ switchVault });
    const [notes, old, uni] = utils.getAllByTestId("settings-location-row");
    fireEvent.click(notes);
    fireEvent.click(old);
    fireEvent.click(utils.getByRole("button", { name: "Uni options" }));
    expect(switchVault).not.toHaveBeenCalled();
    fireEvent.keyDown(utils.getByRole("menu"), { key: "Escape" });
    fireEvent.click(uni);
    expect(switchVault).toHaveBeenCalledWith("/Users/tyr/Uni");
  });

  it("offers no Remove on the last location that can be open", () => {
    const utils = renderTab({ vaults: [VAULTS[0], VAULTS[1]] });
    expect(openMenu(utils, "Notes")).not.toContain("Remove from list…");
    cleanup();
    const alone = renderTab({ vaults: [VAULTS[0]] });
    expect(openMenu(alone, "Notes")).not.toContain("Remove from list…");
  });

  it("renames once on Enter, the blur after it saving nothing more", () => {
    const renameVault = vi.fn();
    const utils = renderTab({ renameVault });
    openMenu(utils, "Uni");
    fireEvent.click(utils.getByTestId("location-rename"));
    const field = utils.getByRole("textbox", { name: "Name for Uni in Boojy Notes" });
    expect(utils.getAllByTestId("settings-location-row")[2]).toHaveTextContent(
      "The folder on disk keeps its name.",
    );
    fireEvent.change(field, { target: { value: "Year 3" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.blur(field);
    expect(renameVault).toHaveBeenCalledTimes(1);
    expect(renameVault).toHaveBeenCalledWith("/Users/tyr/Uni", "Year 3");
  });

  it("saves nothing on Escape, nor on the blur after it, nor for an unchanged name", () => {
    const renameVault = vi.fn();
    const utils = renderTab({ renameVault });
    openMenu(utils, "Uni");
    fireEvent.click(utils.getByTestId("location-rename"));
    let field = utils.getByRole("textbox", { name: "Name for Uni in Boojy Notes" });
    fireEvent.change(field, { target: { value: "Nope" } });
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.blur(field);
    openMenu(utils, "Uni");
    fireEvent.click(utils.getByTestId("location-rename"));
    field = utils.getByRole("textbox", { name: "Name for Uni in Boojy Notes" });
    fireEvent.blur(field);
    expect(renameVault).not.toHaveBeenCalled();
  });

  it("adds with Add folder…", () => {
    const addVault = vi.fn();
    const { getByRole } = renderTab({ addVault });
    fireEvent.click(getByRole("button", { name: "Add folder…" }));
    expect(addVault).toHaveBeenCalled();
  });
});
