/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", divider: "#444", hover: "#555" },
      ACCENT: { primary: "#A4CACE", onAccent: "#111" },
      SEMANTIC: { error: "#ef4444" },
      modalShadow: "0 8px 24px rgba(0,0,0,0.5)",
    },
  }),
}));

import TableContextMenu from "../../src/components/TableContextMenu.jsx";

const anchor = { top: 100, bottom: 130, left: 40, right: 160 };

const props = (context) => ({
  anchor,
  context,
  colCount: 2,
  onInsertRow: vi.fn(),
  onDeleteRow: vi.fn(),
  onInsertColumn: vi.fn(),
  onDeleteColumn: vi.fn(),
  onAlign: vi.fn(),
  onDuplicateRow: vi.fn(),
  onDuplicateColumn: vi.fn(),
  onDismiss: vi.fn(),
});

const labels = () => screen.getAllByRole("menuitem").map((el) => el.textContent);

afterEach(cleanup);

describe("TableContextMenu", () => {
  it("a row's grip menu: short labels, no separators, no Delete table; the header's Delete is there", () => {
    render(<TableContextMenu {...props({ type: "row", rowIndex: 0, colIndex: 0 })} />);
    const menu = screen.getByRole("menu", { name: "Row options" });
    expect(labels()).toEqual(["Insert above", "Insert below", "Duplicate", "Delete"]);
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.querySelector("svg")).toBeInTheDocument();
    }
    expect(menu.querySelectorAll("div[style*='height: 1px']")).toHaveLength(0);
    cleanup();
    render(
      <TableContextMenu
        {...{ ...props({ type: "row", rowIndex: 0, colIndex: 0 }), rowCount: 1 }}
      />,
    );
    expect(labels()).not.toContain("Delete");
  });

  it("a column's grip menu has its three alignments inline, the column's own ticked, each with its key", () => {
    const p = { ...props({ type: "column", rowIndex: 0, colIndex: 1 }), alignment: "center" };
    render(<TableContextMenu {...p} />);
    expect(screen.getByRole("menu", { name: "Column options" })).toBeInTheDocument();
    expect(labels()).toEqual(["Insert left", "Insert right", "Duplicate", "Delete"]);
    const aligns = screen.getAllByRole("menuitemradio");
    expect(aligns.map((a) => a.textContent)).toEqual([
      expect.stringMatching(/^Align left.*L$/),
      expect.stringMatching(/^Align centre.*E$/),
      expect.stringMatching(/^Align right.*R$/),
    ]);
    expect(aligns.map((a) => a.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    fireEvent.click(aligns[2]);
    expect(p.onAlign).toHaveBeenCalledWith(1, "right");
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("the arrows walk every item, alignments included; Enter runs the active one and Escape dismisses", () => {
    const p = props({ type: "column", rowIndex: 0, colIndex: 0 });
    render(<TableContextMenu {...p} />);
    for (let k = 0; k < 5; k++) fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menu").getAttribute("aria-activedescendant")).toBe("table-ctx-item-4");
    fireEvent.keyDown(document, { key: "Enter" });
    expect(p.onAlign).toHaveBeenCalledWith(0, "center");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onDismiss).toHaveBeenCalledTimes(2);
  });

  it("opens under its anchor, left edges aligned, before the placement pass measures it", () => {
    render(<TableContextMenu {...props({ type: "row", rowIndex: 1, colIndex: 0 })} />);
    const menu = screen.getByRole("menu");
    // jsdom measures every box as 0×0, so positionMenu keeps the anchor: 4px under it.
    expect(menu.style.top).toBe(`${anchor.bottom + 4}px`);
    expect(menu.style.left).toBe(`${anchor.left}px`);
  });
});
