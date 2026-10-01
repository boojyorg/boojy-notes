/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      name: "day",
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", divider: "#444", surface: "#333", hover: "#3a3a3a" },
      SEMANTIC: { error: "#e5484d" },
      modalShadow: "none",
      floatShadow: "none",
      imageHandle: { fill: "#FFFFFF", shadow: "none" },
      ACCENT: { primary: "#8FC1C6" },
    },
  }),
}));

import ImageBlock from "../../../src/components/blocks/ImageBlock";

const props = {
  alt: "",
  displayWidth: null,
  isSelected: false,
  accentColor: "#8FC1C6",
  onSelect: () => {},
  onLightbox: () => {},
  onDelete: () => {},
  onCopyImage: () => {},
  onUpdateWidth: () => {},
};

afterEach(cleanup);

describe("ImageBlock", () => {
  it("draws the Not found card when its picture fails to load", () => {
    const { container, getByText } = render(<ImageBlock {...props} src="gone.png" />);
    fireEvent.error(container.querySelector("img"));
    expect(getByText("gone.png")).toBeTruthy();
    expect(getByText("Not found")).toBeTruthy();
  });

  it("loads a replacement picture after an error rather than staying broken", () => {
    const { container, rerender, queryByText } = render(<ImageBlock {...props} src="gone.png" />);
    fireEvent.error(container.querySelector("img"));

    rerender(<ImageBlock {...props} src="new.png" />);

    // Before: `errored` outlived the source it was about, so the box stayed.
    expect(queryByText("Not found")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/new\.png$/);
  });

  it("is drawn at the file's pixel width, capped by the column", () => {
    const { container } = render(<ImageBlock {...props} src="shot.png" displayWidth={524} />);
    fireEvent.load(container.querySelector("img"));
    const img = container.querySelector("img");
    expect(img.style.width).toBe("524px");
    expect(img.style.maxWidth).toBe("100%");
    expect(img.parentElement.style.width).toBe("fit-content");
  });

  it("with no width, is drawn at the picture's own size once it has loaded, never stretched", () => {
    const { container } = render(<ImageBlock {...props} src="icon.png" />);
    const img = container.querySelector("img");
    const box = img.parentElement;
    // Loading: the placeholder holds the column.
    expect(box.style.width).toBe("100%");
    fireEvent.load(img);
    // Before: every image without a width was drawn 100% of the column.
    expect(box.style.width).toBe("fit-content");
    expect(img.style.width).toBe("auto");
    expect(img.style.maxWidth).toBe("100%");
  });
});

/** A loaded picture, with each callback a spy. */
function loaded(extra = {}) {
  const spies = {
    onSelect: vi.fn(),
    onLightbox: vi.fn(),
    onDelete: vi.fn(),
    onCopyImage: vi.fn(),
    onUpdateWidth: vi.fn(),
  };
  const view = render(<ImageBlock {...props} {...spies} src="shot.png" {...extra} />);
  const img = view.container.querySelector("img");
  fireEvent.load(img);
  return { ...view, img, box: img.parentElement, ...spies };
}

// Redesigned 2026-09-23 from a prototype judged against Obsidian and Notion.
describe("ImageBlock controls", () => {
  it("a press selects, before the release, and does not open the full-size view; a double-click does", () => {
    const { box, onSelect, onLightbox } = loaded();
    fireEvent.mouseDown(box);
    // Before 2026-09-23 the selection waited for the release.
    expect(onSelect).toHaveBeenCalled();
    fireEvent.click(box);
    // Before: every click also opened the lightbox, so an image could not be
    // selected to delete it without the full-size view coming up first.
    expect(onLightbox).not.toHaveBeenCalled();
    fireEvent.doubleClick(box);
    expect(onLightbox).toHaveBeenCalledTimes(1);
  });

  it("shows nothing but the picture at rest, and only the bar on hover", () => {
    const { box } = loaded();
    expect(screen.queryByTestId("image-hover-bar")).toBeNull();
    expect(screen.queryByTestId("image-resize-handle")).toBeNull();
    fireEvent.mouseEnter(box);
    expect(screen.getByTestId("image-hover-bar")).toBeTruthy();
    // Before 2026-10-01: a resize pill on the right edge came up on hover too.
    expect(screen.queryByTestId("image-resize-handle")).toBeNull();
    expect(screen.queryByTestId("image-selection-outline")).toBeNull();
    // Before: a teal ring on hover and a solid one when selected.
    expect(box.style.border).toBe("2px solid transparent");
  });

  it("selected alone, it shows a teal outline and a dot on each corner instead of the wash", () => {
    loaded({ isSelected: true, selectedAlone: true });
    expect(screen.queryByTestId("image-selection-wash")).toBeNull();
    expect(screen.getByTestId("image-selection-outline").style.border).toBe(
      "2px solid rgb(143, 193, 198)",
    );
    const corners = screen.getAllByTestId("image-resize-handle").map((d) => d.dataset.corner);
    expect(corners).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
  });

  it("selected, it carries the teal wash and nothing else: the controls follow the pointer", () => {
    const { box } = loaded({ isSelected: true });
    const wash = screen.getByTestId("image-selection-wash");
    expect(wash.style.background).toBe("rgba(143, 193, 198, 0.2)");
    // Before: the bar and pill stayed up on a selected picture wherever the
    // pointer was, 50px to its right included.
    expect(screen.queryByTestId("image-hover-bar")).toBeNull();
    expect(screen.queryByTestId("image-resize-handle")).toBeNull();
    fireEvent.mouseEnter(box);
    expect(screen.getByTestId("image-hover-bar")).toBeTruthy();
    fireEvent.mouseLeave(box);
    expect(screen.queryByTestId("image-hover-bar")).toBeNull();
  });

  it("in a run of selected blocks, it wears the wash and has no dots: one drag cannot size several", () => {
    loaded({ isSelected: true, selectedAlone: false });
    expect(screen.getByTestId("image-selection-wash")).toBeTruthy();
    expect(screen.queryByTestId("image-selection-outline")).toBeNull();
    expect(screen.queryByTestId("image-resize-handle")).toBeNull();
  });

  it("marks the picture's frame, not its row, as what a press may land on and keep the selection", () => {
    const { box } = loaded();
    expect(box.hasAttribute("data-selection-surface")).toBe(true);
    expect(box.parentElement.hasAttribute("data-selection-surface")).toBe(false);
  });

  it("the bar's full-size button opens the view without selecting through it", () => {
    const { box, onLightbox, onSelect } = loaded();
    fireEvent.mouseEnter(box);
    fireEvent.mouseDown(screen.getByRole("button", { name: "View full size" }));
    fireEvent.click(screen.getByRole("button", { name: "View full size" }));
    expect(onLightbox).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("right-click and the bar's ··· open the same menu, in sentence case", () => {
    const { box, onSelect } = loaded();
    fireEvent.contextMenu(box, { clientX: 40, clientY: 30 });
    // The menu does not select: the picture wears the wash while it is open.
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("image-selection-wash")).toBeTruthy();
    const labels = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(labels).toEqual(["View full size", "Copy image", "Delete"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.mouseEnter(box);
    fireEvent.click(screen.getByRole("button", { name: "Image options" }));
    expect(screen.getAllByRole("menuitem")).toHaveLength(3);
  });

  it("offers Show in Finder only where there is a folder, and Original size only on a sized picture", () => {
    const onShowInFolder = vi.fn();
    const { box, onUpdateWidth } = loaded({ displayWidth: 300, onShowInFolder });
    fireEvent.contextMenu(box);
    const labels = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(labels).toContain("Original size");
    expect(labels.some((l) => /^Show in (Finder|folder)$/.test(l))).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: "Original size" }));
    expect(onUpdateWidth).toHaveBeenCalledWith(null);
    expect(screen.queryByRole("menu")).toBeNull();
    // Once the item has acted, the picture is left unselected.
    expect(screen.queryByTestId("image-selection-wash")).toBeNull();
  });

  it("a press in the menu never reaches the editor underneath", () => {
    const onEditorMouseUp = vi.fn();
    const onEditorMouseDown = vi.fn();
    const view = render(
      <div onMouseUp={onEditorMouseUp} onMouseDown={onEditorMouseDown}>
        <ImageBlock {...props} src="shot.png" displayWidth={300} />
      </div>,
    );
    const img = view.container.querySelector("img");
    fireEvent.load(img);
    fireEvent.contextMenu(img.parentElement);
    const item = screen.getByRole("menuitem", { name: "Original size" });
    onEditorMouseDown.mockClear();
    fireEvent.mouseDown(item);
    fireEvent.mouseUp(item);
    fireEvent.click(item);
    // Before: the portal's press bubbled to the editor's onMouseUp, whose caret
    // rescue scrolled the note to a paragraph once the menu had closed.
    expect(onEditorMouseUp).not.toHaveBeenCalled();
    expect(onEditorMouseDown).not.toHaveBeenCalled();
  });

  it("Delete in the menu deletes", () => {
    const { box, onDelete } = loaded();
    fireEvent.contextMenu(box);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("a press on a dot does not select the picture again", () => {
    const { onSelect } = loaded({ isSelected: true, selectedAlone: true });
    fireEvent.mouseDown(screen.getAllByTestId("image-resize-handle")[3]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a double-click on a dot takes a width off, and does nothing on an unsized picture", () => {
    const sized = loaded({ displayWidth: 300, isSelected: true, selectedAlone: true });
    fireEvent.doubleClick(screen.getAllByTestId("image-resize-handle")[0]);
    expect(sized.onUpdateWidth).toHaveBeenCalledWith(null);
    // The dot's double-click is its own, never the picture's full-size view.
    expect(sized.onLightbox).not.toHaveBeenCalled();
    cleanup();

    const own = loaded({ isSelected: true, selectedAlone: true });
    fireEvent.doubleClick(screen.getAllByTestId("image-resize-handle")[0]);
    expect(own.onUpdateWidth).not.toHaveBeenCalled();
  });
});
