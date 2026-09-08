/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

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
    syncGen: 1,
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

  // The textarea is the block's own field (useOwnedField): it holds the
  // fence's text exactly, commits what it holds on every input, and is
  // painted from state only when it does not already hold it.
  describe("the textarea is the block's own field (review 2026-09-07, §1.3, §1.4)", () => {
    const withText = (text) => ({ ...defaultProps, block: { ...defaultProps.block, text } });

    it("keeps a fence's blank first and last lines", () => {
      const { container } = render(<CodeBlock {...withText("\n\nhello\n\n")} />);
      expect(container.querySelector("textarea").value).toBe("\n\nhello\n\n");
    });

    it("Enter at the end of the block adds a line that survives the render that follows", () => {
      const props = withText("a");
      const { container, rerender } = render(<CodeBlock {...props} />);
      const ta = container.querySelector("textarea");
      ta.focus();
      ta.selectionStart = ta.selectionEnd = 1;
      fireEvent.keyDown(ta, { key: "Enter" });
      expect(props.onUpdateCode).toHaveBeenCalledWith("note-1", 0, "a\n");
      expect(ta.value).toBe("a\n");
      // State catches up with the keystroke; the field already holds it.
      rerender(<CodeBlock {...withText("a\n")} />);
      expect(ta.value).toBe("a\n");
      expect(ta.selectionStart).toBe(2);
    });

    it("is not reset by a render whose state is behind the field", () => {
      const props = withText("a");
      const { container, rerender } = render(<CodeBlock {...props} />);
      const ta = container.querySelector("textarea");
      fireEvent.change(ta, { target: { value: "abc" } });
      expect(props.onUpdateCode).toHaveBeenLastCalledWith("note-1", 0, "abc");
      // A render for something else while the text commit is still pending.
      rerender(<CodeBlock {...withText("a")} lang="" />);
      expect(ta.value).toBe("abc");
    });

    it("a render one keystroke behind the field does not reset it (the ref decides)", () => {
      const block = { ...defaultProps.block, text: "ab" };
      const noteDataRef = { current: { "note-1": { content: { blocks: [block] } } } };
      const { container, rerender } = render(
        <CodeBlock {...defaultProps} block={block} noteDataRef={noteDataRef} />,
      );
      const ta = container.querySelector("textarea");
      ta.value = "abcd";
      noteDataRef.current["note-1"].content.blocks = [{ ...block, text: "abcd" }];
      rerender(
        <CodeBlock {...defaultProps} block={{ ...block, text: "abc" }} noteDataRef={noteDataRef} />,
      );
      expect(ta.value).toBe("abcd");
    });

    it("paints a text the field does not hold, and repaints on a sync-generation bump", () => {
      const { container, rerender } = render(<CodeBlock {...withText("a")} />);
      const ta = container.querySelector("textarea");
      rerender(<CodeBlock {...withText("undone")} />);
      expect(ta.value).toBe("undone");
      // Same text, new generation (undo restored the same bytes): painted anyway.
      ta.value = "typed past it";
      rerender(<CodeBlock {...withText("undone")} syncGen={2} />);
      expect(ta.value).toBe("undone");
    });

    it("keeps the highlight overlay in step with what is typed", () => {
      const { container } = render(<CodeBlock {...withText("a")} />);
      const ta = container.querySelector("textarea");
      fireEvent.change(ta, { target: { value: "a\nb" } });
      expect(container.querySelectorAll(".code-overlay .code-line")).toHaveLength(2);
    });
  });
});
