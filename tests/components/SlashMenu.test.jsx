/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: {
        darkest: "#1a1a1a",
        dark: "#222",
        surface: "#2a2a2a",
        elevated: "#333",
        hover: "#444",
        divider: "#555",
      },
      TEXT: { primary: "#eee", secondary: "#bbb", muted: "#888" },
      ACCENT: { primary: "#A4CACE", onAccent: "#13151C" },
      modalShadow: "0 24px 48px rgba(0,0,0,0.4)",
      overlay: (o) => `rgba(255,255,255,${o})`,
    },
  }),
}));

import SlashMenu from "../../src/components/SlashMenu.jsx";
import { SLASH_COMMANDS } from "../../src/constants/data.js";

const PRIMARY = SLASH_COMMANDS.filter((c) => !c.advanced);
const ADVANCED = SLASH_COMMANDS.filter((c) => c.advanced);

const defaultMenu = {
  noteId: "note-1",
  blockIndex: 0,
  filter: "",
  selectedIndex: 0,
  rect: { top: 100, left: 200 },
};

afterEach(cleanup);

describe("SlashMenu", () => {
  it("opens showing only the first-tier commands", () => {
    render(
      <SlashMenu slashMenu={defaultMenu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    for (const cmd of PRIMARY) {
      expect(screen.getByText(cmd.label)).toBeInTheDocument();
    }
    for (const cmd of ADVANCED) {
      expect(screen.queryByText(cmd.label)).not.toBeInTheDocument();
    }
  });

  it("surfaces an advanced command once it is typed", () => {
    const menu = { ...defaultMenu, filter: "call" };
    render(<SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />);
    expect(screen.getByText("Callout")).toBeInTheDocument();
    expect(screen.queryByText("Heading 1")).not.toBeInTheDocument();
  });

  it("renders one bare glyph per row, with no chip around it", () => {
    const { container } = render(
      <SlashMenu slashMenu={defaultMenu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    const menuDiv = container.querySelectorAll("[style*='z-index: 200']")[0];
    expect(menuDiv.querySelectorAll("svg").length).toBe(PRIMARY.length);
    // The old 24px chip carried its own border; the glyph column must not.
    for (const cell of menuDiv.querySelectorAll("svg")) {
      expect(cell.parentElement.style.border).toBe("");
    }
  });

  it("filters commands by text", () => {
    const menu = { ...defaultMenu, filter: "head" };
    render(<SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />);
    expect(screen.getAllByText("Heading 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Heading 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Heading 3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bullet list")).not.toBeInTheDocument();
  });

  it("highlights selected index with the row-selected background", () => {
    const menu = { ...defaultMenu, selectedIndex: 2 };
    const { container } = render(
      <SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    // Menu container is the second fixed div (first is backdrop)
    const menuDiv = container.querySelectorAll("[style*='z-index: 200']")[0];
    const items = Array.from(menuDiv.children);
    // selectedIndex=2: that item gets BG.hover (#444) — rows/menu items hover
    // AND select to the same fill, so hover previews selection. Others transparent.
    expect(items[2].style.background).toContain("rgb(68, 68, 68)");
    expect(items[0].style.background).toBe("transparent");
  });

  it("keeps Heading 1 selected until the pointer actually moves over another row", () => {
    const setSlashMenu = vi.fn();
    render(
      <SlashMenu
        slashMenu={defaultMenu}
        setSlashMenu={setSlashMenu}
        executeSlashCommand={vi.fn()}
      />,
    );
    const lowerRow = screen.getByRole("menuitem", { name: PRIMARY.at(-1).label });

    // A menu appearing beneath a stationary pointer may produce hover entry,
    // but must not replace the keyboard-first selection.
    fireEvent.mouseEnter(lowerRow);
    expect(setSlashMenu).not.toHaveBeenCalled();

    fireEvent.mouseMove(lowerRow);
    expect(setSlashMenu).toHaveBeenCalledOnce();
    const updateSelection = setSlashMenu.mock.calls[0][0];
    expect(updateSelection(defaultMenu)).toEqual({
      ...defaultMenu,
      selectedIndex: PRIMARY.length - 1,
    });
  });

  it("renders nothing when slashMenu is null", () => {
    const { container } = render(
      <SlashMenu slashMenu={null} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows 'No matching commands' when filter yields no results", () => {
    const menu = { ...defaultMenu, filter: "zzzznonexistent" };
    render(<SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />);
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("renders 4px below the anchor block", () => {
    const menu = { ...defaultMenu, rect: { top: 30, bottom: 42, left: 99, right: 300 } };
    render(<SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />);
    // The menu container div should have the fixed position: block bottom + 4
    const menuEl = document.querySelector("[style*='top: 46px']");
    expect(menuEl).toBeInTheDocument();
    expect(menuEl.style.left).toBe("99px");
  });
});
