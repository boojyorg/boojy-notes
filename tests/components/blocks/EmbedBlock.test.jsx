/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: { elevated: "#2a2a2e", divider: "#444", hover: "#555" },
    },
    isDark: true,
  }),
}));

vi.mock("../../../src/utils/inlineFormatting", () => ({
  inlineMarkdownToHtml: (md) => md || "",
}));

import EmbedBlock from "../../../src/components/blocks/EmbedBlock";

describe("EmbedBlock", () => {
  const noteData = {
    "note-2": {
      id: "note-2",
      title: "My Target Note",
      content: {
        blocks: [
          { id: "eb1", type: "p", text: "First paragraph" },
          { id: "eb2", type: "p", text: "Second paragraph" },
        ],
      },
    },
  };

  const defaultProps = {
    block: { id: "e1", type: "embed", target: "My Target Note" },
    noteData,
    accentColor: "#A4CACE",
    onNavigate: vi.fn(),
    depth: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('renders "not found" message when target note does not exist', () => {
    const props = {
      ...defaultProps,
      block: { id: "e2", type: "embed", target: "Nonexistent Note" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain('"Nonexistent Note" not found');
  });

  it('shows "Create note" button when target not found', () => {
    const props = {
      ...defaultProps,
      block: { id: "e2", type: "embed", target: "Nonexistent" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    const btn = container.querySelector("button");
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toBe("Create note");
  });

  it("calls onNavigate with target and true when Create note is clicked", () => {
    const props = {
      ...defaultProps,
      block: { id: "e2", type: "embed", target: "New Note" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    const btn = container.querySelector("button");
    fireEvent.click(btn);
    expect(props.onNavigate).toHaveBeenCalledWith("New Note", true);
  });

  it("renders the embedded note content when target exists", () => {
    const { container } = render(<EmbedBlock {...defaultProps} />);
    expect(container.textContent).toContain("My Target Note");
    expect(container.textContent).toContain("First paragraph");
    expect(container.textContent).toContain("Second paragraph");
  });

  it("calls onNavigate with note id when embedded content is clicked", () => {
    const { container } = render(<EmbedBlock {...defaultProps} />);
    // The clickable wrapper has the border-left style
    const wrapper = container.firstChild;
    fireEvent.click(wrapper);
    expect(defaultProps.onNavigate).toHaveBeenCalledWith("note-2");
  });

  it("shows heading suffix when block has a heading", () => {
    const props = {
      ...defaultProps,
      block: { id: "e3", type: "embed", target: "My Target Note", heading: "Section 1" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain("My Target Note");
    expect(container.textContent).toContain("> Section 1");
  });

  it("renders depth limit message at depth >= 3", () => {
    const props = { ...defaultProps, depth: 3 };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain("Embed depth limit reached");
  });

  it("does case-insensitive matching for target note", () => {
    const props = {
      ...defaultProps,
      block: { id: "e4", type: "embed", target: "my target note" },
    };
    const { container } = render(<EmbedBlock {...props} />);
    expect(container.textContent).toContain("First paragraph");
  });
});
