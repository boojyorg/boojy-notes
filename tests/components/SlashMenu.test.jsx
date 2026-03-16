/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: { darkest: "#1a1a1a", dark: "#222", surface: "#2a2a2a", elevated: "#333", hover: "#444", divider: "#555" },
      TEXT: { primary: "#eee", secondary: "#bbb", muted: "#888" },
      ACCENT: "#A4CACE",
      overlay: (o) => `rgba(255,255,255,${o})`,
    },
  }),
}));

import SlashMenu from "../../src/components/SlashMenu.jsx";
import { SLASH_COMMANDS } from "../../src/constants/data.js";

const defaultMenu = {
  noteId: "note-1",
  blockIndex: 0,
  filter: "",
  selectedIndex: 0,
  rect: { top: 100, left: 200 },
};

afterEach(cleanup);

describe("SlashMenu", () => {
  it("renders all slash command options when filter is empty", () => {
    render(
      <SlashMenu slashMenu={defaultMenu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    for (const cmd of SLASH_COMMANDS) {
      expect(screen.getByText(cmd.label)).toBeInTheDocument();
    }
  });

  it("filters commands by text", () => {
    const menu = { ...defaultMenu, filter: "head" };
    render(
      <SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    expect(screen.getAllByText("Heading 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Heading 2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Heading 3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Bullet List")).not.toBeInTheDocument();
  });

  it("highlights selected index with surface background", () => {
    const menu = { ...defaultMenu, selectedIndex: 2 };
    const { container } = render(
      <SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    // Menu container is the second fixed div (first is backdrop)
    const menuDiv = container.querySelectorAll("[style*='z-index: 200']")[0];
    const items = Array.from(menuDiv.children);
    // selectedIndex=2: that item gets BG.surface (#2a2a2a), others transparent
    expect(items[2].style.background).toContain("rgb(42, 42, 42)");
    expect(items[0].style.background).toBe("transparent");
  });

  it("renders nothing when slashMenu is null", () => {
    const { container } = render(
      <SlashMenu slashMenu={null} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("shows 'No matching commands' when filter yields no results", () => {
    const menu = { ...defaultMenu, filter: "zzzznonexistent" };
    render(
      <SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    expect(screen.getByText("No matching commands")).toBeInTheDocument();
  });

  it("renders at the provided position", () => {
    const menu = { ...defaultMenu, rect: { top: 42, left: 99 } };
    render(
      <SlashMenu slashMenu={menu} setSlashMenu={vi.fn()} executeSlashCommand={vi.fn()} />,
    );
    // The menu container div should have the fixed position
    const menuEl = document.querySelector("[style*='top: 42px']");
    expect(menuEl).toBeInTheDocument();
    expect(menuEl.style.left).toBe("99px");
  });
});
