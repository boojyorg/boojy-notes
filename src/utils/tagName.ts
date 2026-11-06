/**
 * A drawn `#tag` pill's name and the range of it, for its menus: Search reads
 * the name, Edit tag selects it. Read from the pill's text, never `data-tag`
 * (written at paint, so a tag grown by typing keeps its first letters there),
 * and never a caret anchor's U+200B.
 */

function tagTexts(tag: Element): Text[] {
  const walker = document.createTreeWalker(tag, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.parentElement?.closest(".caret-anchor")) texts.push(n as Text);
  }
  return texts;
}

/** The tag's name, nested parts and all, without its `#`. */
export function tagName(tag: Element): string {
  return tagTexts(tag)
    .map((t) => t.data)
    .join("")
    .replace(/​/g, "")
    .replace(/^#/, "");
}

/**
 * The name's range, the `#` left out, so typing over it renames this one tag
 * and it stays a tag. Null when the pill holds no `#` (it never does).
 */
export function tagNameRange(tag: Element): Range | null {
  const texts = tagTexts(tag);
  const first = texts.find((t) => t.data.includes("#"));
  const last = texts[texts.length - 1];
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first, first.data.indexOf("#") + 1);
  range.setEnd(last, last.data.replace(/​+$/, "").length);
  return range;
}

/** Selects the tag's name (Edit tag), in its editor. */
export function selectTagName(tag: Element): boolean {
  const range = tagNameRange(tag);
  const sel = window.getSelection();
  if (!range || !sel) return false;
  const host = tag.closest<HTMLElement>("[contenteditable='true']");
  host?.focus({ preventScroll: true });
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}
