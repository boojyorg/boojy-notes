import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      overlay: (alpha) => `rgba(0,0,0,${alpha})`,
    },
  }),
}));

import ExportTab from "../../../src/components/settings/ExportTab";

const Header = ({ title }) => <h2>{title}</h2>;

// Settings → Storage is the vault's one home: the path, Show in Finder and
// Change. Show in Finder moved here from the Notes row's ··· menu on
// 2026-09-16, when that menu became Sort alone.
describe("ExportTab (Storage)", () => {
  afterEach(cleanup);

  it("renders nothing off the desktop", () => {
    const { container } = render(
      <ExportTab
        isDesktop={false}
        notesDir="/x"
        changeNotesDir={() => {}}
        SectionHeader={Header}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the path with Show in Finder and Change beside it, each calling its handler", () => {
    const changeNotesDir = vi.fn();
    const revealNotesDir = vi.fn();
    const { getByRole, getByTitle } = render(
      <ExportTab
        isDesktop
        notesDir="/Users/tyr/Documents/Boojy Notes"
        changeNotesDir={changeNotesDir}
        revealNotesDir={revealNotesDir}
        SectionHeader={Header}
      />,
    );
    expect(getByTitle("/Users/tyr/Documents/Boojy Notes")).toHaveTextContent(
      "~/Documents/Boojy Notes",
    );
    fireEvent.click(getByRole("button", { name: /Show in Finder|Show in folder/ }));
    expect(revealNotesDir).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("button", { name: "Change" }));
    expect(changeNotesDir).toHaveBeenCalledTimes(1);
  });

  it("omits Show in Finder when there is no handler (the web build)", () => {
    const { queryByRole, getByRole } = render(
      <ExportTab isDesktop notesDir="/x" changeNotesDir={() => {}} SectionHeader={Header} />,
    );
    expect(queryByRole("button", { name: /Show in Finder|Show in folder/ })).toBeNull();
    expect(getByRole("button", { name: "Change" })).toBeInTheDocument();
  });
});
