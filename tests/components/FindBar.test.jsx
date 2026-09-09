/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

vi.mock("../../src/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: {
      BG: { elevated: "#333", divider: "#555" },
      TEXT: { primary: "#eee", secondary: "#bbb", muted: "#888" },
      overlay: (o) => `rgba(255,255,255,${o})`,
    },
  }),
}));

import FindBar from "../../src/components/FindBar.jsx";
import { inlineMarkdownToHtml } from "../../src/utils/inlineFormatting.js";

// jsdom has no CSS Custom Highlight API; Find only needs a registry and a
// Highlight that holds its ranges.
beforeEach(() => {
  globalThis.CSS = { highlights: new Map() };
  globalThis.Highlight = class {
    constructor(...ranges) {
      this.ranges = ranges;
    }
  };
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  delete globalThis.CSS;
  delete globalThis.Highlight;
});

/**
 * A note on screen: one root with a text block per entry, painted the way
 * EditableBlock paints them, plus a code block whose text Find can see but
 * Replace must leave alone.
 */
function mount(texts, { code } = {}) {
  const editor = document.createElement("div");
  document.body.appendChild(editor);
  const blocks = [];
  const refs = {};
  texts.forEach((text, i) => {
    const id = `b${i}`;
    blocks.push({ id, type: "p", text });
    const el = document.createElement("div");
    el.setAttribute("data-block-id", id);
    el.innerHTML = inlineMarkdownToHtml(text, new Set());
    editor.appendChild(el);
    refs[id] = el;
  });
  if (code !== undefined) {
    blocks.push({ id: "code", type: "code", text: code });
    const el = document.createElement("div");
    el.setAttribute("data-block-id", "code");
    el.innerHTML = `<pre>${code}</pre>`;
    editor.appendChild(el);
    refs.code = el;
  }
  const updateBlockText = vi.fn();
  const utils = render(
    <FindBar
      editorRef={{ current: editor }}
      blocks={blocks}
      blockRefs={{ current: refs }}
      noteId="n1"
      updateBlockText={updateBlockText}
      initialShowReplace
      onClose={() => {}}
    />,
  );
  const find = (term) =>
    act(() => {
      fireEvent.change(utils.getByPlaceholderText("Find in note..."), { target: { value: term } });
    });
  const replaceWith = (term) =>
    act(() => {
      fireEvent.change(utils.getByPlaceholderText("Replace with..."), { target: { value: term } });
    });
  const counter = () => utils.container.querySelector("span[title], span").textContent;
  return { ...utils, editor, refs, updateBlockText, find, replaceWith, counter, blocks };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("FindBar", () => {
  it("counts the matches on screen", () => {
    const m = mount(["Tea leaves for two.", "More leaves here."]);
    m.find("leaves");
    expect(m.getByText("1 of 2")).toBeTruthy();
  });

  it("Replace edits the visible match, reads the block back, and stays on its place in the list", () => {
    const m = mount(["Tea leaves for two.", "More leaves here."]);
    m.find("leaves");
    m.replaceWith("leafs");
    fireEvent.click(m.getByTitle("Replace"));
    // The screen holds the replacement, the block was read back from it, and
    // the one match left is now the active one.
    expect(m.refs.b0.textContent).toBe("Tea leafs for two.");
    expect(m.updateBlockText).toHaveBeenCalledWith("n1", 0, "Tea leafs for two.");
    expect(m.getByText("1 of 1")).toBeTruthy();
    fireEvent.click(m.getByTitle("Replace"));
    expect(m.refs.b1.textContent).toBe("More leafs here.");
    expect(m.updateBlockText).toHaveBeenLastCalledWith("n1", 1, "More leafs here.");
    expect(m.getByText("0 of 0")).toBeTruthy();
  });

  it("replaces the nth visible match, not the nth in the Markdown, and keeps the link", () => {
    const m = mount(["See [docs](https://docs.example.com) for docs."]);
    m.find("docs");
    m.replaceWith("notes");
    fireEvent.click(m.getByTitle("Next (Enter)"));
    expect(m.getByText("2 of 2")).toBeTruthy();
    fireEvent.click(m.getByTitle("Replace"));
    expect(m.updateBlockText).toHaveBeenCalledWith(
      "n1",
      0,
      "See [docs](https://docs.example.com) for notes.",
    );
  });

  it("Replace All edits every text block once, as text, and leaves a code block alone", () => {
    const m = mount(["a docs b docs", "docs"], { code: "docs()" });
    m.find("docs");
    expect(m.getByText("1 of 4")).toBeTruthy();
    m.replaceWith("$& x");
    fireEvent.click(m.getByTitle("Replace All"));
    expect(m.updateBlockText).toHaveBeenCalledTimes(2);
    expect(m.updateBlockText).toHaveBeenCalledWith("n1", 0, "a $& x b $& x");
    expect(m.updateBlockText).toHaveBeenCalledWith("n1", 1, "$& x");
    expect(m.refs.code.textContent).toBe("docs()");
    // The code block's match is still there; only it is left.
    expect(m.getByText("1 of 1")).toBeTruthy();
  });

  it("Replace on a match inside a code block changes nothing", () => {
    const m = mount(["plain"], { code: "docs()" });
    m.find("docs");
    m.replaceWith("x");
    fireEvent.click(m.getByTitle("Replace"));
    expect(m.updateBlockText).not.toHaveBeenCalled();
    expect(m.refs.code.textContent).toBe("docs()");
  });
});
