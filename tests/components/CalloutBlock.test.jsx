/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      TEXT: { primary: "#fff", secondary: "#aaa", muted: "#666" },
      BG: {
        elevated: "#2a2a2e",
        divider: "#444",
        hover: "#555",
      },
      callouts: {
        note: { colour: "#7AA2F7", bg: "#3f4e74", border: "rgba(122,162,247,0.18)" },
        info: { colour: "#89DDFF", bg: "#446277", border: "rgba(137,221,255,0.18)" },
        tip: { colour: "#9ECE6A", bg: "#4c5e43", border: "rgba(158,206,106,0.18)" },
        warning: { colour: "#E0AF68", bg: "#635242", border: "rgba(224,175,104,0.18)" },
        danger: { colour: "#F7768E", bg: "#6b3d4f", border: "rgba(247,118,142,0.18)" },
        success: { colour: "#9ECE6A", bg: "#4c5e43", border: "rgba(158,206,106,0.18)" },
        question: { colour: "#BB9AF7", bg: "#564b74", border: "rgba(187,154,247,0.18)" },
        quote: { colour: "#9B9EB0", bg: "#4c4c5a", border: "rgba(155,158,176,0.18)" },
        example: { colour: "#BB9AF7", bg: "#564b74", border: "rgba(187,154,247,0.18)" },
        bug: { colour: "#F7768E", bg: "#6b3d4f", border: "rgba(247,118,142,0.18)" },
        abstract: { colour: "#89DDFF", bg: "#446277", border: "rgba(137,221,255,0.18)" },
        failure: { colour: "#F7768E", bg: "#6b3d4f", border: "rgba(247,118,142,0.18)" },
      },
      calloutGround: 0.14,
    },
    isDark: true,
  }),
}));

vi.mock("../../src/utils/inlineFormatting", () => ({
  inlineMarkdownToHtml: (md) => md || "",
  domNodeToMarkdown: (el) => el?.textContent || "",
}));

vi.mock("lucide-react", () => {
  const icon = (name) => {
    const Comp = (props) => <svg data-testid={`icon-${name}`} {...props} />;
    Comp.displayName = name;
    return Comp;
  };
  return {
    Pencil: icon("Pencil"),
    Info: icon("Info"),
    Lightbulb: icon("Lightbulb"),
    AlertTriangle: icon("AlertTriangle"),
    ShieldAlert: icon("ShieldAlert"),
    CheckCircle2: icon("CheckCircle2"),
    HelpCircle: icon("HelpCircle"),
    Quote: icon("Quote"),
    ListChecks: icon("ListChecks"),
    Bug: icon("Bug"),
    FileText: icon("FileText"),
    XCircle: icon("XCircle"),
    ChevronRight: icon("ChevronRight"),
  };
});

import CalloutBlock from "../../src/components/CalloutBlock";

describe("CalloutBlock", () => {
  const defaultProps = {
    block: {
      id: "c1",
      type: "callout",
      calloutType: "info",
      title: "Info",
      text: "Some info text",
    },
    noteId: "note-1",
    blockIndex: 0,
    syncGen: 1,
    onUpdateBlock: vi.fn(),
    onUpdateText: vi.fn(),
    onUpdateTitle: vi.fn(),
    onBlockNav: vi.fn(),
    onDelete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it("renders the callout block container", () => {
    const { container } = render(<CalloutBlock {...defaultProps} />);
    const callout = container.querySelector(".callout-block");
    expect(callout).toBeInTheDocument();
  });

  it("renders with info callout type styling", () => {
    const { container } = render(<CalloutBlock {...defaultProps} />);
    const callout = container.querySelector(".callout-block");
    // The ground is the type's ink at calloutGround.
    expect(callout.style.background).toBe("rgba(137, 221, 255, 0.14)");
  });

  it("renders with warning callout type", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, calloutType: "warning", title: "Warning" },
    };
    const { container } = render(<CalloutBlock {...props} />);
    const callout = container.querySelector(".callout-block");
    expect(callout.style.background).toBe("rgba(224, 175, 104, 0.14)");
  });

  it("renders with tip callout type", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, calloutType: "tip", title: "Tip" },
    };
    const { container } = render(<CalloutBlock {...props} />);
    const callout = container.querySelector(".callout-block");
    expect(callout.style.background).toBe("rgba(158, 206, 106, 0.14)");
  });

  it("renders the title contentEditable element", () => {
    const { container } = render(<CalloutBlock {...defaultProps} />);
    const title = container.querySelector(".callout-title");
    expect(title).toBeInTheDocument();
    expect(title.getAttribute("contenteditable")).toBe("true");
  });

  it("renders the body contentEditable element", () => {
    const { container } = render(<CalloutBlock {...defaultProps} />);
    const body = container.querySelector(".callout-body");
    expect(body).toBeInTheDocument();
    expect(body.getAttribute("contenteditable")).toBe("true");
  });

  it("renders the icon button for type picker", () => {
    const { container } = render(<CalloutBlock {...defaultProps} />);
    const iconBtn = container.querySelector(".callout-icon-btn");
    expect(iconBtn).toBeInTheDocument();
    expect(iconBtn.getAttribute("role")).toBe("button");
  });

  it("defaults to note type when calloutType is missing", () => {
    const props = {
      ...defaultProps,
      block: { id: "c2", type: "callout", text: "test" },
    };
    const { container } = render(<CalloutBlock {...props} />);
    const callout = container.querySelector(".callout-block");
    // note type bg
    expect(callout).toBeInTheDocument();
  });

  it("renders the correct icon for the callout type", () => {
    const { container } = render(<CalloutBlock {...defaultProps} />);
    const icon = container.querySelector("[data-testid='icon-Info']");
    expect(icon).toBeInTheDocument();
  });

  it("renders the danger callout type", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, calloutType: "danger", title: "Danger" },
    };
    const { container } = render(<CalloutBlock {...props} />);
    const callout = container.querySelector(".callout-block");
    expect(callout.style.background).toBe("rgba(247, 118, 142, 0.14)");
  });

  // An empty title is the type's word, as Obsidian shows it: the word as
  // written in title case (an alias or an unknown type keeps its own name),
  // drawn by CSS so nothing is written to the file.
  it("names an empty title by the type word as written, in title case", () => {
    for (const [calloutType, calloutTypeRaw, shown] of [
      ["tip", "important", "Important"],
      ["note", "banana", "Banana"],
      ["note", "NOTE", "Note"],
      ["failure", "missing", "Missing"],
      ["tip", undefined, "Tip"],
    ]) {
      const { container, unmount } = render(
        <CalloutBlock
          {...defaultProps}
          block={{ ...defaultProps.block, calloutType, calloutTypeRaw, title: "" }}
        />,
      );
      const title = container.querySelector(".callout-title");
      expect(title.getAttribute("data-placeholder"), calloutTypeRaw).toBe(shown);
      expect(title.textContent).toBe("");
      unmount();
    }
  });

  it("draws a failure with its own icon and colours", () => {
    const { container } = render(
      <CalloutBlock {...defaultProps} block={{ ...defaultProps.block, calloutType: "failure" }} />,
    );
    expect(container.querySelector("[data-testid='icon-XCircle']")).toBeInTheDocument();
    expect(container.querySelector(".callout-block").style.background).toBe(
      "rgba(247, 118, 142, 0.14)",
    );
  });

  // Folding is how the note is viewed, never an edit: `-` opens folded, `+`
  // open, no sign never folds; the chevron is a named button saying its state;
  // a folded body is out of reach (inert); the file's sign rules again when
  // the open note changes.
  describe("folding", () => {
    const fold = (calloutFold, extra = {}) => ({
      ...defaultProps,
      ...extra,
      block: { ...defaultProps.block, calloutFold },
    });
    const chevron = (c) => c.querySelector("button.callout-fold-btn");
    const body = (c) => c.querySelector(".callout-fold");

    it("opens as its sign says, and a callout with none has no chevron", () => {
      const folded = render(<CalloutBlock {...fold("-")} />);
      expect(chevron(folded.container).getAttribute("aria-expanded")).toBe("false");
      expect(chevron(folded.container).getAttribute("aria-label")).toBe("Expand callout");
      expect(body(folded.container).hasAttribute("inert")).toBe(true);
      folded.unmount();
      const open = render(<CalloutBlock {...fold("+")} />);
      expect(chevron(open.container).getAttribute("aria-expanded")).toBe("true");
      expect(chevron(open.container).getAttribute("aria-label")).toBe("Collapse callout");
      expect(body(open.container).hasAttribute("inert")).toBe(false);
      open.unmount();
      const plain = render(<CalloutBlock {...fold("")} />);
      expect(chevron(plain.container)).toBeNull();
    });

    it("toggles on the chevron and writes nothing", () => {
      const { container } = render(<CalloutBlock {...fold("-")} />);
      fireEvent.click(chevron(container));
      expect(chevron(container).getAttribute("aria-expanded")).toBe("true");
      expect(body(container).hasAttribute("inert")).toBe(false);
      fireEvent.click(chevron(container));
      expect(chevron(container).getAttribute("aria-expanded")).toBe("false");
      expect(defaultProps.onUpdateBlock).not.toHaveBeenCalled();
      expect(defaultProps.onUpdateTitle).not.toHaveBeenCalled();
      expect(defaultProps.onUpdateText).not.toHaveBeenCalled();
    });

    it("starts again from its sign when the open note changes, or the sign does", () => {
      const { container, rerender } = render(<CalloutBlock {...fold("-")} />);
      fireEvent.click(chevron(container));
      expect(chevron(container).getAttribute("aria-expanded")).toBe("true");
      rerender(<CalloutBlock {...fold("-", { noteId: "note-2" })} />);
      expect(chevron(container).getAttribute("aria-expanded")).toBe("false");
      rerender(<CalloutBlock {...fold("+", { noteId: "note-2" })} />);
      expect(chevron(container).getAttribute("aria-expanded")).toBe("true");
    });
  });
});
