/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act } from "@testing-library/react";

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
      hooks: { add: () => {} },
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
vi.mock("prismjs/components/prism-c", () => ({}));
vi.mock("prismjs/components/prism-cpp", () => ({}));
vi.mock("prismjs/components/prism-csharp", () => ({}));
vi.mock("prismjs/components/prism-java", () => ({}));
vi.mock("prismjs/components/prism-latex", () => ({}));
vi.mock("prismjs/components/prism-markdown", () => ({}));
vi.mock("prismjs/components/prism-r", () => ({}));

// The language menu carries the theme; the block itself takes none.
vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#14110F", secondary: "#47403A", muted: "#7A736C" },
      BG: { elevated: "#FFFFFF", divider: "#E9E9E9", hover: "#ECECEC", surface: "#F4F4F5" },
      ACCENT: { primary: "#8FC1C6", text: "#2A737D", onAccent: "#FFFFFF" },
      SEMANTIC: { error: "#B3261E" },
      modalShadow: "none",
    },
    isDark: false,
  }),
}));

import CodeBlock from "../../src/components/CodeBlock";

describe("CodeBlock", () => {
  const defaultProps = {
    block: { id: "b1", type: "code", text: 'console.log("hello");', lang: "javascript" },
    noteId: "note-1",
    blockIndex: 0,
    syncGen: 1,
    onUpdateCode: vi.fn(),
    onUpdateBlock: vi.fn(),
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

  it("reads a short name as its language: md is Markdown", () => {
    for (const [lang, label] of [
      ["markdown", "Markdown"],
      ["md", "Markdown"],
      ["tex", "LaTeX"],
      ["cs", "C#"],
      ["c++", "C++"],
      ["r", "R"],
    ]) {
      const { container, unmount } = render(
        <CodeBlock {...defaultProps} block={{ ...defaultProps.block, lang }} />,
      );
      expect(container.querySelector(".code-lang").textContent).toBe(label);
      unmount();
    }
  });

  // The chip names the control on hover or keyboard focus, never over its own menu.
  it("names the language button with a chip, hidden while its menu is open", () => {
    // jsdom never matches `:focus-visible`; say what the browser would for a Tab.
    const matches = Element.prototype.matches;
    vi.spyOn(Element.prototype, "matches").mockImplementation(function (sel) {
      if (sel === ":focus-visible") return this === document.activeElement;
      return matches.call(this, sel);
    });
    vi.useFakeTimers();
    try {
      const { container } = render(<CodeBlock {...defaultProps} />);
      const button = container.querySelector(".code-lang");
      act(() => button.focus());
      act(() => vi.runAllTimers());
      expect(document.body.textContent).toContain("Change language");
      fireEvent.click(button);
      expect(document.body.querySelector("[data-testid='code-lang-menu']")).toBeInTheDocument();
      expect(
        [...document.body.querySelectorAll("[role='tooltip']")].some((t) =>
          t.textContent.includes("Change language"),
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it('displays "Plain text" when no language is set', () => {
    const props = { ...defaultProps, block: { ...defaultProps.block, lang: "" } };
    const { container } = render(<CodeBlock {...props} />);
    const langLabel = container.querySelector(".code-lang");
    expect(langLabel.textContent).toBe("Plain text");
  });

  it("calls onUpdateCode when textarea value changes", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const textarea = container.querySelector("textarea.code-textarea");
    fireEvent.change(textarea, { target: { value: "new code" } });
    expect(defaultProps.onUpdateCode).toHaveBeenCalledWith("note-1", 0, "new code");
  });

  // The menu is the app's own (CodeLangMenu), portalled to body.
  it("opens the language menu when the language label is clicked", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const langLabel = container.querySelector(".code-lang");
    expect(langLabel.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(langLabel);
    const menu = document.body.querySelector("[data-testid='code-lang-menu']");
    expect(menu).toBeInTheDocument();
    expect(langLabel.getAttribute("aria-expanded")).toBe("true");
  });

  it("calls onUpdateBlock when a language is chosen from the menu", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    fireEvent.click(container.querySelector(".code-lang"));
    const menu = document.body.querySelector("[data-testid='code-lang-menu']");
    const python = Array.from(menu.querySelectorAll("[role='menuitemradio']")).find((o) =>
      o.textContent.includes("Python"),
    );
    fireEvent.click(python);
    expect(defaultProps.onUpdateBlock).toHaveBeenCalledWith("note-1", 0, { lang: "python" });
    expect(document.body.querySelector("[data-testid='code-lang-menu']")).toBeNull();
  });

  // One list: the ··· menu's row opens the same menu rather than a second copy
  // of the languages in a hover submenu (2026-09-19).
  it("opens the same menu from the context menu's Change language", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    fireEvent.contextMenu(container.querySelector(".code-block"));
    const item = Array.from(document.body.querySelectorAll(".code-ctx-menu [role=menuitem]")).find(
      (b) => b.textContent === "Change language",
    );
    expect(item).toBeTruthy();
    fireEvent.click(item);
    expect(document.body.querySelector("[data-testid='code-lang-menu']")).toBeInTheDocument();
    expect(document.body.querySelector(".code-ctx-menu")).toBeNull();
  });

  it("leaves the toolbar's showing to the stylesheet (hover, or focus within)", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const tools = container.querySelector(".code-tools");
    // No inline opacity: one would outrank the :hover and :focus-within rules.
    expect(tools.style.opacity).toBe("");
  });

  it("orders the toolbar language then copy, copy last", () => {
    const { container } = render(<CodeBlock {...defaultProps} />);
    const labels = [...container.querySelectorAll(".code-tools button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Code language", "Copy code"]);
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

  it("lets undo and redo reach the shell whichever case Shift gives the key", () => {
    const seen = vi.fn();
    const { container } = render(
      <div onKeyDown={(e) => seen(e.key)}>
        <CodeBlock {...defaultProps} />
      </div>,
    );
    const textarea = container.querySelector("textarea.code-textarea");
    fireEvent.keyDown(textarea, { key: "z", metaKey: true });
    fireEvent.keyDown(textarea, { key: "Z", metaKey: true, shiftKey: true });
    fireEvent.keyDown(textarea, { key: "y", ctrlKey: true });
    fireEvent.keyDown(textarea, { key: "a" });
    expect(seen.mock.calls.map((c) => c[0])).toEqual(["z", "Z", "y"]);
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
