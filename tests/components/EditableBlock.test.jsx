/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: {
        darkest: "#1a1a1a",
        dark: "#222",
        surface: "#2a2a2a",
        elevated: "#333",
        hover: "#444",
        divider: "#555",
      },
      TEXT: { primary: "#eee", secondary: "#bbb", muted: "#888" },
      ACCENT: "#A4CACE",
      overlay: (o) => `rgba(255,255,255,${o})`,
    },
  }),
}));

import EditableBlock from "../../src/components/EditableBlock.jsx";
import { getCaretOffset, placeCaret } from "../../src/utils/domHelpers.js";
import {
  paragraph,
  heading,
  bullet,
  numbered,
  checkbox,
  codeBlock,
  spacer,
  image,
  resetBlockCounter,
} from "../mocks/blocks.js";

const noop = () => {};

function baseProps(block, overrides = {}) {
  return {
    block,
    blockIndex: 0,
    noteId: "note-1",
    onCheckToggle: noop,
    onDeleteBlock: noop,
    registerRef: noop,
    syncGen: 1,
    accentColor: "#A4CACE",
    fontSize: 14,
    numberedIndex: 1,
    onUpdateText: noop,
    onUpdateLang: noop,
    onUpdateCallout: noop,
    onUpdateCalloutTitle: noop,
    onUpdateTableCell: noop,
    onUpdateTableRows: noop,
    noteTitleSet: new Set(),
    onBlockNav: noop,
    isBlockSelected: false,
    onBlockSelect: noop,
    onImageLightbox: noop,
    onImageCopyImage: noop,
    onUpdateBlockProperty: noop,
    onFileOpen: noop,
    onFileShowInFolder: noop,
    noteDataRef: { current: {} },
    onNavigateToNote: noop,
    ...overrides,
  };
}

function renderBlock(block, overrides = {}) {
  const registerRef = vi.fn();
  const props = baseProps(block, { registerRef, ...overrides });
  const result = render(<EditableBlock {...props} />);
  return { ...result, registerRef };
}

beforeEach(() => {
  resetBlockCounter();
});

describe("EditableBlock", () => {
  // Regression: a syncGen repaint (undo, redo, external change) replaced
  // innerHTML and collapsed the caret to the start of the block, so typing
  // after an undo landed at the front of the line.
  it("keeps the caret in place, clamped to the new text, across a syncGen repaint", () => {
    const block = paragraph("hello A");
    const { container, rerender } = renderBlock(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    placeCaret(el, 7);
    expect(getCaretOffset(el)).toBe(7);

    const restored = { ...block, text: "hello" };
    rerender(<EditableBlock {...baseProps(restored)} syncGen={2} />);

    expect(el.textContent).toBe("hello");
    expect(getCaretOffset(el)).toBe(5);
  });

  // Regression (review 2026-09-07, §1.1 and §1.15): a repaint painted the
  // text this render carried, which is one keystroke behind the DOM whenever
  // the render was published by the next keystroke or a transition finished
  // after one; the keystroke was painted over. The block is painted from the
  // keystroke ref, which holds it.
  it("a repaint paints the block as the keystroke ref holds it, never as the render does", () => {
    const block = paragraph("Hel");
    const noteDataRef = {
      current: { "note-1": { content: { blocks: [{ ...block, text: "Hello" }] } } },
    };
    const { container, rerender } = renderBlock(block, { noteDataRef });
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    // The keystroke the render is behind: on screen and in the ref.
    el.textContent = "Hello";
    placeCaret(el, 5);

    // A title-set change repaints (a wikilink may have broken), mid-burst.
    rerender(
      <EditableBlock {...baseProps(block, { noteDataRef })} noteTitleSet={new Set(["x"])} />,
    );
    expect(el.textContent).toBe("Hello");
    expect(getCaretOffset(el)).toBe(5);

    // So does a sync-generation bump.
    rerender(<EditableBlock {...baseProps(block, { noteDataRef })} syncGen={2} />);
    expect(el.textContent).toBe("Hello");
    expect(getCaretOffset(el)).toBe(5);
  });

  it("renders paragraph block with data-block-id", () => {
    const block = paragraph("hello");
    const { container } = renderBlock(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    expect(el).toBeInTheDocument();
  });

  it("renders h1 block as element with heading styles", () => {
    const block = heading(1, "Title");
    const { container } = renderBlock(block);
    const el = container.querySelector("h1");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("data-block-id")).toBe(block.id);
  });

  it("every heading level carries its name as a placeholder for the CSS to show while empty", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const { container, unmount } = renderBlock(heading(level, ""));
      const el = container.querySelector(`h${level}`);
      expect(el.getAttribute("data-placeholder")).toBe(`Heading ${level}`);
      // Nothing of the placeholder is in the element itself: it is a
      // pseudo-element, so the walkers and the clipboard never see it.
      expect(el.textContent).toBe("");
      unmount();
    }
  });

  it("renders h2 block", () => {
    const block = heading(2, "Subtitle");
    const { container } = renderBlock(block);
    expect(container.querySelector("h2")).toBeInTheDocument();
  });

  it("renders h3 block", () => {
    const block = heading(3, "Section");
    const { container } = renderBlock(block);
    expect(container.querySelector("h3")).toBeInTheDocument();
  });

  it.each([4, 5, 6])("renders H%s as an accessible heading with its editable text", (level) => {
    const { getByRole } = renderBlock(heading(level, "Deeper heading"));
    const el = getByRole("heading", { level });
    expect(el).toHaveTextContent("Deeper heading");
    expect(el).toHaveAttribute("data-block-type", `h${level}`);
  });

  it("renders bullet block with a drawn marker in primary ink, not a glyph", () => {
    const block = bullet("item");
    const { container } = renderBlock(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    expect(el).toBeInTheDocument();
    const marker = el.querySelector("[data-marker]");
    expect(marker).toHaveAttribute("data-marker", "filled");
    expect(marker).toHaveAttribute("aria-hidden", "true");
    expect(marker.textContent).toBe("");
    expect(marker.style.background).toBe("rgb(238, 238, 238)");
    expect(marker.style.borderRadius).toBe("50%");
  });

  it("alternates filled and hollow markers by nesting depth", () => {
    const expected = ["filled", "hollow", "filled", "hollow"];
    expected.forEach((kind, indent) => {
      const block = { ...bullet(`level ${indent + 1}`), indent };
      const { container, unmount } = renderBlock(block);
      const marker = container.querySelector(`[data-block-id="${block.id}"] [data-marker]`);
      expect(marker).toHaveAttribute("data-marker", kind);
      if (kind === "hollow") {
        expect(marker.style.background).toBe("transparent");
        expect(marker.style.border).toBe("1.25px solid rgb(238, 238, 238)");
      } else {
        expect(marker.style.border).toBe("");
      }
      unmount();
    });
  });

  it("renders numbered block with index", () => {
    const block = numbered("first");
    const { container } = renderBlock(block, { numberedIndex: 3 });
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    expect(el).toBeInTheDocument();
    expect(el.textContent).toContain("3.");
  });

  it("renders checkbox block with unchecked state", () => {
    const block = checkbox("todo", false);
    const { container } = renderBlock(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    expect(el).toBeInTheDocument();
    expect(el.querySelector(".checkbox-box")).toBeInTheDocument();
  });

  // The press animation scales the drawn square, and Chromium hit-tests the
  // transformed box: pressed, its edges pull 1.2px in from under the pointer,
  // so a press near an edge released onto the row and toggled nothing
  // (2026-09-19). The element that takes the click must therefore be the one
  // that never transforms, and it must cover the square.
  it("takes the toggle on the hit area around the drawn box, not on the box itself", () => {
    const block = checkbox("todo", false);
    const onCheckToggle = vi.fn();
    const { container } = renderBlock(block, { onCheckToggle });

    const hit = container.querySelector(".checkbox-hit");
    const box = container.querySelector(".checkbox-box");
    expect(hit).toBeInTheDocument();
    expect(hit.getAttribute("role")).toBe("checkbox");
    expect(hit.contains(box)).toBe(true);
    // The animated square is scenery; it carries no role of its own.
    expect(box.getAttribute("role")).toBeNull();

    fireEvent.click(hit);
    expect(onCheckToggle).toHaveBeenCalledWith("note-1", 0);
  });

  it("renders spacer block as hr", () => {
    const block = spacer();
    const { container } = renderBlock(block);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("a divider carries its type on its root and registers it, so the gutter grip can lift it", () => {
    const block = spacer();
    const { container, registerRef } = renderBlock(block);
    const root = container.querySelector('[data-block-type="spacer"]');
    expect(root).toBeInTheDocument();
    expect(root.getAttribute("contenteditable")).toBe("false");
    expect(registerRef).toHaveBeenCalledWith(block.id, root);
  });

  it("a press on a divider selects it; selected, a tinted band appears and the rule lifts to the accent", () => {
    const block = spacer();
    const onBlockSelect = vi.fn();
    const { container, rerender } = renderBlock(block, { onBlockSelect });
    const root = () => container.querySelector('[data-block-type="spacer"]');
    fireEvent.mouseDown(container.querySelector("hr"));
    // On the press, before any release (2026-09-23).
    expect(onBlockSelect).toHaveBeenCalledWith(block.id);
    expect(root().style.background).toBe("transparent");
    expect(container.querySelector("hr").style.borderTop).toBe("1px solid rgb(85, 85, 85)");
    expect(container.querySelector("[data-selected]")).toBeNull();

    rerender(<EditableBlock {...baseProps(block, { isBlockSelected: true })} />);
    // accentColor #A4CACE at 10% (Light) around it, the rule at 40% inside; still 1px.
    expect(root().style.background).toBe("rgba(164, 202, 206, 0.1)");
    expect(container.querySelector("hr").style.borderTop).toBe(
      "1px solid rgba(164, 202, 206, 0.4)",
    );
    expect(container.querySelector('[data-selected="true"]')).toBeInTheDocument();
  });

  it("renders image block with img tag", () => {
    const block = image("photo.png", "A photo");
    const { container } = renderBlock(block);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("alt")).toBe("A photo");
  });

  it("an image registers its root, so the gutter grip can lift it and the drop marker sees it", () => {
    const block = image("photo.png", "A photo");
    const { container, registerRef } = renderBlock(block);
    const root = container.querySelector('[data-block-type="image"]');
    expect(root).toBeInTheDocument();
    expect(root.getAttribute("contenteditable")).toBe("false");
    // Before: only text roots registered, and a press on the image's grip
    // returned silently from the drag with nothing in the map to lift.
    expect(registerRef).toHaveBeenCalledWith(block.id, root);
  });

  it("a file block registers its root the same way", () => {
    const block = { id: "f1", type: "file", src: "notes.pdf", filename: "notes.pdf", text: "" };
    const { container, registerRef } = renderBlock(block);
    const root = container.querySelector('[data-block-type="file"]');
    expect(root).toBeInTheDocument();
    expect(registerRef).toHaveBeenCalledWith(block.id, root);
  });

  it("calls registerRef on mount with block id", () => {
    const block = paragraph("hi");
    const { registerRef } = renderBlock(block);
    expect(registerRef).toHaveBeenCalledWith(block.id, expect.any(HTMLElement));
  });

  it("renders code block container", () => {
    const block = codeBlock("const x = 1;", "js");
    const { container } = renderBlock(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    expect(el).toBeInTheDocument();
  });
});
