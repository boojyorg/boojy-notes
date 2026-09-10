// Typed inline formatting: `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`,
// `==highlight==`, `***both***`, and the underscore forms `_italic_` and
// `__bold__`, converted on screen the moment the closing marker is typed.
//
// A conversion changes no bytes. The literal `**bold**` the user typed *is*
// the Markdown the file holds, and the renderer would show it bold at the
// next repaint from state; only the screen is behind. So the conversion is a
// repaint of the block from the text it already holds, plus parking the caret
// just after the new element on a caret anchor (the same scaffolding the link
// and tag completions use), so the next character is prose rather than an
// extension of the bold. Cmd+Z is the ordinary typing undo. The one byte
// change is the underscore forms, rewritten to the star form the renderer and
// the writer speak.
//
// The DOM half lives here rather than in domHelpers because it reads the
// Markdown either side of the caret through crossBlockEdit, which imports
// domHelpers itself.
import { makeCaretAnchor, getCaretOffset, placeCaret } from "./domHelpers";
import { inlineMarkdownToHtml, nodeToMarkdown } from "./inlineFormatting";
import { markdownAfter, markdownBefore } from "./crossBlockEdit";

/**
 * The forms, longest marker first so `***x***` is not read as `**` around
 * `*x*`, and `**x**` is tried before `*x*`. Each carries the character class
 * its content may not hold (the marker's own character: a run that contains
 * its marker is left for the renderer to decide at the next repaint), what
 * may not precede the opener beyond a backslash, and what may not follow the
 * closer. The star rules keep the first closing star of `**bold*` from being
 * an italic close; the underscore rules are CommonMark's intraword rule
 * (`snake_case_` is not emphasis, and neither is `_a_b`).
 */
const FORMS = [
  {
    kind: "boldItalic",
    marker: "***",
    canonical: "***",
    tag: "STRONG",
    chars: "*",
    noPrev: "*",
    noNext: "*",
  },
  {
    kind: "bold",
    marker: "**",
    canonical: "**",
    tag: "STRONG",
    chars: "*",
    noPrev: "*",
    noNext: "*",
  },
  {
    kind: "bold",
    marker: "__",
    canonical: "**",
    tag: "STRONG",
    chars: "_",
    noPrev: "\\w",
    noNext: "\\w",
  },
  {
    kind: "strikethrough",
    marker: "~~",
    canonical: "~~",
    tag: "DEL",
    chars: "~",
    noPrev: "~",
    noNext: "~",
  },
  {
    kind: "highlight",
    marker: "==",
    canonical: "==",
    tag: "MARK",
    chars: "=",
    noPrev: "=",
    noNext: "=",
  },
  { kind: "code", marker: "`", canonical: "`", tag: "CODE", chars: "`", noPrev: "`", noNext: "`" },
  { kind: "italic", marker: "*", canonical: "*", tag: "EM", chars: "*", noPrev: "*", noNext: "*" },
  {
    kind: "italic",
    marker: "_",
    canonical: "*",
    tag: "EM",
    chars: "_",
    noPrev: "\\w",
    noNext: "\\w",
  },
].map((form) => {
  const m = form.marker.replace(/[*]/g, "\\*");
  const c = form.chars.replace(/[*]/g, "\\*");
  // Content: one non-space, non-marker character, or a run of non-marker
  // characters that neither starts nor ends with whitespace.
  const content = `(?:[^\\s${c}]|[^\\s${c}][^${c}]*[^\\s${c}])`;
  return {
    ...form,
    regex: new RegExp(`(?<![\\\\${form.noPrev}])${m}(${content})${m}$`),
    next: new RegExp(`^[${form.noNext}]`),
  };
});

/** The characters a typed insertion must be for the trigger to look at all. */
const MARKER_CHARS = new Set(["*", "_", "~", "=", "`"]);

/**
 * The formatting run that the text before the caret has just closed, or null.
 * `before` is the block's Markdown up to the caret, `after` the rest. Pure.
 *
 * @returns {{ kind: string, marker: string, canonical: string, tag: string,
 *   runLength: number, content: string } | null}
 */
export function closingFormatAt(before, after = "") {
  for (const form of FORMS) {
    const m = form.regex.exec(before);
    if (!m) continue;
    if (form.next.test(after)) return null;
    return {
      kind: form.kind,
      marker: form.marker,
      canonical: form.canonical,
      tag: form.tag,
      runLength: m[0].length,
      content: m[1],
    };
  }
  return null;
}

/** Inline elements the caret must not be inside for a run to be converted. */
const FORMAT_TAGS = new Set(["STRONG", "B", "EM", "I", "CODE", "DEL", "S", "MARK", "A"]);

/** The formatting element or link between `node` and the block root, if any. */
function enclosingFormat(node, root) {
  let n = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (n && n !== root) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      if (FORMAT_TAGS.has(n.nodeName) || n.classList.contains("wikilink")) return n;
    }
    n = n.parentNode;
  }
  return null;
}

/**
 * Whether the native input event that just changed `el` closed a formatting
 * run at the caret, and everything the paint needs if it did. The trigger is
 * a typed marker character (an `insertText` of one of `* _ ~ = \``, outside an
 * IME composition): never a deletion, a paste, autocorrect or a repaint, so
 * Backspace onto the anchor after a fresh bold cannot read the block back as
 * `**bold**` and convert it again. The caret must be collapsed in the block's
 * plain text: inside an existing formatting element or link nothing fires.
 *
 * @returns {null | { kind, marker, canonical, tag, runLength, content,
 *   before: string, after: string, head: string, canonicalRun: string,
 *   newText: string, rewritten: boolean, visibleCaret: number }}
 */
export function typedFormatHit(el, native) {
  if (!el || !native || native.inputType !== "insertText" || native.isComposing) return null;
  const data = native.data;
  if (typeof data !== "string" || data.length !== 1 || !MARKER_CHARS.has(data)) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const { anchorNode: node, anchorOffset: offset } = sel;
  if (!node || !el.contains(node)) return null;
  if (enclosingFormat(node, el)) return null;
  const before = markdownBefore(el, node, offset);
  const after = markdownAfter(el, node, offset);
  const hit = closingFormatAt(before, after);
  if (!hit) return null;
  const head = before.slice(0, before.length - hit.runLength);
  const canonicalRun = hit.canonical + hit.content + hit.canonical;
  return {
    ...hit,
    before,
    after,
    head,
    canonicalRun,
    newText: head + canonicalRun + after,
    rewritten: hit.marker !== hit.canonical,
    visibleCaret: getCaretOffset(el),
  };
}

/**
 * Paint `el` from `text` and park the caret just after the element the run
 * became. The element is found by its Markdown prefix: the first direct child
 * at which the accumulated Markdown equals the text before the caret (with
 * the canonical markers) and whose tag is the one the run makes. The
 * renderer's passes run in a fixed order over the whole block and can pair
 * markers differently from the matcher (`x* y *z*` renders `* y *` as the
 * italic), so the paint is verified, never assumed: when no child matches the
 * previous DOM and caret are put back in the same task and the block stays
 * literal, which the next repaint from state resolves however the renderer
 * reads it. Returns whether the run was painted.
 */
export function paintTypedFormat(el, hit, text, noteTitles) {
  const saved = el.innerHTML;
  el.innerHTML = inlineMarkdownToHtml(text, noteTitles);
  const target = hit.head + hit.canonicalRun;
  let acc = "";
  for (const child of el.childNodes) {
    acc += nodeToMarkdown(child, acc);
    if (acc.length < target.length) continue;
    if (acc === target && child.nodeType === Node.ELEMENT_NODE && child.nodeName === hit.tag) {
      const anchor = makeCaretAnchor();
      child.after(anchor);
      const range = document.createRange();
      range.setStart(anchor.firstChild, 1);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }
    break;
  }
  el.innerHTML = saved;
  if (hit.visibleCaret >= 0) placeCaret(el, hit.visibleCaret);
  return false;
}
