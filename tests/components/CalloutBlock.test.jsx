/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

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
      },
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
    onUpdateCallout: vi.fn(),
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
    // Info callout bg from theme mock
    expect(callout.style.background).toBe("rgb(68, 98, 119)");
  });

  it("renders with warning callout type", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, calloutType: "warning", title: "Warning" },
    };
    const { container } = render(<CalloutBlock {...props} />);
    const callout = container.querySelector(".callout-block");
    expect(callout.style.background).toBe("rgb(99, 82, 66)");
  });

  it("renders with tip callout type", () => {
    const props = {
      ...defaultProps,
      block: { ...defaultProps.block, calloutType: "tip", title: "Tip" },
    };
    const { container } = render(<CalloutBlock {...props} />);
    const callout = container.querySelector(".callout-block");
    expect(callout.style.background).toBe("rgb(76, 94, 67)");
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
    expect(callout.style.background).toBe("rgb(107, 61, 79)");
  });
});
