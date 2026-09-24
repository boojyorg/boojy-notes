import type { Block, BlockType } from "../types/notes";
import { inlineMarkdownToHtml } from "./inlineFormatting";
import { blocksToMarkdown } from "./markdown";

/**
 * The two public clipboard formats a copy writes, `text/plain` and
 * `text/html`, for the two kinds of selection the copy handler tells apart
 * (`usePasteHandler`, `handleEditorCopy`):
 *
 * - A whole-block copy (the selection spans blocks and wholly covers at
 *   least one, the same test the paste side makes of the private format):
 *   the plain text is the Markdown the app would write for those blocks, the
 *   HTML their structure as headings, lists, quotes, code and tables, so a
 *   Markdown editor and a rich editor both get back what was copied.
 * - An ordinary selection inside a block's text: the plain text is the
 *   visible text, with no marker added for the formatting it carries, and
 *   the HTML the inline formatting as elements, as every rich editor does.
 *
 * Neither carries the editor's own scaffolding: the ↗ icon and the classes
 * and data attributes the renderer hangs on links go; a wikilink, which has
 * no destination outside the vault, is written in its `[[…]]` notation in
 * both formats rather than reduced to its display word; a `#tag` is text.
 *
 * The private `text/boojy-blocks` format is the copy handler's own and is
 * not built here.
 *
 * The Markdown is `blocksToMarkdown`'s, so a whole-block copy is the app's
 * spelling of those blocks, not always the file's bytes: a `*` bullet is
 * written `-`, an authored `03.` is `3.`, imported list indentation and
 * heading spacing are canonical (the copied entries carry no `indentStr`,
 * `marker`, `numRaw` or `headingSource`), and the blank line the writer
 * puts between two blocks is written whether or not the file had it.
 * Special blocks (code, table, callout) are copied whole and keep their
 * source spelling.
 */

/** A block as the copy handler collects it: shaped like a block, no id needed. */
export type CopiedBlock = Omit<Block, "id"> & { id?: string; fullBlock?: boolean; num?: number };

export interface CopyPayload {
  text: string;
  html: string;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Strip the editor's scaffolding from a fragment of its inline HTML, in
 * place: icon spans go, links keep only their href, wikilinks become their
 * notation as text, tag spans and any other span are unwrapped, and a
 * trailing `<br>` (the block's own, kept so the caret can reach an empty
 * last line) is dropped.
 */
function scrubInline(root: ParentNode): void {
  for (const icon of root.querySelectorAll("span.external-link-icon")) icon.remove();
  for (const a of root.querySelectorAll("a")) {
    const href = a.getAttribute("href") || "";
    for (const attr of Array.from(a.attributes)) a.removeAttribute(attr.name);
    a.setAttribute("href", href);
  }
  for (const link of root.querySelectorAll("span.wikilink")) {
    const target = link.getAttribute("data-target") || link.textContent || "";
    const display = link.textContent || "";
    const notation = target === display ? `[[${target}]]` : `[[${target}|${display}]]`;
    link.replaceWith(document.createTextNode(notation));
  }
  for (const span of Array.from(root.querySelectorAll("span"))) {
    span.replaceWith(...Array.from(span.childNodes));
  }
  while (root.lastChild?.nodeName === "BR") root.lastChild.remove();
}

/** A scrubbed fragment's visible text: text as it is, a `<br>` a newline. */
function visibleText(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) out += child.textContent;
    else if (child.nodeName === "BR") out += "\n";
    else out += visibleText(child);
  }
  return out;
}

function parseInline(html: string): HTMLElement {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  scrubInline(doc.body);
  return doc.body;
}

/** Inline Markdown as portable inline HTML. */
const inlineHtml = (md: string | undefined): string =>
  md ? parseInline(inlineMarkdownToHtml(md)).innerHTML : "";

/**
 * The payload for an ordinary selection, from the sanitised HTML of the
 * selected DOM (`sanitizeInlineHtml` of the cloned range).
 */
export function inlineCopyPayload(sanitisedHtml: string): CopyPayload {
  const body = parseInline(sanitisedHtml);
  return { text: visibleText(body), html: body.innerHTML };
}

const LIST_TYPES: ReadonlySet<BlockType> = new Set<BlockType>(["bullet", "numbered", "checkbox"]);

/** A run of list items as nested `<ul>`/`<ol>` HTML, depth from `indent`. */
function listHtml(items: CopiedBlock[]): string {
  const stack: { type: BlockType; depth: number }[] = [];
  const tagOf = (type: BlockType) => (type === "numbered" ? "ol" : "ul");
  const open = (item: CopiedBlock, depth: number) => {
    stack.push({ type: item.type, depth });
    const start =
      item.type === "numbered" && item.num && item.num !== 1 ? ` start="${item.num}"` : "";
    return `<${tagOf(item.type)}${start}>`;
  };
  const close = () => {
    const top = stack.pop();
    return top ? `</li></${tagOf(top.type)}>` : "";
  };
  let out = "";
  for (const item of items) {
    const depth = item.indent || 0;
    while (stack.length && stack[stack.length - 1].depth > depth) out += close();
    const top = stack[stack.length - 1];
    if (top && top.depth === depth) {
      if (top.type === item.type) out += "</li>";
      else out += close() + open(item, depth);
    } else {
      out += open(item, depth);
    }
    const box =
      item.type === "checkbox"
        ? `<input type="checkbox"${(item as { checked?: boolean }).checked ? " checked" : ""} disabled> `
        : "";
    out += `<li>${box}${inlineHtml(item.text)}`;
  }
  while (stack.length) out += close();
  return out;
}

/** One non-list block as HTML. */
function blockHtml(block: CopiedBlock): string {
  switch (block.type) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `<${block.type}>${inlineHtml((block.text || "").replace(/\n/g, " "))}</${block.type}>`;
    case "p":
      return `<p>${inlineHtml(block.text)}</p>`;
    case "blockquote":
      return `<blockquote><p>${inlineHtml(block.text)}</p></blockquote>`;
    case "code": {
      const lang = (block as { lang?: string }).lang;
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
      return `<pre><code${cls}>${escapeHtml(block.text || "")}</code></pre>`;
    }
    case "spacer":
      return "<hr>";
    case "table": {
      const rows = (block as { rows?: string[][] }).rows || [];
      if (rows.length === 0) return "";
      const cells = (row: string[], tag: string) =>
        `<tr>${row.map((cell) => `<${tag}>${inlineHtml(cell)}</${tag}>`).join("")}</tr>`;
      const body = rows
        .slice(1)
        .map((row) => cells(row, "td"))
        .join("");
      return `<table><thead>${cells(rows[0], "th")}</thead>${body ? `<tbody>${body}</tbody>` : ""}</table>`;
    }
    case "callout": {
      const c = block as { title?: string; calloutType?: string; calloutTypeRaw?: string };
      const type = c.calloutTypeRaw || c.calloutType || "note";
      const title = c.title || type.charAt(0).toUpperCase() + type.slice(1);
      const body = block.text ? `<p>${inlineHtml(block.text)}</p>` : "";
      return `<blockquote><p><strong>${inlineHtml(title)}</strong></p>${body}</blockquote>`;
    }
    case "frontmatter":
      return `<pre>${escapeHtml(blocksToMarkdown([block as Block]))}</pre>`;
    default:
      // An image, a file or an embed is a reference into the vault and has
      // no form another app could resolve: its Markdown line, as text.
      return `<p>${escapeHtml(blocksToMarkdown([block as Block]))}</p>`;
  }
}

/** The payload for a whole-block copy. */
export function blockCopyPayload(blocks: CopiedBlock[]): CopyPayload {
  let html = "";
  let i = 0;
  while (i < blocks.length) {
    if (LIST_TYPES.has(blocks[i].type)) {
      let j = i;
      while (j < blocks.length && LIST_TYPES.has(blocks[j].type)) j++;
      html += listHtml(blocks.slice(i, j));
      i = j;
    } else {
      html += blockHtml(blocks[i]);
      i++;
    }
  }
  return { text: blocksToMarkdown(blocks as Block[]), html };
}
