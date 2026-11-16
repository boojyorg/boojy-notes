/**
 * Whether a textarea's caret sits on its first or last *visual* row. A
 * textarea wraps long lines and has no way to say which row its caret is
 * on, so the text is laid out again in a hidden twin of the same width and
 * type, and two marks are compared: the caret's and the text's edge. ↑ and
 * ↓ leave a code or maths source only from these rows; judged by newlines
 * alone, a wrapped line counted as one row and the keys left from its middle.
 */
const COPIED = [
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariantLigatures",
  "letterSpacing",
  "lineHeight",
  "tabSize",
  "textIndent",
  "textTransform",
  "whiteSpace",
  "wordBreak",
  "overflowWrap",
] as const;

export function caretOnEdgeRow(ta: HTMLTextAreaElement, edge: "first" | "last"): boolean {
  const caret = edge === "first" ? ta.selectionStart : ta.selectionEnd;
  // A newline between the caret and the edge settles it without measuring.
  const beyond = edge === "first" ? ta.value.slice(0, caret) : ta.value.slice(caret);
  if (beyond.includes("\n")) return false;
  const parent = ta.parentElement;
  if (!parent) return true;

  const twin = document.createElement("div");
  const from = getComputedStyle(ta);
  for (const prop of COPIED) twin.style[prop] = from[prop];
  twin.style.position = "absolute";
  twin.style.visibility = "hidden";
  twin.style.pointerEvents = "none";
  twin.style.height = "auto";
  twin.style.width = from.width;
  const mark = () => {
    const span = document.createElement("span");
    span.textContent = "​";
    return span;
  };
  const start = mark();
  const at = mark();
  const end = mark();
  twin.append(start, ta.value.slice(0, caret), at, ta.value.slice(caret), end);
  // Beside the field, so it inherits what the field inherits (zoom included).
  parent.appendChild(twin);
  const edgeMark = edge === "first" ? start : end;
  const same = at.offsetTop === edgeMark.offsetTop;
  twin.remove();
  return same;
}
