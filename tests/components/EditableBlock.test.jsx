/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: { darkest: "#1a1a1a", dark: "#222", surface: "#2a2a2a", elevated: "#333", hover: "#444", divider: "#555" },
      TEXT: { primary: "#eee", secondary: "#bbb", muted: "#888" },
      ACCENT: "#A4CACE",
      overlay: (o) => `rgba(255,255,255,${o})`,
    },
  }),
}));

import EditableBlock from "../../src/components/EditableBlock.jsx";
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

function renderBlock(block, overrides = {}) {
  const registerRef = vi.fn();
  const props = {
    block,
    blockIndex: 0,
    noteId: "note-1",
    onCheckToggle: noop,
    onDeleteBlock: noop,
    registerRef,
    syncGen: 1,
    accentColor: "#A4CACE",
    fontSize: 14,
    numberedIndex: 1,
    onUpdateCode: noop,
    onUpdateLang: noop,
    onUpdateCallout: noop,
    onUpdateTableRows: noop,
    noteTitleSet: new Set(),
    onBlockNav: noop,
    isImageSelected: false,
    onImageSelect: noop,
    onImageLightbox: noop,
    onImageReplace: noop,
    onImageCopyImage: noop,
    onUpdateBlockProperty: noop,
    onFileOpen: noop,
    onFileShowInFolder: noop,
    noteDataRef: { current: {} },
    onNavigateToNote: noop,
    ...overrides,
  };
  const result = render(<EditableBlock {...props} />);
  return { ...result, registerRef };
}

beforeEach(() => {
  resetBlockCounter();
});

describe("EditableBlock", () => {
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

  it("renders bullet block with marker", () => {
    const block = bullet("item");
    const { container } = renderBlock(block);
    const el = container.querySelector(`[data-block-id="${block.id}"]`);
    expect(el).toBeInTheDocument();
    // Bullet marker character
    expect(el.textContent).toContain("\u25CF");
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

  it("renders spacer block as hr", () => {
    const block = spacer();
    const { container } = renderBlock(block);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });

  it("renders image block with img tag", () => {
    const block = image("photo.png", "A photo");
    const { container } = renderBlock(block);
    const img = container.querySelector("img");
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("alt")).toBe("A photo");
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
