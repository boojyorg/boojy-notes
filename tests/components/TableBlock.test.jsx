/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

// ── Theme mock ──────────────────────────────────────────────────────────────
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
      SEMANTIC: { error: "#ef4444" },
      overlay: (a) => `rgba(255,255,255,${a})`,
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

// ── Mock useTableInteractions ───────────────────────────────────────────────
const mockInsertRow = vi.fn();
const mockDeleteRowAt = vi.fn();
const mockInsertColumn = vi.fn();
const mockDeleteColumnAt = vi.fn();
const mockCloseContextMenu = vi.fn();

vi.mock("../../src/hooks/useTableInteractions", () => ({
  useTableInteractions: () => ({
    selectedRow: null,
    selectedCol: null,
    clearSelection: vi.fn(),
    leftZoneHovered: false,
    setLeftZoneHovered: vi.fn(),
    topZoneHovered: false,
    setTopZoneHovered: vi.fn(),
    bottomZoneHovered: false,
    setBottomZoneHovered: vi.fn(),
    rightZoneHovered: false,
    setRightZoneHovered: vi.fn(),
    handleKeyDown: vi.fn(),
    handleLeftZonePointerDown: vi.fn(),
    handleTopZonePointerDown: vi.fn(),
    handleBottomZonePointerDown: vi.fn(),
    handleBottomZoneClick: vi.fn(),
    handleRightZonePointerDown: vi.fn(),
    handleRightZoneClick: vi.fn(),
    previewCount: { rows: 0, cols: 0 },
    createBadge: null,
    insertRow: mockInsertRow,
    deleteRowAt: mockDeleteRowAt,
    insertColumn: mockInsertColumn,
    deleteColumnAt: mockDeleteColumnAt,
    contextMenu: null,
    handleCellContextMenu: vi.fn(),
    closeContextMenu: mockCloseContextMenu,
  }),
}));

// ── Mock inlineFormatting utils ─────────────────────────────────────────────
vi.mock("../../src/utils/inlineFormatting", () => ({
  inlineMarkdownToHtml: (text) => text,
  domNodeToMarkdown: (el) => el.textContent || "",
}));

// ── Mock TableContextMenu ───────────────────────────────────────────────────
vi.mock("../../src/components/TableContextMenu", () => ({
  default: () => <div data-testid="table-context-menu" />,
}));

// ── Import component after mocks ────────────────────────────────────────────
import TableBlock from "../../src/components/TableBlock.jsx";

// ── Helpers ─────────────────────────────────────────────────────────────────
const defaultBlock = {
  id: "t1",
  rows: [
    ["Header A", "Header B"],
    ["Cell 1", "Cell 2"],
  ],
  alignments: [],
};

const baseProps = () => ({
  block: defaultBlock,
  noteId: "note-1",
  blockIndex: 0,
  syncGen: 1,
  onUpdateTableCell: vi.fn(),
  onUpdateTableRows: vi.fn(),
  noteTitleSet: new Set(),
  accentColor: "#A4CACE",
});

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("TableBlock", () => {
  it("renders a table with the correct number of rows and columns", () => {
    const { container } = render(<TableBlock {...baseProps()} />);
    const table = container.querySelector("table.table-block");
    expect(table).toBeInTheDocument();
    // 1 header row + 1 body row
    const rows = table.querySelectorAll("tr");
    expect(rows).toHaveLength(2);
    // 2 columns in header
    const headerCells = rows[0].querySelectorAll("th");
    expect(headerCells).toHaveLength(2);
  });

  it("renders cell content from the block rows", () => {
    const { container } = render(<TableBlock {...baseProps()} />);
    const table = container.querySelector("table.table-block");
    expect(table.textContent).toContain("Header A");
    expect(table.textContent).toContain("Header B");
    expect(table.textContent).toContain("Cell 1");
    expect(table.textContent).toContain("Cell 2");
  });

  it("renders default 2x2 table when block has no rows", () => {
    const props = baseProps();
    props.block = {};
    const { container } = render(<TableBlock {...props} />);
    const table = container.querySelector("table.table-block");
    expect(table).toBeInTheDocument();
    const rows = table.querySelectorAll("tr");
    expect(rows).toHaveLength(2);
  });

  // A cell is the block's own field (useOwnedField): it commits what it
  // holds on every input at the text grain, a structural operation is a
  // function of the rows the keystroke ref holds, and state paints the cell
  // only when it does not already hold state's text (review 2026-09-07,
  // §3.1 and §3.4).
  describe("cells are the block's own fields", () => {
    it("commits a cell's Markdown on input, not on blur", () => {
      const props = baseProps();
      const { container } = render(<TableBlock {...props} />);
      const cell = container.querySelector("tbody td");
      cell.textContent = "Updated";
      fireEvent.input(cell);
      expect(props.onUpdateTableCell).toHaveBeenCalledWith("note-1", 0, 1, 0, "Updated");
      fireEvent.blur(cell);
      expect(props.onUpdateTableRows).not.toHaveBeenCalled();
    });

    it("adds a row as a function of the rows as they are, a pending cell edit included", () => {
      const props = baseProps();
      const { container } = render(<TableBlock {...props} />);
      const cell = container.querySelector("tbody td");
      cell.focus();
      fireEvent.keyDown(cell, { key: "Enter" }); // last row: Enter adds one
      expect(props.onUpdateTableRows).toHaveBeenCalledTimes(1);
      const reshape = props.onUpdateTableRows.mock.calls[0][2];
      const pending = [
        ["Header A", "Header B"],
        ["typed", "Cell 2"],
      ];
      expect(reshape(pending, [])).toEqual({
        rows: [
          ["Header A", "Header B"],
          ["typed", "Cell 2"],
          ["", ""],
        ],
      });
    });

    it("Enter moves down a row and never breaks the cell into two lines", () => {
      const props = baseProps();
      props.block = {
        rows: [
          ["A", "B"],
          ["1", "2"],
          ["3", "4"],
        ],
        alignments: [],
      };
      const { container } = render(<TableBlock {...props} />);
      const [first, , third] = container.querySelectorAll("tbody td");
      first.focus();
      const enter = fireEvent.keyDown(first, { key: "Enter" });
      expect(enter).toBe(false); // prevented
      expect(document.activeElement).toBe(third);
      expect(props.onUpdateTableRows).not.toHaveBeenCalled();
      // Shift+Enter is the browser's line break inside the cell.
      expect(fireEvent.keyDown(third, { key: "Enter", shiftKey: true })).toBe(true);
    });

    it("a render one keystroke behind the field does not repaint it (the ref decides)", () => {
      // The text commit publishes in a transition, which React may finish
      // after the next keystroke: the render carries "Tea leav" while the
      // cell and the keystroke ref hold "Tea leave". Painted from the
      // render, the cell lost the "e" (seen in the real app, 2026-09-08).
      const props = baseProps();
      const block = {
        id: "tbl",
        rows: [
          ["Header A", "Header B"],
          ["Tea", "2"],
        ],
        alignments: [],
      };
      const noteDataRef = { current: { "note-1": { content: { blocks: [block] } } } };
      const { container, rerender } = render(
        <TableBlock {...props} block={block} noteDataRef={noteDataRef} />,
      );
      const cell = container.querySelector("tbody td");
      cell.textContent = "Tea leave";
      noteDataRef.current["note-1"].content.blocks = [
        { ...block, rows: [block.rows[0], ["Tea leave", "2"]] },
      ];
      rerender(
        <TableBlock
          {...props}
          block={{ ...block, rows: [block.rows[0], ["Tea leav", "2"]] }}
          noteDataRef={noteDataRef}
        />,
      );
      expect(cell.textContent).toBe("Tea leave");
    });

    it("repaints a cell whose text changed under it and leaves one that holds its text", () => {
      const props = baseProps();
      const { container, rerender } = render(<TableBlock {...props} />);
      const cell = container.querySelector("tbody td");
      cell.textContent = "typed";
      fireEvent.input(cell);
      // A render that merely caught up with the keystroke: the field is left alone.
      rerender(
        <TableBlock
          {...props}
          block={{
            ...props.block,
            rows: [
              ["Header A", "Header B"],
              ["typed", "Cell 2"],
            ],
          }}
        />,
      );
      expect(cell.textContent).toBe("typed");
      // A row inserted above it: the same element now shows the inserted row's cell.
      rerender(
        <TableBlock
          {...props}
          block={{
            ...props.block,
            rows: [
              ["Header A", "Header B"],
              ["", ""],
              ["typed", "Cell 2"],
            ],
          }}
        />,
      );
      expect(container.querySelector("tbody td").textContent).toBe("");
      expect(container.querySelectorAll("tbody tr")[1].querySelector("td").textContent).toBe(
        "typed",
      );
    });
  });

  it("renders with correct text alignment from alignments prop", () => {
    const props = baseProps();
    props.block = {
      rows: [
        ["Left", "Right"],
        ["A", "B"],
      ],
      alignments: ["left", "right"],
    };
    const { container } = render(<TableBlock {...props} />);
    const headerCells = container.querySelectorAll("th");
    expect(headerCells[0].style.textAlign).toBe("left");
    expect(headerCells[1].style.textAlign).toBe("right");
  });

  it("makes cells contentEditable", () => {
    const { container } = render(<TableBlock {...baseProps()} />);
    const headerCell = container.querySelector("th");
    expect(headerCell.getAttribute("contenteditable")).toBe("true");
    const bodyCell = container.querySelector("td");
    expect(bodyCell.getAttribute("contenteditable")).toBe("true");
  });

  it("renders bottom and right add-zones", () => {
    const { container } = render(<TableBlock {...baseProps()} />);
    expect(container.querySelector(".table-bottom-zone")).toBeInTheDocument();
    expect(container.querySelector(".table-right-zone")).toBeInTheDocument();
  });

  describe("a block addressed as a whole (2026-09-10)", () => {
    it("renders its own root, registered for the gutter grip, with the band when selected", () => {
      const registerRef = vi.fn();
      const { container, rerender } = render(
        <TableBlock {...baseProps()} registerRef={registerRef} isSelected={false} />,
      );
      const root = container.querySelector('[data-block-type="table"]');
      expect(root).toBe(container.querySelector(".table-outer"));
      expect(root.getAttribute("contenteditable")).toBe("false");
      expect(root.dataset.blockId).toBe("t1");
      expect(registerRef).toHaveBeenCalledWith("t1", root);
      expect(container.querySelector("[data-selected]")).toBeNull();
      expect(container.querySelector(".table-scroller").style.boxShadow).toBe("none");

      rerender(<TableBlock {...baseProps()} registerRef={registerRef} isSelected={true} />);
      expect(container.querySelector('[data-selected="true"]')).toBe(root);
      // The divider's band behind the cells (the theme mock carries no name,
      // so the Light alpha, 10%), reaching past the grid by its reach.
      expect(container.querySelector(".table-scroller").style.background).toBe(
        "rgba(164, 202, 206, 0.1)",
      );
      expect(container.querySelector(".table-scroller").style.boxShadow).toBe(
        "0 0 0 4px rgba(164, 202, 206, 0.1)",
      );
    });

    it("Escape in a cell selects the whole table and hands focus to the editor root", () => {
      const onSelect = vi.fn();
      document.body.innerHTML = '<div id="root" contenteditable="true"></div>';
      const { container } = render(<TableBlock {...baseProps()} onSelect={onSelect} />, {
        container: document.getElementById("root"),
      });
      const cell = container.querySelector("td");
      cell.focus();
      fireEvent.keyDown(cell, { key: "Escape" });
      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(document.getElementById("root"));
    });

    it("the arrows walk the grid and leave it at its edges; Shift+Arrow stays the browser's", () => {
      const onBlockNav = vi.fn();
      const props = baseProps();
      props.block = {
        rows: [
          ["A", "B"],
          ["1", "2"],
        ],
        alignments: [],
      };
      const { container } = render(
        <TableBlock {...props} blockIndex={3} onBlockNav={onBlockNav} />,
      );
      const cells = container.querySelectorAll("th, td");
      const caretIn = (cell, offset) => {
        const text = cell.firstChild;
        const range = document.createRange();
        range.setStart(text, offset);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      };
      const active = () => [...cells].indexOf(document.activeElement.closest("th, td"));

      // jsdom draws nothing: a caret has no rect, which reads as a one-line cell.
      caretIn(cells[0], 1); // "A|"
      fireEvent.keyDown(cells[0], { key: "ArrowRight" });
      expect(active()).toBe(1);
      caretIn(cells[1], 1); // "B|": wraps to the next row's first cell
      fireEvent.keyDown(cells[1], { key: "ArrowRight" });
      expect(active()).toBe(2);
      caretIn(cells[2], 0); // "|1": back to the header's last cell
      fireEvent.keyDown(cells[2], { key: "ArrowLeft" });
      expect(active()).toBe(1);
      caretIn(cells[1], 0); // a caret inside the text moves nothing between cells
      fireEvent.keyDown(cells[1], { key: "ArrowRight" });
      expect(active()).toBe(1);
      caretIn(cells[1], 1);
      fireEvent.keyDown(cells[1], { key: "ArrowRight", shiftKey: true });
      expect(active()).toBe(1);
      // Cmd+Arrow (END_OF_LINE on a Mac) and Alt+Arrow are the browser's
      // line and word jumps inside the cell, never a hop to the next cell.
      fireEvent.keyDown(cells[1], { key: "ArrowRight", metaKey: true });
      fireEvent.keyDown(cells[1], { key: "ArrowRight", ctrlKey: true });
      fireEvent.keyDown(cells[1], { key: "ArrowRight", altKey: true });
      expect(active()).toBe(1);
      expect(onBlockNav).not.toHaveBeenCalled();

      // Down from the last row and up from the header leave the table.
      caretIn(cells[3], 1);
      fireEvent.keyDown(cells[3], { key: "ArrowDown" });
      expect(onBlockNav).toHaveBeenLastCalledWith(3, "next");
      caretIn(cells[0], 1);
      fireEvent.keyDown(cells[0], { key: "ArrowUp" });
      expect(onBlockNav).toHaveBeenLastCalledWith(3, "prev");
      // Left from the first cell and Right from the last leave it too.
      caretIn(cells[0], 0);
      fireEvent.keyDown(cells[0], { key: "ArrowLeft" });
      expect(onBlockNav).toHaveBeenLastCalledWith(3, "prev");
      caretIn(cells[3], 1);
      fireEvent.keyDown(cells[3], { key: "ArrowRight" });
      expect(onBlockNav).toHaveBeenLastCalledWith(3, "next");
      expect(onBlockNav).toHaveBeenCalledTimes(4);
      // Down inside the grid moves a row; up from it moves back.
      caretIn(cells[0], 1);
      fireEvent.keyDown(cells[0], { key: "ArrowDown" });
      expect(active()).toBe(2);
      caretIn(cells[2], 1);
      fireEvent.keyDown(cells[2], { key: "ArrowUp" });
      expect(active()).toBe(0);
    });

    it("the add bars are marked for the CSS reveal, with no JS hover state", () => {
      const { container } = render(<TableBlock {...baseProps()} />);
      const bars = container.querySelectorAll(".table-add-bar");
      expect(bars).toHaveLength(2);
      expect(bars[0].getAttribute("aria-label")).toBe("Add column");
      expect(bars[1].getAttribute("aria-label")).toBe("Add row");
      for (const bar of bars) {
        expect(bar.querySelector("svg")).toBeInTheDocument();
        expect(bar.style.opacity).toBe("");
      }
    });
  });

  it("renders a 3x3 table correctly", () => {
    const props = baseProps();
    props.block = {
      rows: [
        ["A", "B", "C"],
        ["1", "2", "3"],
        ["4", "5", "6"],
      ],
      alignments: [],
    };
    const { container } = render(<TableBlock {...props} />);
    const table = container.querySelector("table.table-block");
    const rows = table.querySelectorAll("tr");
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelectorAll("th")).toHaveLength(3);
    expect(rows[1].querySelectorAll("td")).toHaveLength(3);
  });
});
