/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SidebarNode } from "../../src/types/notes";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      modalShadow: "none",
    },
    isDark: false,
  }),
}));

const folder = (path: string, children: SidebarNode[] = [], notes: string[] = []): SidebarNode => ({
  name: path.split("/").pop() as string,
  _path: path,
  children,
  notes,
});
const tree: SidebarNode[] = [
  folder("Personal"),
  folder(
    "University",
    [
      folder(
        "University/Archive",
        [folder("University/Archive/2024", [], ["exam"])],
        ["old-plan", "todd"],
      ),
      folder("University/Semester 1", [], ["week1"]),
    ],
    ["timetable"],
  ),
];
const noteData: Record<string, { title: string }> = {
  exam: { title: "Exam notes" },
  "old-plan": { title: "Old plan" },
  todd: { title: "Todd's Note" },
  week1: { title: "Week 1" },
  timetable: { title: "Timetable" },
  ideas: { title: "Ideas" },
};

vi.mock("../../src/context/SidebarContext", () => ({
  useSidebar: () => ({ folderTree: tree, sortedRootNotes: ["ideas"] }),
}));
vi.mock("../../src/context/NoteDataContext", () => ({
  useNoteData: () => ({ noteData }),
}));

import PathTreeMenu from "../../src/components/PathTreeMenu";

const anchor = { top: 10, bottom: 30, left: 100, right: 160 };

function mount(props: Partial<Parameters<typeof PathTreeMenu>[0]> = {}) {
  const onOpen = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <PathTreeMenu
      anchor={anchor}
      scope="University"
      initialExpanded={["University/Archive"]}
      activeNote="todd"
      onOpen={onOpen}
      onClose={onClose}
      {...props}
    />,
  );
  return { ...utils, onOpen, onClose };
}

/** Every row's text in order, folders marked by their expansion state. */
const rows = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('[role="treeitem"]'), (el) => {
    const open = el.getAttribute("aria-expanded");
    const mark = open === null ? "" : open === "true" ? "▾ " : "▸ ";
    return `${mark}${el.textContent}`;
  });
const highlighted = (c: HTMLElement) => {
  const id = c.querySelector('[role="tree"]')?.getAttribute("aria-activedescendant");
  return id ? document.getElementById(id)?.textContent : null;
};
const key = (k: string) => {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }),
    );
  });
};

/** Reduced motion, so a collapsed folder's rows leave at once; the slide itself is Collapsible's. */
const motion = (reduce: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
};

beforeEach(() => motion(true));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PathTreeMenu", () => {
  it("shows the scope's contents with the given folders open, the open note checked and highlighted", () => {
    const { container } = mount();
    expect(rows(container)).toEqual([
      "▾ Archive",
      "▸ 2024",
      "Old plan",
      "Todd's Note",
      "▸ Semester 1",
      "Timetable",
    ]);
    const current = container.querySelector('[aria-current="true"]') as HTMLElement;
    expect(current.textContent).toBe("Todd's Note");
    // The open note is the sidebar's active row: the grey pill in primary
    // ink, no glyph and no check; only the folders carry a glyph.
    expect(current.style.background).toBe("rgb(236, 236, 236)");
    expect(current.style.color).toBe("rgb(20, 17, 15)");
    expect(current.querySelector("svg")).toBeNull();
    expect(container.querySelectorAll('[role="treeitem"] svg').length).toBe(3);
    expect(highlighted(container)).toBe("Todd's Note");
    // Pointer-opened: no ring anywhere.
    expect(current.style.boxShadow).toBe("");
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe(
      "Contents of University",
    );
  });

  it("the root scope lists the top-level folders and then the root notes, labelled Notes", () => {
    const { container } = mount({ scope: "", initialExpanded: [] });
    expect(rows(container)).toEqual(["▸ Personal", "▸ University", "Ideas"]);
    expect(container.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe("Notes");
    // Nothing on the path is open, so the highlight starts on the first row.
    expect(highlighted(container)).toBe("Personal");
  });

  it("a single click on a folder row opens and closes it in place, nothing else changes", () => {
    const { container, getByText } = mount();
    fireEvent.click(getByText("Semester 1"));
    expect(rows(container)).toContain("Week 1");
    expect(rows(container)).toContain("▾ Semester 1");
    fireEvent.click(getByText("Semester 1"));
    expect(rows(container)).not.toContain("Week 1");
    fireEvent.click(getByText("Archive"));
    expect(rows(container)).toEqual(["▸ Archive", "▸ Semester 1", "Timetable"]);
  });

  it("a click on a note opens it and closes the popup", () => {
    const { getByText, onOpen, onClose } = mount();
    fireEvent.click(getByText("Old plan"));
    expect(onOpen).toHaveBeenCalledWith("old-plan");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the arrows walk the visible rows, Right and Left open and close, Enter activates", () => {
    const { container, onOpen } = mount();
    expect(highlighted(container)).toBe("Todd's Note");
    key("ArrowDown");
    expect(highlighted(container)).toBe("Semester 1");
    key("ArrowRight"); // opens the closed folder, stays on it
    expect(rows(container)).toContain("Week 1");
    expect(highlighted(container)).toBe("Semester 1");
    key("ArrowRight"); // open: steps into the first child
    expect(highlighted(container)).toBe("Week 1");
    key("ArrowLeft"); // a note: steps out to its folder
    expect(highlighted(container)).toBe("Semester 1");
    key("ArrowLeft"); // an open folder: closes
    expect(rows(container)).not.toContain("Week 1");
    key("ArrowUp");
    key("ArrowUp");
    expect(highlighted(container)).toBe("Old plan");
    key("Enter");
    expect(onOpen).toHaveBeenCalledWith("old-plan");
  });

  it("the open note keeps its pill while the highlight moves; a key adds the ring, the pointer takes it away", () => {
    const { container, getByText } = mount();
    const row = (text: string) => getByText(text).closest("button") as HTMLElement;
    key("ArrowDown");
    expect(highlighted(container)).toBe("Semester 1");
    expect(row("Todd's Note").style.background).toBe("rgb(236, 236, 236)");
    expect(row("Semester 1").style.background).toBe("rgb(236, 236, 236)");
    expect(row("Semester 1").style.boxShadow).toContain("#8FC1C6");
    expect(row("Todd's Note").style.boxShadow).toBe("");
    fireEvent.mouseMove(row("Old plan"));
    expect(highlighted(container)).toBe("Old plan");
    expect(row("Old plan").style.boxShadow).toBe("");
    expect(row("Semester 1").style.background).toBe("transparent");
  });

  it("Home, End and the edges clamp rather than wrap", () => {
    const { container } = mount();
    key("End");
    expect(highlighted(container)).toBe("Timetable");
    key("ArrowDown");
    expect(highlighted(container)).toBe("Timetable");
    key("Home");
    expect(highlighted(container)).toBe("Archive");
    key("ArrowUp");
    expect(highlighted(container)).toBe("Archive");
    key("ArrowLeft"); // top level, open: closes rather than stepping out
    expect(rows(container)).toEqual(["▸ Archive", "▸ Semester 1", "Timetable"]);
  });

  it("Escape closes, a key the popup handles is claimed, a modified key is left alone", () => {
    const { onClose } = mount();
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(esc);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(esc.defaultPrevented).toBe(true);
    const cmdN = new KeyboardEvent("keydown", {
      key: "n",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      document.dispatchEvent(cmdN);
    });
    expect(cmdN.defaultPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a press outside closes without swallowing it; one inside, or on the opener, does not", () => {
    const opener = document.createElement("button");
    const outside = document.createElement("button");
    document.body.append(opener, outside);
    const { getByText, onOpen, onClose } = mount({ opener });
    fireEvent.mouseDown(getByText("Old plan"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(opener);
    expect(onClose).not.toHaveBeenCalled();
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      outside.dispatchEvent(press);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(press.defaultPrevented).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    expect(document.querySelector("[data-testid='path-tree-backdrop']")).toBeNull();
    opener.remove();
    outside.remove();
  });

  it("a folder's children open and close through the sidebar's animated disclosure", () => {
    motion(false);
    const { container, getByText } = mount();
    const group = () => container.querySelector('[role="group"]') as HTMLElement;
    // Open at mount: mounted grown, no slide.
    expect(group().parentElement?.parentElement?.style.gridTemplateRows).toBe("1fr");
    fireEvent.click(getByText("Archive"));
    // Collapsing: still mounted, sliding to 0fr, gone once the transition ends.
    const grid = group().parentElement?.parentElement as HTMLElement;
    expect(grid.style.gridTemplateRows).toBe("0fr");
    fireEvent.transitionEnd(grid);
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it("an empty folder says so", () => {
    const { container } = mount({ scope: "Personal", initialExpanded: [] });
    expect(rows(container)).toEqual([]);
    expect(container.textContent).toContain("Empty folder");
  });

  it("the popup is a fixed box of a fixed width under the anchor", () => {
    const { getByTestId } = mount();
    const box = getByTestId("path-tree") as HTMLElement;
    expect(box.style.position).toBe("fixed");
    expect(box.style.width).toBe("280px");
    // The tree is the scroller (and the focused element), never the box.
    const tree = box.querySelector('[role="tree"]') as HTMLElement;
    expect(tree.style.overflowY).toBe("auto");
    expect(tree.tabIndex).toBe(-1);
  });
});
