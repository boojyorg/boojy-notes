import { htmlToInlineMarkdown, sanitizeInlineHtml } from "./inlineFormatting";

/**
 * A multi-line rich paste as Markdown: the clipboard's `text/html` read into
 * the blocks and inline formatting the note can hold, for `markdownToBlocks`
 * to parse like any other paste. Until 2026-09-24 a paste of several lines
 * read `text/plain` only, so a browser's bold, italics and links were lost
 * (a single line already kept them).
 *
 * Returns `null` when the HTML carries no formatting of its own, and the
 * caller pastes the plain text as before. That is not only a shortcut: an
 * editor such as VS Code puts a `<div>` per line and colour spans on the
 * clipboard, and read as blocks every line of a pasted code fence would be a
 * paragraph of its own. Only semantic markup counts (`FORMATTING`), plus the
 * two inline styles Google Docs uses in place of it.
 *
 * Text is read verbatim, as the single-line path reads it, so Markdown source
 * copied as text still arrives as structure; HTML's own whitespace (the
 * indentation and line breaks of the page's source) is collapsed first.
 */

const FORMATTING =
  "b,strong,i,em,a[href],code,del,s,mark,h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,hr,table";

/** Elements that start a block of their own; anything else is inline content. */
const BLOCKS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DETAILS",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "FORM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "LI",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "PRE",
  "SECTION",
  "SUMMARY",
  "TABLE",
  "UL",
]);

/** Elements whose content never reaches a note. */
const DROPPED = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "HEAD",
  "META",
  "TITLE",
  "IMG",
]);

export function richPasteMarkdown(html: string): string | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  normalise(body);
  if (!body.querySelector(FORMATTING)) return null;
  const md = blocksOf(body).join("\n\n");
  return md.trim() ? md : null;
}

/**
 * Prepare the parsed page for reading: drop what is never content, keep only
 * links with an address, collapse
 * source whitespace outside `<pre>`, unwrap Google Docs' whole-document `<b>`
 * (it is `font-weight: normal`), and turn the inline bold and italic styles
 * Google Docs uses for real formatting into the elements they mean.
 */
function normalise(root: HTMLElement) {
  const doc = root.ownerDocument;
  for (const el of Array.from(root.querySelectorAll("*"))) {
    if (DROPPED.has(el.nodeName)) el.remove();
  }
  // A link the note can follow: a web or mail address. A page-relative link
  // (`/wiki/Foo`, `#top`) would be broken in a note and `javascript:` is not
  // an address, so both keep their words and lose the link.
  for (const el of Array.from(root.querySelectorAll("a"))) {
    if (!/^(https?:|mailto:)/i.test(el.getAttribute("href") ?? "")) unwrap(el);
  }
  for (const el of Array.from(root.querySelectorAll("b, strong"))) {
    if (/font-weight\s*:\s*(normal|[1-4]00)\b/i.test(el.getAttribute("style") ?? "")) unwrap(el);
  }
  for (const el of Array.from(root.querySelectorAll("span[style]"))) {
    const style = el.getAttribute("style") ?? "";
    let wrapped: Element = el;
    if (/font-weight\s*:\s*(bold|[6-9]00)\b/i.test(style))
      wrapped = wrapChildren(wrapped, "strong");
    if (/font-style\s*:\s*italic\b/i.test(style)) wrapChildren(wrapped, "em");
  }
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const t of texts) {
    if (t.parentElement?.closest("pre")) continue;
    t.data = t.data.replace(/[ \t\r\n\f]+/g, " ");
  }
}

function unwrap(el: Element) {
  el.replaceWith(...Array.from(el.childNodes));
}

/** Move `el`'s children into a new `tag` inside it; returns the new element. */
function wrapChildren(el: Element, tag: string): Element {
  const inner = el.ownerDocument.createElement(tag);
  inner.append(...Array.from(el.childNodes));
  el.appendChild(inner);
  return inner;
}

/** The Markdown blocks under `parent`, in order; inline runs between blocks are paragraphs. */
function blocksOf(parent: Element): string[] {
  const out: string[] = [];
  let run: Node[] = [];
  const flush = () => {
    const text = inline(run);
    if (text) out.push(text);
    run = [];
  };
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && BLOCKS.has(child.nodeName)) {
      flush();
      out.push(...block(child as Element));
    } else {
      run.push(child);
    }
  }
  flush();
  return out;
}

/** Inline nodes as inline Markdown, trimmed; a `<br>` is a soft break. */
function inline(nodes: Node[]): string {
  const holder = document.createElement("div");
  for (const n of nodes) holder.appendChild(n.cloneNode(true));
  const md = htmlToInlineMarkdown(sanitizeInlineHtml(holder.innerHTML));
  return md
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

function block(el: Element): string[] {
  const tag = el.nodeName;
  if (/^H[1-6]$/.test(tag)) {
    const text = inline(Array.from(el.childNodes)).replace(/\n/g, " ");
    return text ? [`${"#".repeat(Number(tag[1]))} ${text}`] : [];
  }
  if (tag === "HR") return ["---"];
  if (tag === "PRE") return [fence(el.textContent ?? "")];
  if (tag === "UL" || tag === "OL") return [list(el, "").join("\n")].filter(Boolean);
  if (tag === "BLOCKQUOTE") {
    const inner = blocksOf(el).join("\n\n");
    return inner ? [inner.replace(/^/gm, "> ").replace(/^> $/gm, ">")] : [];
  }
  if (tag === "TABLE") return [table(el)].filter(Boolean);
  if (tag === "LI") return [list(el.ownerDocument.createElement("ul"), "", [el]).join("\n")];
  return blocksOf(el);
}

/** A fence longer than any backtick run inside the code. */
function fence(code: string): string {
  const body = code.replace(/\n$/, "");
  const longest = Math.max(2, ...(body.match(/`+/g) ?? []).map((r) => r.length));
  const ticks = "`".repeat(longest + 1);
  return `${ticks}\n${body}\n${ticks}`;
}

/**
 * A list's lines. A nested list is indented to its parent item's content
 * column, as the app's own writer does; an ordered list keeps its start.
 */
function list(listEl: Element, indent: string, items?: Element[]): string[] {
  const ordered = listEl.nodeName === "OL";
  let n = Number(listEl.getAttribute("start") ?? "1");
  if (!Number.isFinite(n)) n = 1;
  const lines: string[] = [];
  const lis = items ?? Array.from(listEl.children).filter((c) => c.nodeName === "LI");
  for (const li of lis) {
    const box = li.querySelector(
      ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
    );
    const marker = ordered
      ? `${n++}. `
      : box
        ? `- [${(box as HTMLInputElement).checked ? "x" : " "}] `
        : "- ";
    const own: Node[] = [];
    const nested: Element[] = [];
    for (const c of Array.from(li.childNodes)) {
      if (c === box) continue;
      if (c.nodeName === "UL" || c.nodeName === "OL") nested.push(c as Element);
      else own.push(c);
    }
    const hasBlock = own.some((c) => c.nodeType === Node.ELEMENT_NODE && BLOCKS.has(c.nodeName));
    const text = hasBlock ? blocksOf(wrap(own)).join(" ") : inline(own);
    // A task's children sit under its text after the `- `, not after `[ ] `:
    // six spaces in is an indented code block to every reader.
    const pad = indent + " ".repeat(ordered ? marker.length : 2);
    lines.push(`${indent}${marker}${text.replace(/\n/g, `\n${pad}`)}`);
    for (const sub of nested) lines.push(...list(sub, pad));
  }
  return lines;
}

function wrap(nodes: Node[]): Element {
  const div = document.createElement("div");
  for (const n of nodes) div.appendChild(n.cloneNode(true));
  return div;
}

/** A GFM table; the first row is the header, and every row as wide as the widest. */
function table(el: Element): string {
  const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children)
      .filter((c) => c.nodeName === "TD" || c.nodeName === "TH")
      .map((c) => inline(Array.from(c.childNodes)).replace(/\n/g, " ").replace(/\|/g, "\\|")),
  );
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (!rows.length || !width) return "";
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
  return [line(rows[0]), `|${" --- |".repeat(width)}`, ...rows.slice(1).map(line)].join("\n");
}
