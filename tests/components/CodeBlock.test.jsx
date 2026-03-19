/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";

// Mock Prism to avoid loading real grammars
vi.mock("prismjs", () => {
  const languages = {
    javascript: {},
    typescript: {},
    python: {},
    css: {},
    json: {},
    bash: {},
    sql: {},
    markup: {},
  };
  return {
    default: {
      languages,
      highlight: (text, _grammar, _name) => text,
    },
  };
});

vi.mock("prismjs/components/prism-javascript", () => ({}));
vi.mock("prismjs/components/prism-typescript", () => ({}));
vi.mock("prismjs/components/prism-python", () => ({}));
vi.mock("prismjs/components/prism-css", () => ({}));
vi.mock("prismjs/components/prism-json", () => ({}));
vi.mock("prismjs/components/prism-bash", () => ({}));
vi.mock("prismjs/components/prism-sql", () => ({}));
vi.mock("prismjs/components/prism-markup", () => ({}));

import CodeBlock from "../../src/components/CodeBlock";

describe("CodeBlock", () => {
  const defaultProps = {
    block: { id: "b1", type: "code", text: 'console.log("hello");', lang: "javascript" },
    noteId: "note-1",
    blockIndex: 0,
    onUpdateCode: vi.fn(),
    onUpdateLang: vi.fn(),
    onBlockNav: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renders a textarea with the code text", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const textarea = container.querySelector("textarea.code-textarea");
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('console.log("hello");');
  });

  it("renders the syntax-highlighted overlay", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const overlay = container.querySelector("pre.code-overlay");
    expect(overlay).toBeInTheDocument();
  });

  it("displays the language label", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const langLabel = container.querySelector(".code-lang");
    expect(langLabel).toBeInTheDocument();
    expect(langLabel.textContent).toBe("JavaScript");
  });

  it('displays "Plain" when no language is set', () => {
    const props = { ...defaultProps, block: { ...defaultProps.block, lang: "" } };
    const { container } = render(<CodeBlock {...props} />);
    const langLabel = container.querySelector(".code-lang");
    expect(langLabel.textContent).toBe("Plain");
  });

  it("calls onUpdateCode when textarea value changes", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const textarea = container.querySelector("textarea.code-textarea");
    fireEvent.change(textarea, { target: { value: "new code" } });
    expect(defaultProps.onUpdateCode).toHaveBeenCalledWith("note-1", 0, "new code");
  });

  it("opens language dropdown when language label is clicked", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const langLabel = container.querySelector(".code-lang");
    fireEvent.click(langLabel);
    const dropdown = container.querySelector(".code-lang-dropdown");
    expect(dropdown).toBeInTheDocument();
  });

  it("calls onUpdateLang when a language is selected from dropdown", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const langLabel = container.querySelector(".code-lang");
    fireEvent.click(langLabel);
    const options = container.querySelectorAll(".code-lang-option");
    // Find the Python option and click it
    const pythonOption = Array.from(options).find((o) => o.textContent.includes("Python"));
    expect(pythonOption).toBeTruthy();
    fireEvent.click(pythonOption);
    expect(defaultProps.onUpdateLang).toHaveBeenCalledWith("note-1", 0, "python");
  });

  it("shows copy button on hover", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const codeBlock = container.querySelector(".code-block");
    const copyWrapper = container.querySelector(".code-copy-wrapper");
    // Initially hidden
    expect(copyWrapper.style.opacity).toBe("0");
    // Hover
    fireEvent.mouseEnter(codeBlock);
    expect(copyWrapper.style.opacity).toBe("1");
  });

  it("handles Tab key to insert spaces", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const textarea = container.querySelector("textarea.code-textarea");
    // Set selection
    Object.defineProperty(textarea, "selectionStart", { value: 0, writable: true });
    Object.defineProperty(textarea, "selectionEnd", { value: 0, writable: true });
    fireEvent.keyDown(textarea, { key: "Tab" });
    expect(defaultProps.onUpdateCode).toHaveBeenCalled();
  });

  it("handles Escape to navigate to next block", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const textarea = container.querySelector("textarea.code-textarea");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(defaultProps.onBlockNav).toHaveBeenCalledWith(0, "next");
  });

  it("handles Backspace on empty textarea to delete block", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, text: "" },
    };
    const { container } = render(<CodeBlock {...props} />);
    const textarea = container.querySelector("textarea.code-textarea");
    fireEvent.keyDown(textarea, { key: "Backspace" });
    expect(defaultProps.onDelete).toHaveBeenCalledWith(0);
  });

  it("strips leading/trailing newlines from block text", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, text: "\n\nhello\n\n" },
    };
    const { container } = render(<CodeBlock {...props} />);
    const textarea = container.querySelector("textarea.code-textarea");
    expect(textarea.value).toBe("hello");
  });
});
