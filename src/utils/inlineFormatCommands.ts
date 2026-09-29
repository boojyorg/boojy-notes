/**
 * The inline formats as DOM operations, and which surface may carry one.
 *
 * A text block and a field that holds inline Markdown (a table cell, a
 * callout's body) format identically: the selection is wrapped in the
 * format's element and the surface is read back as Markdown afterwards. Only
 * the commit differs — the editor reads a block back (`useInlineFormatting`),
 * while a field commits its own text, so a format applied in one is announced
 * with the `input` event a keystroke fires and the field's own handler takes
 * it from there. One commit path per surface, the one typing already uses.
 *
 * `boundary` is where the climb for an element of the same format stops: the
 * editor root for a block, the field itself for a field, so a format never
 * reaches out of the surface it was applied in.
 */

export type InlineFormat = "bold" | "italic" | "code" | "strikethrough" | "highlight" | "link";

/**
 * A field that holds inline Markdown and commits it on every input. The
 * attribute is the field's own claim to its formatting: a table cell and a
 * callout's body carry it, while a callout's title (plain text, painted as
 * `textContent`) and a code block's textarea deliberately do not, because a
 * `**` there is literal and a format would have nowhere to live.
 */
export const INLINE_FIELD_SELECTOR = "[data-inline-field]";

/**
 * The formats a field can carry. Link is the editor's alone for now: its
 * popover is positioned against the text column and a cell inside a sideways
 * scroller is not that. The selection toolbar drops the glyph in a field
 * rather than showing one that cannot act.
 */
export const FIELD_FORMATS: readonly InlineFormat[] = [
  "bold",
  "italic",
  "code",
  "strikethrough",
  "highlight",
];

/** Which element each format is, where the format *is* an element. */
const WRAP_TAGS: Record<string, string> = {
  bold: "STRONG",
  italic: "EM",
  strikethrough: "DEL",
  highlight: "MARK",
  code: "CODE",
};

const SHIFT_KEYS: Record<string, InlineFormat> = {
  S: "strikethrough",
  s: "strikethrough",
  H: "highlight",
  h: "highlight",
};
const MOD_KEYS: Record<string, InlineFormat> = {
  b: "bold",
  i: "italic",
  // Cmd+E is the inline-code shortcut shown (Notion's), because the backtick
  // is a dead accent key on Spanish and most European layouts and reports
  // "Dead" with Cmd held, so Cmd+` never matched there (2026-09-20). The
  // backtick stays as an unshown alternative where the layout gives it.
  e: "code",
  "`": "code",
  k: "link",
  K: "link",
};

/**
 * The format a keystroke asks for, or null. The one map: the editor root
 * (`useKeyboardHandlers`) and every field read it, and `FORMATS` in
 * `FloatingToolbar` shows the same shortcuts to the user.
 */
export function inlineFormatForKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): InlineFormat | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  return (e.shiftKey ? SHIFT_KEYS[e.key] : MOD_KEYS[e.key]) ?? null;
}

/** The first and last non-empty text nodes under `root`, or nulls. */
function textEdges(root: Node): [Text | null, Text | null] {
  let first: Text | null = null;
  let last: Text | null = null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (!t.length) continue;
    if (!first) first = t;
    last = t;
  }
  return [first, last];
}

/**
 * The `tagName` element the selection is already inside: the one around its
 * start, else one that holds every character it selects. The second read is
 * for a selection that starts just outside the element, on the empty text a
 * wrap leaves before it (where a restored selection lands): read from its
 * start alone it was "not formatted", and the next press wrapped again.
 */
function wrappingTag(range: Range, anchor: Node | null, tagName: string, boundary: Node | null) {
  const inside = (from: Node | null): Element | null => {
    for (let node = from; node && node !== boundary; node = node.parentNode) {
      if (node.nodeName === tagName) return node as Element;
    }
    return null;
  };
  const around = inside(anchor);
  if (around) return around;
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let only: Element | null = null;
  for (let t = walker.nextNode() as Text | null; t; t = walker.nextNode() as Text | null) {
    if (!range.intersectsNode(t)) continue;
    const from = t === range.startContainer ? range.startOffset : 0;
    const to = t === range.endContainer ? range.endOffset : t.length;
    if (to <= from) continue;
    const el = inside(t);
    if (!el || (only && el !== only)) return null;
    only = el;
  }
  return only;
}

/**
 * Wrap the selection in `tagName`, or unwrap the one it is already inside.
 * Bold and italic go through here too, never `execCommand("bold")`, which
 * decides its direction from the *computed* style: inside a heading, or a
 * table's header cell (600), it *removed* the format and left a
 * `font-weight: normal` span the walker reads as plain text, so the word went
 * lighter on screen and the file never got its `**`.
 */
export function toggleWrappingTag(sel: Selection, tagName: string, boundary: Node | null): void {
  if (!sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const existing = wrappingTag(range, sel.anchorNode, tagName, boundary);
  if (existing) {
    // Unwrap (move children out) rather than flattening to textContent, so any
    // nested formatting (e.g. **bold** inside ~~strike~~) survives toggling off.
    const parent = existing.parentNode;
    if (!parent) return;
    const r = document.createRange();
    if (existing.firstChild) {
      const first = existing.firstChild;
      const last = existing.lastChild as Node;
      while (existing.firstChild) parent.insertBefore(existing.firstChild, existing);
      parent.removeChild(existing);
      r.setStartBefore(first);
      r.setEndAfter(last);
    } else {
      const placeholder = document.createTextNode("");
      parent.replaceChild(placeholder, existing);
      r.selectNodeContents(placeholder);
    }
    sel.removeAllRanges();
    sel.addRange(r);
    return;
  }
  const el = document.createElement(tagName.toLowerCase());
  try {
    range.surroundContents(el);
  } catch {
    const frag = range.extractContents();
    el.appendChild(frag);
    range.insertNode(el);
  }
  // A selection that reaches into an existing run of the same format
  // brings a partial clone of it along; one element of the format is
  // what the wrap means, so any nested copy is dissolved into it.
  for (const inner of Array.from(el.querySelectorAll(tagName.toLowerCase()))) {
    while (inner.firstChild) inner.parentNode?.insertBefore(inner.firstChild, inner);
    inner.remove();
  }
  // Reselect on text boundaries, as Chromium's own commands do. An
  // element-boundary range, (em, 0)–(em, 1), is canonicalised against
  // the empty text node the split leaves beside the element and
  // collapses to the block's start (probed live 2026-09-16), so the
  // toolbar read no format and a second press wrapped nothing.
  el.parentNode?.normalize();
  const [first, last] = textEdges(el);
  const r = document.createRange();
  if (first && last) {
    r.setStart(first, 0);
    r.setEnd(last, last.length);
  } else {
    r.selectNodeContents(el);
  }
  sel.removeAllRanges();
  sel.addRange(r);
}

/**
 * Inline code is one more wrap: the same toggle as bold, so it reselects on
 * text and never nests. Its own copy did neither, and a second press over a
 * selection restored just outside it wrote ``Bugs`` (2026-09-29).
 */
export function toggleInlineCode(sel: Selection, boundary: Node | null): void {
  toggleWrappingTag(sel, "CODE", boundary);
}

/**
 * Apply `format` to the selection inside `boundary`, and say whether the DOM
 * changed. A collapsed caret formats nothing here: the pending style
 * `execCommand` sets for the next keystroke has no structural equivalent, and
 * it is the editor that keeps that residue for a text block (`applyFormat`).
 */
export function applyDomFormat(
  sel: Selection,
  format: InlineFormat,
  boundary: Node | null,
): boolean {
  if (!sel.rangeCount || sel.isCollapsed) return false;
  const tag = WRAP_TAGS[format];
  if (!tag) return false;
  toggleWrappingTag(sel, tag, boundary);
  return true;
}

/**
 * The field holding `node`, or null when it is in a text block, outside the
 * editor, or in a field that holds no Markdown.
 */
export function inlineFieldFor(
  node: Node | null | undefined,
  editorRoot: Element | null,
): HTMLElement | null {
  if (!node || !editorRoot) return null;
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const field = el?.closest?.(INLINE_FIELD_SELECTOR) as HTMLElement | null;
  return field && editorRoot.contains(field) ? field : null;
}

/**
 * Format the selection inside a field and tell the field, the way a keystroke
 * does: its own `input` handler reads the field back as Markdown and commits
 * it at the text grain, so undo takes the 500 ms burst and `useOwnedField`
 * paints nothing (the field already holds what state holds).
 *
 * A selection with an end outside the field is refused, as every edit
 * reaching out of an owned field is: wrapping a range spanning two cells
 * would take the grid's own elements into the format.
 */
export function formatInlineField(
  sel: Selection | null,
  format: InlineFormat,
  field: HTMLElement | null,
): boolean {
  if (!sel?.rangeCount || !field) return false;
  if (!FIELD_FORMATS.includes(format)) return false;
  const range = sel.getRangeAt(0);
  if (!field.contains(range.startContainer) || !field.contains(range.endContainer)) return false;
  if (!applyDomFormat(sel, format, field)) return false;
  field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}
