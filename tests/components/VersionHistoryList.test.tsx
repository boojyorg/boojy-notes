/** @vitest-environment jsdom */
/**
 * Version History's list: one line a row (a dot, what it is, when), the keys
 * that look back, restore, name and delete, the one pair of row actions, the
 * switch, and a press elsewhere that hides the list but keeps the version.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VersionHistoryState } from "../../src/hooks/useVersionHistory";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#6F6861" },
      BG: {
        elevated: "#FFFFFF",
        divider: "#E9E9E9",
        hover: "#ECECEC",
        editor: "#FFFFFF",
        surface: "#F4F4F5",
      },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D" },
      modalShadow: "none",
    },
  }),
}));

import VersionHistoryList from "../../src/components/VersionHistoryList";

afterEach(cleanup);

const now = Date.now();
const versions = [
  { id: "v3", at: now - 60_000, kind: "point" as const, hash: "c", name: "Feedback applied" },
  { id: "v2", at: now - 120_000, kind: "auto" as const, hash: "b" },
  {
    id: "v1",
    at: now - 180_000,
    kind: "auto" as const,
    hash: "a",
    reason: "Before a large delete",
  },
];

function setup(overrides: Partial<VersionHistoryState> = {}) {
  const state: VersionHistoryState = {
    noteId: "n1",
    listOpen: true,
    versions,
    off: false,
    selected: null,
    past: null,
    ask: false,
    ...overrides,
  };
  const props = {
    state,
    hour12: false,
    editedAt: now,
    select: vi.fn(),
    restore: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    setOff: vi.fn(),
    hide: vi.fn(),
    close: vi.fn(),
    onTypeIntoPast: vi.fn(),
  };
  const view = render(<VersionHistoryList {...props} />);
  const list = screen.getByRole("listbox", { name: "Versions" });
  const key = (k: string) => fireEvent.keyDown(list, { key: k });
  return { props, view, list, key };
}

describe("VersionHistoryList", () => {
  it("is one line a row: Now, then each version by its name or what made it", () => {
    setup();
    const rows = screen.getAllByRole("option").map((o) => o.textContent);
    expect(rows[0]).toMatch(/^Now/);
    expect(rows[1]).toMatch(/^Feedback applied/);
    expect(rows[2]).toMatch(/^Autosave/);
    expect(rows[3]).toMatch(/^Before a large delete/);
    // Nothing is chosen on opening.
    expect(screen.queryAllByRole("option", { selected: true })).toHaveLength(0);
  });

  it("the first ↓ is the newest version, and ↑ from it is Now", () => {
    const { key, props } = setup();
    key("ArrowDown");
    expect(props.select).toHaveBeenLastCalledWith("v3");
    cleanup();
    const second = setup({ selected: "v3" });
    second.key("ArrowUp");
    expect(second.props.select).toHaveBeenLastCalledWith(null);
    second.key("End");
    expect(second.props.select).toHaveBeenLastCalledWith("v1");
  });

  it("Enter restores, Backspace deletes, Escape is Now, a letter asks", () => {
    const { key, props } = setup({ selected: "v2" });
    key("Enter");
    expect(props.restore).toHaveBeenCalledWith("v2");
    key("Backspace");
    expect(props.remove).toHaveBeenCalledWith("v2");
    key("x");
    expect(props.onTypeIntoPast).toHaveBeenCalled();
    key("Escape");
    expect(props.close).toHaveBeenCalled();
  });

  it("F2 names the version in place, and Enter keeps the name", () => {
    const { key, props } = setup({ selected: "v2" });
    key("F2");
    const field = screen.getByRole("textbox", { name: "Version name" });
    fireEvent.change(field, { target: { value: "Before tutor" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(props.rename).toHaveBeenCalledWith("v2", "Before tutor");
  });

  it("offers restore and delete on one row only: the pointer's, else the one on screen", () => {
    setup({ selected: "v2" });
    expect(screen.getAllByRole("button", { name: /Restore this version/ })).toHaveLength(1);
    fireEvent.mouseEnter(screen.getAllByRole("option")[1]);
    const restores = screen.getAllByRole("button", { name: /Restore this version/ });
    expect(restores).toHaveLength(1);
    expect(screen.getAllByRole("option")[1]).toContainElement(restores[0]);
  });

  it("right-click offers Rename, Restore and Delete", () => {
    const { props } = setup();
    fireEvent.contextMenu(screen.getAllByRole("option")[1]);
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(props.remove).toHaveBeenCalledWith("v3");
  });

  it("the switch turns history off; off says what was kept", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("switch", { name: "Keep history for this note" }));
    expect(props.setOff).toHaveBeenCalledWith(true);
    cleanup();
    setup({ off: true });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(document.body.textContent).toContain("3 saved versions are kept");
  });

  it("says where Autosaves will appear when there are none", () => {
    setup({ versions: [] });
    expect(document.body.textContent).toContain("Autosaves appear here as you write.");
  });

  it("a press elsewhere hides the list and keeps the version; with none chosen it is Now", () => {
    const { props } = setup({ selected: "v2" });
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(props.hide).toHaveBeenCalled();
    cleanup();
    const again = setup();
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(again.props.close).toHaveBeenCalled();
  });
});
