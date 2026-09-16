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
      ACCENT: { primary: "#A4CACE", text: "#A4CACE", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#ef4444" },
      overlay: (a) => `rgba(255,255,255,${a})`,
    },
    isDark: true,
    themeMode: "night",
    setThemeMode: vi.fn(),
  }),
}));

// ── Settings mock ───────────────────────────────────────────────────────────
// The header menu is the one route to Settings, so the menu opens it itself.
const setSettingsOpen = vi.fn();
vi.mock("../../src/context/SettingsContext", () => ({
  useSettings: () => ({ setSettingsOpen }),
}));

// ── Import component after mocks ────────────────────────────────────────────
import ContextMenu from "../../src/components/ContextMenu.jsx";

// ── Helpers ─────────────────────────────────────────────────────────────────
const baseProps = () => ({
  ctxMenu: null,
  setCtxMenu: vi.fn(),
  openNote: vi.fn(),
  duplicateNote: vi.fn(),
  deleteNote: vi.fn(),
  deleteFolder: vi.fn(),
  createNote: vi.fn(),
  createFolder: vi.fn(),
  setRenamingFolder: vi.fn(),
  onRenameNote: vi.fn(),
  selectedNotes: new Set(),
  selectedCount: 0,
  bulkDeleteNotes: vi.fn(),
  bulkMoveNotes: vi.fn(),
  folderList: [],
});

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("ContextMenu", () => {
  it("renders nothing when ctxMenu is null", () => {
    const { container } = render(<ContextMenu {...baseProps()} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders note context menu items", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    expect(getByText("Rename")).toBeInTheDocument();
    expect(getByText("Duplicate")).toBeInTheDocument();
    expect(getByText("Delete")).toBeInTheDocument();
  });

  it("renders folder context menu items", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "f1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    expect(getByText("New note")).toBeInTheDocument();
    expect(getByText("New folder")).toBeInTheDocument();
    expect(getByText("Rename")).toBeInTheDocument();
    expect(getByText("Delete folder")).toBeInTheDocument();
  });

  it("New folder creates under the clicked folder", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "Uni/Sem 1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("New folder"));
    expect(props.createFolder).toHaveBeenCalledWith("Uni/Sem 1");
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("the folder menu is exactly four glyphed items in order, with no rule (2026-09-16)", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "f1", x: 100, y: 100 };
    const { getAllByRole, container } = render(<ContextMenu {...props} />);
    const items = getAllByRole("menuitem");
    expect(items.map((el) => el.textContent)).toEqual([
      "New note",
      "New folder",
      "Rename",
      "Delete folder",
    ]);
    // Every row carries a Lucide glyph, as the note menu's rows do.
    for (const el of items) expect(el.querySelector("svg.lucide")).not.toBeNull();
    expect(container.querySelector("[role='separator'], hr")).toBeNull();
  });

  it("takes a row's rect anchor over the point, so a flipped menu sits above the row", () => {
    const props = baseProps();
    props.ctxMenu = {
      type: "folder",
      id: "f1",
      x: 1,
      y: 2,
      anchor: { top: 96, bottom: 132, left: 200, right: 220 },
    };
    const { getByRole } = render(<ContextMenu {...props} />);
    const menu = getByRole("menu");
    // jsdom measures the menu as 0×0, so the hook answers the anchor's own
    // bottom-left: the rect, not the point, is what it was handed.
    expect(menu.style.left).toBe("200px");
    expect(menu.style.top).toBe("132px");
  });

  it("divides its placement by the UI scale so it lands under the pointer at 125%", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "f1", x: 200, y: 100 };
    Object.defineProperty(document.documentElement, "currentCSSZoom", {
      value: 1.25,
      configurable: true,
    });
    try {
      const { getByRole } = render(<ContextMenu {...props} />);
      const menu = getByRole("menu");
      // jsdom measures every rect as 0, so the hook's answer is the anchor
      // itself; the write is what is under test.
      expect(Number.parseFloat(menu.style.left)).toBeCloseTo(160);
      expect(Number.parseFloat(menu.style.top)).toBeCloseTo(80);
    } finally {
      delete document.documentElement.currentCSSZoom;
    }
  });

  it("New note creates inside the clicked folder", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "Uni/Sem 1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("New note"));
    expect(props.createNote).toHaveBeenCalledWith("Uni/Sem 1");
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("has no Import item (removed 2026-09-05; files are added in the OS file manager)", () => {
    const props = baseProps();
    props.ctxMenu = { type: "folder", id: "f1", x: 100, y: 100 };
    const { queryByText } = render(<ContextMenu {...props} />);
    expect(queryByText("Import files here")).not.toBeInTheDocument();
  });

  it("calls deleteNote when Delete is clicked", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("Delete"));
    expect(props.deleteNote).toHaveBeenCalledWith("n1");
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("calls duplicateNote when Duplicate is clicked", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("Duplicate"));
    expect(props.duplicateNote).toHaveBeenCalledWith("n1");
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("closes menu on Escape key", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    render(<ContextMenu {...props} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("closes menu when clicking the backdrop overlay", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { container } = render(<ContextMenu {...props} />);
    // The first child div is the backdrop overlay (position: fixed, inset: 0)
    const backdrop = container.firstChild;
    fireEvent.click(backdrop);
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });
});

/**
 * The editor header's ··· is its own menu: the open note's actions plus
 * Settings, the sidebar's selection never redirecting it, and Settings still
 * reachable with no note open at all.
 */
describe("the header menu", () => {
  const headerProps = (id) => {
    const props = baseProps();
    props.ctxMenu = { type: "header", id, x: 100, y: 100 };
    return props;
  };

  it("carries the open note's actions and Settings, each with a glyph, in one group", () => {
    const { getByText, getByRole, queryAllByRole } = render(<ContextMenu {...headerProps("n1")} />);
    for (const label of ["Rename", "Duplicate", "Delete", "Settings"]) {
      expect(getByText(label)).toBeInTheDocument();
      expect(getByText(label).closest("button").querySelector("svg")).toBeInTheDocument();
    }
    expect(getByRole("menu")).toHaveAttribute("aria-label", "Note actions");
    // The cog is what sets Settings apart; no rule above it (judged live
    // 2026-09-16: two rules cut the menu into three compartments), and the
    // same padding as every row.
    const settings = getByText("Settings").closest("button");
    expect(settings.previousElementSibling).toBe(getByText("Delete").closest("button"));
    expect(settings.style.paddingTop).toBe("7px");
    // Every edge set on every item: an edge left unset by the inline style
    // showed Chromium's own 2px outset button border (2026-09-14).
    const rename = getByText("Rename").closest("button");
    expect(rename.style.borderTopWidth).toBe("0px");
    // No counts without them, so no rule at all.
    expect(queryAllByRole("separator")).toHaveLength(0);
  });

  it("ends with the note's word count, one muted line under the menu's only rule", () => {
    const props = headerProps("n1");
    props.wordCount = 412;
    const { getByTestId, getAllByRole, queryByRole } = render(<ContextMenu {...props} />);
    const stats = getByTestId("note-stats");
    expect(stats).toHaveTextContent("412 words");
    expect(stats).not.toHaveTextContent("character");
    expect(stats.previousElementSibling).toHaveAttribute("role", "separator");
    expect(getAllByRole("separator")).toHaveLength(1);
    // Not an item: the arrows never land on it.
    expect(queryByRole("menuitem", { name: /words/ })).toBeNull();
  });

  it("spells one word in the singular", () => {
    const props = headerProps("n1");
    props.wordCount = 1;
    const { getByTestId } = render(<ContextMenu {...props} />);
    expect(getByTestId("note-stats")).toHaveTextContent("1 word");
  });

  it("opens Settings and closes itself", () => {
    const props = headerProps("n1");
    const { getByText } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("Settings"));
    expect(setSettingsOpen).toHaveBeenCalledWith(true);
    expect(props.setCtxMenu).toHaveBeenCalledWith(null);
  });

  it("holds Settings alone when no note is open", () => {
    const props = headerProps(null);
    props.wordCount = 0;
    const { getByText, queryByText, getByRole, queryByTestId, queryByRole } = render(
      <ContextMenu {...props} />,
    );
    expect(getByText("Settings")).toBeInTheDocument();
    expect(queryByTestId("note-stats")).toBeNull();
    expect(queryByRole("separator")).toBeNull();
    for (const gone of ["Rename", "Duplicate", "Delete"]) {
      expect(queryByText(gone)).not.toBeInTheDocument();
    }
    expect(getByRole("menu")).toHaveAttribute("aria-label", "App options");
  });

  // A multi-select made in the sidebar must not redirect an action taken from
  // the note on screen: the sidebar's own menu is where bulk lives.
  it("acts on the active note even with a sidebar multi-selection", () => {
    const props = headerProps("n1");
    props.selectedNotes = new Set(["n2", "n3"]);
    props.selectedCount = 2;
    const { getByText, queryByText } = render(<ContextMenu {...props} />);
    expect(queryByText("Delete 2 notes")).not.toBeInTheDocument();
    fireEvent.click(getByText("Delete"));
    expect(props.deleteNote).toHaveBeenCalledWith("n1");
    expect(props.bulkDeleteNotes).not.toHaveBeenCalled();
  });
});

// The component stays mounted between opens, so a highlight is state that
// would carry over: hover Rename, close, and the next menu opened with Rename
// already lit before the pointer arrived (seen live 2026-09-16 from a row's
// ···, a folder's and the header's alike). Every open starts with nothing.
describe("the highlight belongs to one open", () => {
  // The mock's BG.hover, as jsdom reads it back.
  const hoverBg = "rgb(85, 85, 85)";

  it("starts a reopened menu with nothing highlighted", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByRole, getByText, rerender } = render(<ContextMenu {...props} />);
    fireEvent.mouseEnter(getByText("Rename").closest("button"));
    expect(getByRole("menu")).toHaveAttribute("aria-activedescendant", "ctx-item-0");

    rerender(<ContextMenu {...props} ctxMenu={null} />);
    rerender(<ContextMenu {...props} ctxMenu={{ type: "folder", id: "f1", x: 10, y: 10 }} />);
    const menu = getByRole("menu");
    expect(menu).not.toHaveAttribute("aria-activedescendant");
    for (const item of menu.querySelectorAll("[role=menuitem]")) {
      expect(item.style.background).not.toBe(hoverBg);
    }
  });

  it("clears the highlight when the pointer leaves the row", () => {
    const props = baseProps();
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByRole, getByText } = render(<ContextMenu {...props} />);
    const rename = getByText("Rename").closest("button");
    fireEvent.mouseEnter(rename);
    expect(rename.style.background).toBe(hoverBg);
    fireEvent.mouseLeave(rename);
    expect(getByRole("menu")).not.toHaveAttribute("aria-activedescendant");
    expect(rename.style.background).not.toBe(hoverBg);
  });

  it("closes the Move-to submenu for the next open", () => {
    const props = baseProps();
    props.selectedNotes = new Set(["n1", "n2"]);
    props.selectedCount = 2;
    props.folderList = ["Work"];
    props.ctxMenu = { type: "note", id: "n1", x: 100, y: 100 };
    const { getByText, queryByText, rerender } = render(<ContextMenu {...props} />);
    fireEvent.click(getByText("Move to..."));
    expect(getByText("Work")).toBeInTheDocument();
    rerender(<ContextMenu {...props} ctxMenu={null} />);
    rerender(<ContextMenu {...props} ctxMenu={{ type: "note", id: "n2", x: 10, y: 10 }} />);
    expect(queryByText("Work")).not.toBeInTheDocument();
  });
});
