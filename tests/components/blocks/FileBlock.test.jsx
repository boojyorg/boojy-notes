/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

vi.mock("../../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: {
        elevated: "#2a2a2e",
        divider: "#444",
        hover: "#555",
      },
    },
    isDark: true,
  }),
}));

vi.mock("../../../src/services/apiProvider", () => ({
  getAPI: () => ({
    getFileSize: vi.fn(async () => 2048),
  }),
}));

import FileBlock from "../../../src/components/blocks/FileBlock";

describe("FileBlock", () => {
  const defaultProps = {
    src: "document.pdf",
    filename: "document.pdf",
    size: 1024,
    onDelete: vi.fn(),
    onOpen: vi.fn(),
    onShowInFolder: vi.fn(),
    accentColor: "#A4CACE",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renders the file block with friendly filename", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    expect(container.textContent).toContain("Document");
  });

  it("displays file type pill", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    expect(container.textContent).toContain("PDF");
  });

  it("displays formatted file size", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    expect(container.textContent).toContain("1.0 KB");
  });

  it("formats file sizes correctly for different magnitudes", () => {
    // Test MB range
    const { container: c1 } = render(<FileBlock {...defaultProps} size={1048576} />);
    expect(c1.textContent).toContain("1.0 MB");
    cleanup();

    // Test bytes range
    const { container: c2 } = render(<FileBlock {...defaultProps} size={500} />);
    expect(c2.textContent).toContain("500 B");
  });

  it("calls onOpen when clicked", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    const clickable = container.firstChild;
    fireEvent.click(clickable);
    expect(defaultProps.onOpen).toHaveBeenCalled();
  });

  it("shows context menu on right click", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    const clickable = container.firstChild;
    fireEvent.contextMenu(clickable);
    const ctxMenu = container.querySelector(".file-context-menu");
    expect(ctxMenu).toBeInTheDocument();
  });

  it("context menu has expected options", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    fireEvent.contextMenu(container.firstChild);
    const ctxMenu = container.querySelector(".file-context-menu");
    expect(ctxMenu.textContent).toContain("Open File");
    expect(ctxMenu.textContent).toContain("Show in Folder");
    expect(ctxMenu.textContent).toContain("Copy File Path");
    expect(ctxMenu.textContent).toContain("Delete");
  });

  it("handles file without extension", () => {
    const props = { ...defaultProps, filename: "Makefile", src: "Makefile" };
    const { container } = render(<FileBlock {...props} />);
    expect(container.textContent).toContain("FILE");
    expect(container.textContent).toContain("Makefile");
  });

  it("shows paperclip emoji", () => {
    const { container } = render(<FileBlock {...defaultProps} />);
    expect(container.textContent).toContain("\uD83D\uDCCE");
  });

  it("does not show size when size is null", () => {
    // Need to also mock getAPI to not resolve immediately
    const props = { ...defaultProps, size: null, src: null };
    const { container } = render(<FileBlock {...props} />);
    // Should not contain formatted size
    expect(container.textContent).not.toContain("KB");
    expect(container.textContent).not.toContain(" B");
  });
});
