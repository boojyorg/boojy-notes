import { caretLength } from "./domHelpers";
import { inlineMarkdownToHtml } from "./inlineFormatting";

/**
 * How many caret positions a piece of inline Markdown takes once drawn: `**`
 * and a link's address take none, a sealed element one. Caret arithmetic is
 * in these, never in the Markdown's length.
 */
export function drawnLength(markdown) {
  const el = document.createElement("div");
  el.innerHTML = inlineMarkdownToHtml(markdown);
  return caretLength(el);
}
