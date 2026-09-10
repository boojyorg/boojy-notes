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
    },
  }),
}));

import TableContextMenu from "../../src/components/TableContextMenu.jsx";

const props = (context) => ({
  position: { x: 10, y: 10 },
  context,
  colCount: 2,
  alignments: [],
  onInsertRow: vi.fn(),
  onDeleteRow: vi.fn(),
  onInsertColumn: vi.fn(),
  onDeleteColumn: vi.fn(),
  onDeleteTable: vi.fn(),
  onDismiss: vi.fn(),
});

afterEach(cleanup);

describe("TableContextMenu", () => {
  it("offers Delete table last, in every context, and it removes the whole block", () => {
    for (const type of ["cell", "header", "row", "column"]) {
      const p = props({ type, rowIndex: type === "header" ? 0 : 1, colIndex: 0 });
      const { unmount } = render(<TableContextMenu {...p} />);
      const labels = [...document.querySelectorAll(".table-context-menu > div")]
        .map((el) => el.textContent)
        .filter(Boolean);
      expect(labels[labels.length - 1]).toBe("Delete table");
      fireEvent.click(screen.getByText("Delete table"));
      expect(p.onDeleteTable).toHaveBeenCalledTimes(1);
      expect(p.onDismiss).toHaveBeenCalled();
      unmount();
    }
  });

  it("labels are sentence case, the header row cannot be deleted, and there are no alignment items", () => {
    render(<TableContextMenu {...props({ type: "cell", rowIndex: 1, colIndex: 0 })} />);
    for (const label of [
      "Insert row above",
      "Insert row below",
      "Insert column left",
      "Insert column right",
      "Delete row",
      "Delete column",
      "Delete table",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    cleanup();
    render(<TableContextMenu {...props({ type: "header", rowIndex: 0, colIndex: 1 })} />);
    expect(screen.queryByText("Delete row")).toBeNull();
    expect(screen.queryByText(/Align/)).toBeNull();
  });
});
