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
