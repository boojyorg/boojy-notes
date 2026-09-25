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
  onDeleteTable: vi.fn(),
  onAlign: vi.fn(),
  onDuplicateRow: vi.fn(),
  onDuplicateColumn: vi.fn(),
  onClearRow: vi.fn(),
  onClearColumn: vi.fn(),
  onDismiss: vi.fn(),
});

const labels = () => screen.getAllByRole("menuitem").map((el) => el.textContent);

afterEach(cleanup);

describe("TableContextMenu", () => {
  it("is a real menu: role, a glyph per item, sentence-case labels, Delete table last from a cell", () => {
    for (const type of ["cell", "header"]) {
      const p = props({ type, rowIndex: type === "header" ? 0 : 1, colIndex: 0 });
      const { unmount } = render(<TableContextMenu {...p} />);
      const menu = screen.getByRole("menu", { name: "Table cell menu" });
      expect(menu.className).toBe("table-context-menu");
      const items = screen.getAllByRole("menuitem");
      for (const item of items) expect(item.querySelector("svg")).toBeInTheDocument();
      expect(labels()[labels().length - 1]).toBe("Delete table");
      fireEvent.click(screen.getByText("Delete table"));
      expect(p.onDeleteTable).toHaveBeenCalledTimes(1);
      expect(p.onDismiss).toHaveBeenCalled();
      unmount();
    }
  });

  it("a cell offers rows, columns and the table; a header cannot delete its row; nothing aligns", () => {
    render(<TableContextMenu {...props({ type: "cell", rowIndex: 1, colIndex: 0 })} />);
    expect(labels()).toEqual([
      "Insert row above",
      "Insert row below",
      "Insert column left",
      "Insert column right",
      "Delete row",
      "Delete column",
      "Delete table",
    ]);
    cleanup();
    render(<TableContextMenu {...props({ type: "header", rowIndex: 0, colIndex: 1 })} />);
    expect(labels()).toEqual([
      "Insert column left",
      "Insert column right",
      "Delete column",
      "Delete table",
    ]);
    expect(screen.queryByText(/Align/)).toBeNull();
  });

  it("the arrows walk the items, Enter runs the active one and Escape dismisses", () => {
    const p = props({ type: "cell", rowIndex: 1, colIndex: 0 });
    render(<TableContextMenu {...p} />);
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(screen.getByRole("menu").getAttribute("aria-activedescendant")).toBe("table-ctx-item-1");
    fireEvent.keyDown(document, { key: "Enter" });
    expect(p.onInsertRow).toHaveBeenCalledWith(1, "below");
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onDismiss).toHaveBeenCalledTimes(2);
  });

  it("opens under the clicked cell, left edges aligned, before the placement pass measures it", () => {
    render(<TableContextMenu {...props({ type: "cell", rowIndex: 1, colIndex: 0 })} />);
    const menu = screen.getByRole("menu");
    // jsdom measures every box as 0×0, so positionMenu keeps the anchor: 4px under it.
    expect(menu.style.top).toBe(`${anchor.bottom + 4}px`);
    expect(menu.style.left).toBe(`${anchor.left}px`);
  });
  it("a row's grip offers its row only: no Delete table, and the header's Delete is there", () => {
    render(<TableContextMenu {...props({ type: "row", rowIndex: 0, colIndex: 0 })} />);
    expect(screen.getByRole("menu", { name: "Row options" })).toBeInTheDocument();
    expect(labels()).toEqual([
      "Insert row above",
      "Insert row below",
      "Duplicate row",
      "Clear contents",
      "Delete row",
    ]);
    cleanup();
    const only = { ...props({ type: "row", rowIndex: 0, colIndex: 0 }), rowCount: 1 };
    render(<TableContextMenu {...only} />);
    expect(labels()).not.toContain("Delete row");
  });

  it("a column's grip starts with Align, whose press keeps the menu open", () => {
    const p = { ...props({ type: "column", rowIndex: 0, colIndex: 1 }), alignment: "center" };
    render(<TableContextMenu {...p} />);
    expect(screen.getByRole("menu", { name: "Column options" })).toBeInTheDocument();
    const radios = screen.getAllByRole("menuitemradio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "Align left",
      "Align centre",
      "Align right",
    ]);
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"]);
    fireEvent.click(radios[2]);
    expect(p.onAlign).toHaveBeenCalledWith(1, "right");
    expect(p.onDismiss).not.toHaveBeenCalled();
    expect(labels()).toEqual([
      "Insert column left",
      "Insert column right",
      "Duplicate column",
      "Clear contents",
      "Delete column",
    ]);
    fireEvent.click(screen.getByText("Duplicate column"));
    expect(p.onDuplicateColumn).toHaveBeenCalledWith(1);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
  });
});
