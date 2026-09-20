/** @vitest-environment jsdom */
/**
 * The inline formats as DOM operations. The contract: a format is an element
 * wrapped around the selection inside one boundary, a field that holds inline
 * Markdown claims its own formatting with an attribute, and a format applied
 * in a field is announced with the `input` event a keystroke fires, so the
 * field's own handler is the only thing that commits it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIELD_FORMATS,
  applyDomFormat,
  formatInlineField,
  inlineFieldFor,
  inlineFormatForKey,
  toggleInlineCode,
  toggleWrappingTag,
} from "../../src/utils/inlineFormatCommands";

/** A detached-but-attached surface holding `html`, with `text` selected. */
function surface(html: string, from: number, to: number) {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.appendChild(root);
  const text = root.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const sel = window.getSelection() as Selection;
  sel.removeAllRanges();
  sel.addRange(range);
  return { root, sel };
}

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("inlineFormatForKey", () => {
  const key = (
    k: string,
    mods: Partial<Record<"ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
  ) => inlineFormatForKey({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, ...mods });

  it("reads the editor's format shortcuts, and nothing without a modifier", () => {
    expect(key("b", { metaKey: true })).toBe("bold");
    expect(key("i", { ctrlKey: true })).toBe("italic");
    expect(key("`", { metaKey: true })).toBe("code");
    expect(key("e", { metaKey: true })).toBe("code");
    expect(key("e", { ctrlKey: true })).toBe("code");
    // A dead accent key with Cmd held is what a Spanish layout reports for the backtick.
    expect(key("Dead", { metaKey: true })).toBeNull();
    expect(key("k", { metaKey: true })).toBe("link");
    expect(key("K", { metaKey: true })).toBe("link");
    expect(key("S", { metaKey: true, shiftKey: true })).toBe("strikethrough");
    expect(key("h", { metaKey: true, shiftKey: true })).toBe("highlight");
    expect(key("b")).toBeNull();
    expect(key("x", { metaKey: true })).toBeNull();
    // Shift is its own map: Cmd+Shift+B is not Bold.
    expect(key("b", { metaKey: true, shiftKey: true })).toBeNull();
  });
});

describe("applyDomFormat", () => {
  it("wraps the selection in the format's element, and unwraps it on a second pass", () => {
    const { root, sel } = surface("hello", 0, 5);
    expect(applyDomFormat(sel, "bold", root)).toBe(true);
    expect(root.innerHTML).toBe("<strong>hello</strong>");
    expect(applyDomFormat(sel, "bold", root)).toBe(true);
    expect(root.innerHTML).toBe("hello");
  });

  it("covers each format's element", () => {
    for (const [format, html] of [
      ["italic", "<em>hello</em>"],
      ["strikethrough", "<del>hello</del>"],
      ["highlight", "<mark>hello</mark>"],
      ["code", "<code>hello</code>"],
    ] as const) {
      const { root, sel } = surface("hello", 0, 5);
      expect(applyDomFormat(sel, format, root)).toBe(true);
      expect(root.innerHTML).toBe(html);
      document.body.innerHTML = "";
    }
  });

  it("does nothing for a collapsed caret or a format that is not an element", () => {
    const { root, sel } = surface("hello", 2, 2);
    expect(applyDomFormat(sel, "bold", root)).toBe(false);
    expect(root.innerHTML).toBe("hello");

    const second = surface("hello", 0, 5);
    expect(applyDomFormat(second.sel, "link", second.root)).toBe(false);
    expect(second.root.innerHTML).toBe("hello");
  });

  it("stops the climb at the boundary: an element outside it is not the one being toggled", () => {
    // <strong> outside the field: a wrap inside it nests rather than unwrapping
    // the outer one, which is what keeps a format inside the surface it was
    // applied in.
    const outer = document.createElement("strong");
    const field = document.createElement("div");
    field.textContent = "hello";
    outer.appendChild(field);
    document.body.appendChild(outer);
    const text = field.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);

    applyDomFormat(sel, "bold", field);
    expect(field.innerHTML).toBe("<strong>hello</strong>");
    expect(outer.querySelector("strong")).not.toBeNull();
  });

  it("dissolves a partial clone of the same format into one element", () => {
    const root = document.createElement("div");
    root.innerHTML = "one <strong>two</strong>";
    document.body.appendChild(root);
    const strong = root.querySelector("strong") as HTMLElement;
    const range = document.createRange();
    range.setStart(root.firstChild as Text, 0);
    range.setEnd(strong.firstChild as Text, 2);
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);

    toggleWrappingTag(sel, "STRONG", root);
    expect(root.querySelectorAll("strong strong")).toHaveLength(0);
    expect(root.innerHTML).toBe("<strong>one tw</strong><strong>o</strong>");
  });

  it("unwrapping inline code keeps its text", () => {
    const root = document.createElement("div");
    root.innerHTML = "<code>hello</code>";
    document.body.appendChild(root);
    const code = root.querySelector("code") as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(code.firstChild as Text);
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);

    toggleInlineCode(sel, root);
    expect(root.innerHTML).toBe("hello");
  });
});

describe("inlineFieldFor", () => {
  it("finds the field a node sits in, inside the editor, and nothing else", () => {
    const editor = document.createElement("div");
    editor.innerHTML = `<div data-inline-field="cell"><span>in</span></div><p>out</p>`;
    document.body.appendChild(editor);
    const field = editor.querySelector("[data-inline-field]") as HTMLElement;
    const inner = editor.querySelector("span") as HTMLElement;

    expect(inlineFieldFor(inner.firstChild, editor)).toBe(field);
    expect(inlineFieldFor(inner, editor)).toBe(field);
    expect(inlineFieldFor(editor.querySelector("p"), editor)).toBeNull();
    expect(inlineFieldFor(null, editor)).toBeNull();
    expect(inlineFieldFor(inner, null)).toBeNull();

    // A field of another editor is not this editor's.
    const elsewhere = document.createElement("div");
    elsewhere.innerHTML = `<div data-inline-field="cell">other</div>`;
    document.body.appendChild(elsewhere);
    expect(inlineFieldFor(elsewhere.firstChild?.firstChild ?? null, editor)).toBeNull();
  });
});

describe("formatInlineField", () => {
  /** A field with `word` selected, and the input events it receives. */
  function field(html = "one word") {
    const el = document.createElement("td");
    el.setAttribute("data-inline-field", "cell");
    el.innerHTML = html;
    document.body.appendChild(el);
    const onInput = vi.fn();
    el.addEventListener("input", onInput);
    const text = el.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 8);
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);
    return { el, sel, onInput };
  }

  it("formats inside the field and tells it, the way a keystroke does", () => {
    const { el, sel, onInput } = field();
    expect(formatInlineField(sel, "bold", el)).toBe(true);
    expect(el.innerHTML).toBe("one <strong>word</strong>");
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onInput.mock.calls[0][0].bubbles).toBe(true);
  });

  it("refuses Link, a collapsed caret, and a missing field — and commits nothing", () => {
    const { el, sel, onInput } = field();
    expect(formatInlineField(sel, "link", el)).toBe(false);
    expect(formatInlineField(sel, "bold", null)).toBe(false);
    expect(el.innerHTML).toBe("one word");
    expect(onInput).not.toHaveBeenCalled();

    const collapsed = field();
    collapsed.sel.collapseToEnd();
    expect(formatInlineField(collapsed.sel, "bold", collapsed.el)).toBe(false);
    expect(collapsed.onInput).not.toHaveBeenCalled();
  });

  it("refuses a selection that reaches out of the field, so the grid keeps its elements", () => {
    const row = document.createElement("tr");
    row.innerHTML = `<td data-inline-field="cell">left</td><td data-inline-field="cell">right</td>`;
    document.body.appendChild(row);
    const [a, b] = Array.from(row.querySelectorAll("td"));
    const range = document.createRange();
    range.setStart(a.firstChild as Text, 0);
    range.setEnd(b.firstChild as Text, 5);
    const sel = window.getSelection() as Selection;
    sel.removeAllRanges();
    sel.addRange(range);
    const onInput = vi.fn();
    a.addEventListener("input", onInput);

    expect(formatInlineField(sel, "bold", a)).toBe(false);
    expect(row.innerHTML).toBe(
      `<td data-inline-field="cell">left</td><td data-inline-field="cell">right</td>`,
    );
    expect(onInput).not.toHaveBeenCalled();
  });

  it("offers every format but Link", () => {
    expect([...FIELD_FORMATS]).toEqual(["bold", "italic", "code", "strikethrough", "highlight"]);
  });
});
