/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../../src/utils/domHelpers", () => ({
  getBlockFromNode: vi.fn(),
}));

vi.mock("../../src/utils/inlineFormatting", () => ({
  domNodeToMarkdown: vi.fn(() => "mock text"),
}));

import { useInlineFormatting } from "../../src/hooks/useInlineFormatting";

function setup(overrides = {}) {
  const editorEl = document.createElement("div");
  const blockEl = document.createElement("div");

  const deps = {
    blockRefs: { current: { b1: blockEl } },
    editorRef: { current: editorEl },
    noteDataRef: {
      current: {
        n1: {
          id: "n1",
          content: {
            blocks: [{ id: "b1", type: "p", text: "hello world" }],
          },
        },
      },
    },
    activeNote: "n1",
    updateBlockText: overrides.updateBlockText || vi.fn(),
    setToolbarState: overrides.setToolbarState || vi.fn(),
    onOpenLinkEditor: overrides.onOpenLinkEditor || vi.fn(),
  };

  return { deps, editorEl, blockEl };
}

describe("useInlineFormatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns expected API shape", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useInlineFormatting(deps));

    expect(typeof result.current.applyFormat).toBe("function");
    expect(typeof result.current.detectActiveFormats).toBe("function");
    expect(typeof result.current.reReadBlockFromDom).toBe("function");
    expect(typeof result.current.toggleInlineCode).toBe("function");
    expect(typeof result.current.getLinkContext).toBe("function");
  });

  it("applyFormat calls document.execCommand for bold", () => {
    const setToolbarState = vi.fn();
    const { deps, editorEl } = setup({ setToolbarState });
    document.body.appendChild(editorEl);

    // Add text and create a selection so applyFormat doesn't bail
    const textNode = document.createTextNode("hello");
    editorEl.appendChild(textNode);
    const range = document.createRange();
    range.selectNodeContents(textNode);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    // Define execCommand on document if it doesn't exist (jsdom)
    const origExec = document.execCommand;
    document.execCommand = vi.fn(() => true);

    const { result } = renderHook(() => useInlineFormatting(deps));

    act(() => {
      result.current.applyFormat("bold");
    });

    expect(document.execCommand).toHaveBeenCalledWith("bold");
    expect(setToolbarState).toHaveBeenCalledWith(null);
    document.execCommand = origExec;
    document.body.removeChild(editorEl);
  });

  it("applyFormat calls document.execCommand for italic", () => {
    const setToolbarState = vi.fn();
    const { deps, editorEl } = setup({ setToolbarState });
    document.body.appendChild(editorEl);

    const textNode = document.createTextNode("hello");
    editorEl.appendChild(textNode);
    const range = document.createRange();
    range.selectNodeContents(textNode);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const origExec = document.execCommand;
    document.execCommand = vi.fn(() => true);

    const { result } = renderHook(() => useInlineFormatting(deps));

    act(() => {
      result.current.applyFormat("italic");
    });

    expect(document.execCommand).toHaveBeenCalledWith("italic");
    expect(setToolbarState).toHaveBeenCalledWith(null);
    document.execCommand = origExec;
    document.body.removeChild(editorEl);
  });

  it("applyFormat for link calls onOpenLinkEditor", () => {
    const onOpenLinkEditor = vi.fn();
    const setToolbarState = vi.fn();
    const { deps, editorEl } = setup({ onOpenLinkEditor, setToolbarState });
    document.body.appendChild(editorEl);

    // Create a selection so applyFormat doesn't bail on !sel.rangeCount
    const textNode = document.createTextNode("link text");
    editorEl.appendChild(textNode);
    const range = document.createRange();
    range.selectNodeContents(textNode);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);

    const { result } = renderHook(() => useInlineFormatting(deps));

    act(() => {
      result.current.applyFormat("link");
    });

    expect(onOpenLinkEditor).toHaveBeenCalled();
    // Should NOT dismiss toolbar for link (popover handles it)
    expect(setToolbarState).not.toHaveBeenCalledWith(null);
    document.body.removeChild(editorEl);
  });

  it("detectActiveFormats returns all false when no selection", () => {
    const { deps } = setup();
    const { result } = renderHook(() => useInlineFormatting(deps));

    // Clear any existing selection
    window.getSelection().removeAllRanges();

    let formats;
    act(() => {
      formats = result.current.detectActiveFormats();
    });

    expect(formats.bold).toBe(false);
    expect(formats.italic).toBe(false);
    expect(formats.code).toBe(false);
    expect(formats.link).toBe(false);
    expect(formats.strikethrough).toBe(false);
    expect(formats.highlight).toBe(false);
  });

  it("detectActiveFormats detects bold when anchor is inside STRONG", () => {
    const { deps, editorEl } = setup();
    document.body.appendChild(editorEl);

    const strong = document.createElement("strong");
    strong.textContent = "bold text";
    editorEl.appendChild(strong);

    const range = document.createRange();
    range.selectNodeContents(strong.firstChild);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const { result } = renderHook(() => useInlineFormatting(deps));

    let formats;
    act(() => {
      formats = result.current.detectActiveFormats();
    });

    expect(formats.bold).toBe(true);
    expect(formats.italic).toBe(false);

    document.body.removeChild(editorEl);
  });

  it("detectActiveFormats detects italic when anchor is inside EM", () => {
    const { deps, editorEl } = setup();
    document.body.appendChild(editorEl);

    const em = document.createElement("em");
    em.textContent = "italic text";
    editorEl.appendChild(em);

    const range = document.createRange();
    range.selectNodeContents(em.firstChild);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const { result } = renderHook(() => useInlineFormatting(deps));

    let formats;
    act(() => {
      formats = result.current.detectActiveFormats();
    });

    expect(formats.italic).toBe(true);

    document.body.removeChild(editorEl);
  });

  it("toggleInlineCode wraps selected text in code element", () => {
    const { deps, editorEl } = setup();
    document.body.appendChild(editorEl);

    const textNode = document.createTextNode("some code");
    editorEl.appendChild(textNode);

    const range = document.createRange();
    range.selectNodeContents(textNode);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    const { result } = renderHook(() => useInlineFormatting(deps));

    act(() => {
      result.current.toggleInlineCode(sel);
    });

    expect(editorEl.querySelector("code")).not.toBe(null);
    expect(editorEl.querySelector("code").textContent).toBe("some code");

    document.body.removeChild(editorEl);
  });
});
