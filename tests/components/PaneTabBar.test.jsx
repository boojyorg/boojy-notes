/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
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

vi.mock("../../src/components/Icons", () => ({
  CloseIcon: () => <span data-testid="close-icon">x</span>,
}));

import PaneTabBar from "../../src/components/PaneTabBar.jsx";

const noteData = {
  n1: { title: "Note One" },
  n2: { title: "Note Two" },
  n3: { title: "Note Three" },
};

function renderTabBar(overrides = {}) {
  const tabs = overrides.tabs || ["n1", "n2"];
  const props = {
    tabs,
    activeNote: overrides.activeNote || "n1",
    noteData: overrides.noteData || noteData,
    newTabId: null,
    closingTabs: new Set(),
    setActiveNote: overrides.setActiveNote || vi.fn(),
    closeTab: overrides.closeTab || vi.fn(),
    tabFlip: false,
    activeTabBg: "#1C1C20",
    chromeBg: "#222",
    tabAreaWidth: 600,
    tabScrollRef: { current: null },
    onTabPointerDown: null,
    paneId: "pane-1",
    ...overrides,
  };

  return render(<PaneTabBar {...props} />);
}

afterEach(() => {
  cleanup();
});

describe("PaneTabBar", () => {
  it("renders tab buttons for each tab", () => {
    const { container } = renderTabBar({ tabs: ["n1", "n2", "n3"] });

    const tabBtns = container.querySelectorAll("[data-tab-id]");
    expect(tabBtns.length).toBe(3);
    expect(container.querySelector('[data-tab-id="n1"]')).not.toBe(null);
    expect(container.querySelector('[data-tab-id="n2"]')).not.toBe(null);
    expect(container.querySelector('[data-tab-id="n3"]')).not.toBe(null);
  });

  it("displays note titles in tabs", () => {
    const { container } = renderTabBar({ tabs: ["n1", "n2"] });

    expect(container.textContent).toContain("Note One");
    expect(container.textContent).toContain("Note Two");
  });

  it("applies active tab styling to the active note", () => {
    const { container } = renderTabBar({ tabs: ["n1", "n2"], activeNote: "n1" });

    const activeBtn = container.querySelector('[data-tab-id="n1"]');
    const inactiveBtn = container.querySelector('[data-tab-id="n2"]');

    expect(activeBtn.classList.contains("tab-active")).toBe(true);
    expect(inactiveBtn.classList.contains("tab-active")).toBe(false);
  });

  it("calls setActiveNote when a tab is clicked", () => {
    const setActiveNote = vi.fn();
    const { container } = renderTabBar({ tabs: ["n1", "n2"], setActiveNote });

    const tab = container.querySelector('[data-tab-id="n2"]');
    fireEvent.click(tab);

    expect(setActiveNote).toHaveBeenCalledWith("n2");
  });

  it("calls closeTab when close button is clicked", () => {
    const closeTab = vi.fn();
    const { container } = renderTabBar({ tabs: ["n1", "n2"], closeTab });

    const closeBtns = container.querySelectorAll(".tab-close");
    expect(closeBtns.length).toBeGreaterThan(0);

    fireEvent.click(closeBtns[0]);
    expect(closeTab).toHaveBeenCalled();
  });

  it("skips tabs whose noteData entry is missing", () => {
    const { container } = renderTabBar({
      tabs: ["n1", "missing-id"],
      noteData: { n1: { title: "Note One" } },
    });

    const tabBtns = container.querySelectorAll("[data-tab-id]");
    expect(tabBtns.length).toBe(1);
    expect(container.querySelector('[data-tab-id="n1"]')).not.toBe(null);
  });
});
