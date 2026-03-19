/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: {
        dark: "#1a1a1e",
        editor: "#1a1a1e",
        elevated: "#2a2a2e",
        surface: "#333",
        divider: "#444",
        hover: "#555",
        darkest: "#111",
      },
      ACCENT: { primary: "#A4CACE" },
      BRAND: { orange: "#f90" },
      SEMANTIC: {},
      link: { color: "#7AA2F7", underline: "#7AA2F744", hoverBg: "#7AA2F710" },
      searchInputBg: "#222",
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

import WikilinkMenu from "../../src/components/WikilinkMenu.jsx";

const noteData = {
  n1: { title: "Getting Started" },
  n2: { title: "Project Ideas" },
  n3: { title: "Meeting Notes" },
};

afterEach(() => {
  cleanup();
});

describe("WikilinkMenu", () => {
  it("renders note titles when given a position and noteData", () => {
    const { container } = render(
      <WikilinkMenu
        position={{ top: 100, left: 200 }}
        filter=""
        noteData={noteData}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox).not.toBe(null);
    expect(listbox.textContent).toContain("Getting Started");
    expect(listbox.textContent).toContain("Project Ideas");
    expect(listbox.textContent).toContain("Meeting Notes");
  });

  it("filters notes by title based on filter prop", () => {
    const { container } = render(
      <WikilinkMenu
        position={{ top: 100, left: 200 }}
        filter="project"
        noteData={noteData}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox.textContent).toContain("Project Ideas");
    expect(listbox.textContent).not.toContain("Getting Started");
    expect(listbox.textContent).not.toContain("Meeting Notes");
  });

  it("calls onSelect when a note item is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <WikilinkMenu
        position={{ top: 100, left: 200 }}
        filter=""
        noteData={noteData}
        onSelect={onSelect}
        onDismiss={vi.fn()}
      />,
    );

    const listbox = container.querySelector('[role="listbox"]');
    // Items are rendered as child divs; find the one with "Getting Started"
    const items = listbox.querySelectorAll("div > div");
    const target = Array.from(items).find((el) => el.textContent === "Getting Started");
    expect(target).toBeDefined();

    fireEvent.mouseDown(target);
    expect(onSelect).toHaveBeenCalledWith("Getting Started");
  });

  it("shows create note prompt when no notes match filter", () => {
    const { container } = render(
      <WikilinkMenu
        position={{ top: 100, left: 200 }}
        filter="nonexistent"
        noteData={noteData}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox.textContent).toContain("Create note:");
    expect(listbox.textContent).toContain("nonexistent");
  });

  it("returns null when position is not provided", () => {
    const { container } = render(
      <WikilinkMenu
        position={null}
        filter=""
        noteData={noteData}
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="listbox"]')).toBe(null);
  });
});
