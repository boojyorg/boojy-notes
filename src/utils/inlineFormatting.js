// Inline markdown ↔ HTML conversion utilities.
// Stores formatting as markdown tokens in block.text, renders as HTML via innerHTML.

import { CARET_ANCHOR_CLASS } from "./domHelpers";

/** Step 1 of the renderer, for prose that has been read back to characters. */
const escapeHtml = (text) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** The three entities step 1 of the renderer makes, back to their characters. */
const unescapeHtml = (html) =>
  html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/**
 * The rendered HTML, one piece at a time: a whole link, code span or wikilink
 * (with everything inside it), any other tag, or a run of prose between tags.
 * Every `<` in the string is a tag's, because the text's own were escaped first.
 */
const PROSE_OR_ELEMENT_RE =
  /<a\b[^>]*>[\s\S]*?<\/a>|<code>[\s\S]*?<\/code>|<span class="wikilink[^"]*"[^>]*>[\s\S]*?<\/span>|<[^>]*>|[^<]+/g;

/**
 * A bare URL in prose: `http(s)://` and everything up to whitespace or `<`,
 * not ending in punctuation that more often closes the sentence than belongs
 * to the address (so `<https://example.com>` links `https://example.com` and
 * shows the brackets as the text they are).
 */
const BARE_URL_RE = /https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"}>]/g;

/** A run of escaped prose with each bare URL made the editor's own autolink. */
function autolinkProse(escaped) {
  if (!escaped.includes("://")) return escaped;
  const text = unescapeHtml(escaped);
  let out = "";
  let last = 0;
  for (const m of text.matchAll(BARE_URL_RE)) {
    const url = escapeHtml(m[0]);
    const attr = url.replace(/"/g, "&quot;");
    out += `${escapeHtml(text.slice(last, m.index))}<a href="${attr}" class="external-link bare-url" data-url="${attr}">${url}<span class="external-link-icon" contenteditable="false">\u2197</span></a>`;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(text.slice(last));
}

/**
 * Convert inline markdown tokens to HTML for rendering.
 * Process order: escape HTML → code → bold+italic → bold → italic →
 *                strikethrough → highlight → wikilinks → markdown links →
 *                bare URLs (in prose only, on the text as written) → tags
 */
export function inlineMarkdownToHtml(md, noteTitles) {
  if (!md) return "";
  let s = md;

  // 1. Escape HTML entities (prevent XSS / accidental tag injection)
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1b. Protect backslash-escaped characters (e.g., \* \~ \= \`) from the
  // formatting passes below. They are restored *with* their backslash, shown
  // as written the way Obsidian's live preview shows them: the DOM walkers
  // read the text back verbatim, so a hidden backslash was gone on the first
  // edit and `\*not italic\*` became italic on the next repaint.
  const escapes = [];
  s = s.replace(/\\([*~`=[\]#])/g, (_, ch) => {
    escapes.push(ch);
    return `\x00ESC${escapes.length - 1}\x00`;
  });

  // 2. Inline code (must be first so formatting inside backticks is preserved literally)
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 3. Bold+Italic (***text***) — must come before bold and italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // 4. Bold (**text**)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 5. Italic (*text*) — single asterisks, not part of bold ** markers
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");

  // 6. Strikethrough (~~text~~)
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // 7. Highlight (==text==)
  s = s.replace(/==(.+?)==/g, "<mark>$1</mark>");

  // 8. Wikilinks [[Target]] or [[Target|Display]]
  const escAttr = (v) => v.replace(/"/g, "&quot;");
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_, target, display) => {
    const broken =
      noteTitles && !noteTitles.has(target.trim().toLowerCase()) ? " wikilink-broken" : "";
    return `<span class="wikilink${broken}" data-target="${escAttr(target)}">${display}</span>`;
  });
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
    const broken =
      noteTitles && !noteTitles.has(target.trim().toLowerCase()) ? " wikilink-broken" : "";
    return `<span class="wikilink${broken}" data-target="${escAttr(target)}">${target}</span>`;
  });

  // 9. Markdown links [text](url) \u2014 escape the URL so a stray " can't break out
  // of the href/data-url attribute (attribute-injection guard; escAttr defined above).
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
    const safe = escAttr(url);
    return `<a href="${safe}" class="external-link" data-url="${safe}">${text}<span class="external-link-icon" contenteditable="false">\u2197</span></a>`;
  });

  // 10. Bare URLs, in prose only. The pass reads the text as written, never
  // the HTML the passes above have built: an entity is the character it
  // stands for (`&gt;` is `>`, which ends a URL; `&amp;` is `&`, which may end
  // one), and a URL inside a link's text, a code span or a wikilink is that
  // element's text, never a second link. Before this the regex ran over the
  // escaped HTML: `<https://example.com>` linked `https://example.com&gt` and
  // grew a `;` on every edit, a URL ending in `&` did the same, a URL in a
  // link's text was linked inside the anchor and read back as two links, and
  // one in a wikilink target rewrote the span's own attribute.
  s = s.replace(PROSE_OR_ELEMENT_RE, (piece) =>
    piece.startsWith("<") ? piece : autolinkProse(piece),
  );

  // 11. Tags (#tag but not # at line start which is heading)
  s = s.replace(
    /(^|[\s(])#([a-zA-Z][\w/-]*)/g,
    '$1<span class="inline-tag" data-tag="$2">#$2</span>',
  );

  // Restore backslash-escaped characters, backslash included
  s = s.replace(/\x00ESC(\d+)\x00/g, (_, i) => `\\${escapes[parseInt(i, 10)]}`);

  // 12. A newline inside block text is a soft break: one line break on screen.
  // A trailing newline gets a second <br>, the way Chromium keeps an empty
  // last line visible and reachable by the caret; the DOM→Markdown walkers
  // ignore a block's final <br>, so "a<br><br>" reads back as "a\n".
  s = s.replace(/\n/g, "<br>");
  if (s.endsWith("<br>")) s += "<br>";

  return s;
}

/**
 * Convert serialised HTML back to inline markdown. The one walker below
 * reads a parsed string (the copy, Enter-split and paste paths) and the live
 * block element (`domNodeToMarkdown`, every keystroke) alike; two walkers
 * once read the same DOM differently.
 */
export function htmlToInlineMarkdown(html) {
  if (!html) return "";

  // Fast path: no HTML tags or entities at all
  if (!/[<&]/.test(html)) return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return walkNode(doc.body);
}

/**
 * Convert a live DOM element's childNodes directly to inline markdown, with
 * no DOMParser and no innerHTML serialisation. Use this on the hot path
 * (every keystroke) where `el` is already in the document.
 */
export function domNodeToMarkdown(element) {
  if (!element) return "";
  return walkNode(element);
}

// The caret anchor placeCaret parks the caret on after a link
// (domHelpers CARET_ANCHOR): a `<span class="caret-anchor">` around one
// zero-width space. The element is what marks the space as scaffolding; a
// U+200B anywhere else is the note's own byte and is read back as written.
const CARET_ANCHOR_RE = /\u200B/g;

/**
 * The DOM → Markdown walk. Text is read verbatim. A formatting element wraps
 * whatever it holds, a space included (`<em> </em>` is `* *`, the bytes the
 * renderer made it from); only one holding nothing at all, the residue of
 * toggling a format off, is dropped. A link is the bare URL only when it is
 * the editor's own autolink (`bare-url`) and its text still is its URL, so
 * an explicit `[url](url)` from the file stays one. The ↗ icon is its own
 * `contenteditable="false"` span and is skipped as that; a ↗ in a link's
 * text is text.
 */
function walkNode(node) {
  let result = "";
  for (const child of node.childNodes) result += nodeToMarkdown(child, result);
  return result;
}

/**
 * The Markdown one child node adds to the walk, given `before`, the Markdown
 * of its preceding siblings (a `<div>` line only needs a newline when the
 * text so far does not end in one). Exported so the typed-formatting paint
 * can find an element by the same reading the walker gives it.
 */
export function nodeToMarkdown(child, before = "") {
  if (child.nodeType === Node.TEXT_NODE) return child.textContent;
  if (child.nodeType !== Node.ELEMENT_NODE) return "";
  const tag = child.nodeName;
  const inner = walkNode(child);

  if (tag === "STRONG" || tag === "B") return inner ? `**${inner}**` : "";
  if (tag === "EM" || tag === "I") return inner ? `*${inner}*` : "";
  if (tag === "CODE") return inner ? `\`${inner}\`` : "";
  if (tag === "DEL" || tag === "S") return inner ? `~~${inner}~~` : "";
  if (tag === "MARK") return inner ? `==${inner}==` : "";
  if (tag === "A") {
    const href = child.getAttribute("href") || "";
    if (child.classList.contains("bare-url") && inner === href) return inner;
    return `[${inner}](${href})`;
  }
  if (tag === "SPAN") {
    // External link icon — decorative, skip
    if (child.classList.contains("external-link-icon")) return "";
    if (child.classList.contains(CARET_ANCHOR_CLASS)) {
      // The anchor's zero-width space is scaffolding; text typed on it is prose.
      return inner.replace(CARET_ANCHOR_RE, "");
    }
    if (child.classList.contains("wikilink")) {
      const target = child.getAttribute("data-target") || inner;
      return target === inner ? `[[${inner}]]` : `[[${target}|${inner}]]`;
    }
    // Tag spans and anything else: the text, which for a tag already has its #.
    return inner;
  }
  if (tag === "BR") {
    // Ignore <br> at end of block (browser artifact)
    // Only add newline if it's not the last child
    return child.nextSibling ? "\n" : "";
  }
  if (tag === "DIV") {
    // Browser sometimes wraps lines in <div>; treat as line break
    if (!inner) return "";
    return before && !before.endsWith("\n") ? `\n${inner}` : inner;
  }
  // Unknown element — recurse children, strip the tag
  return inner;
}

const ALLOWED_TAGS = new Set([
  "STRONG",
  "EM",
  "CODE",
  "A",
  "B",
  "I",
  "BR",
  "DEL",
  "S",
  "MARK",
  "SPAN",
]);

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

/**
 * Sanitize HTML: strip all tags except formatting tags.
 * Normalizes <b> → <strong>, <i> → <em>.
 * Strips empty formatting tags.
 * Block elements (a rich paste's paragraphs) are unwrapped to a line break
 * between them; the result is always inline content, never a wrapper element
 * (a returned `<div>` once landed inside `<strong>` and split the line).
 */
export function sanitizeInlineHtml(html) {
  if (!html) return "";
  const container = document.createElement("div");
  container.appendChild(sanitizeInlineFragment(html));
  return container.innerHTML;
}

/**
 * `sanitizeInlineHtml` as nodes, for inserting into the live DOM. The paste
 * handler inserts this itself rather than through `execCommand("insertHTML")`,
 * which rewrote the space beside the insertion into a non-breaking space
 * that reached the file as U+00A0.
 */
export function sanitizeInlineFragment(html) {
  const frag = document.createDocumentFragment();
  if (!html) return frag;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  sanitizeInto(frag, doc.body, false);
  return frag;
}

/**
 * Append the sanitised children of `sourceNode` to `target`. Inside a caret
 * anchor (`inAnchor`) the zero-width space is scaffolding and is dropped, so a
 * copy or an Enter-split never carries it into Markdown.
 */
function sanitizeInto(target, sourceNode, inAnchor) {
  for (const child of sourceNode.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = inAnchor ? child.textContent.replace(CARET_ANCHOR_RE, "") : child.textContent;
      if (text) target.appendChild(document.createTextNode(text));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.nodeName;

      if (tag === "BR") {
        target.appendChild(document.createElement("br"));
      } else if (tag === "SPAN" && child.classList.contains(CARET_ANCHOR_CLASS)) {
        sanitizeInto(target, child, true);
      } else if (ALLOWED_TAGS.has(tag)) {
        // Normalize <b> → <strong>, <i> → <em>, <s> → <del>
        let newTag = tag;
        if (tag === "B") newTag = "STRONG";
        if (tag === "I") newTag = "EM";
        if (tag === "S") newTag = "DEL";

        const el = document.createElement(newTag);

        // Copy href, class, data-url for links
        if (tag === "A" && child.getAttribute("href")) {
          el.setAttribute("href", child.getAttribute("href"));
          const cls = child.getAttribute("class");
          if (cls) el.setAttribute("class", cls);
          const dataUrl = child.getAttribute("data-url");
          if (dataUrl) el.setAttribute("data-url", dataUrl);
        }

        // Copy class + data attrs for SPAN (wikilinks, tags, link icons)
        if (tag === "SPAN") {
          const cls = child.getAttribute("class") || "";
          if (cls === "wikilink" || cls.startsWith("wikilink") || cls === "inline-tag") {
            el.setAttribute("class", cls);
            if (cls.startsWith("wikilink")) {
              const target = child.getAttribute("data-target");
              if (target) el.setAttribute("data-target", target);
            }
          } else if (cls === "external-link-icon") {
            el.setAttribute("class", cls);
            el.setAttribute("contenteditable", "false");
          }
        }

        sanitizeInto(el, child, inAnchor);

        // An empty formatting tag (leftover from toggling off) is nothing;
        // one holding only a space wraps that space, as the walker writes it
        // (`<em> </em>` is the file's own `* *` on the Enter-split and copy paths).
        if (el.textContent === "") continue;
        target.appendChild(el);
      } else if (BLOCK_TAGS.has(tag)) {
        // Unwrap block elements, but preserve separation as line breaks
        const inner = document.createDocumentFragment();
        sanitizeInto(inner, child, inAnchor);
        if (inner.textContent.trim()) {
          if (target.childNodes.length > 0 && target.lastChild?.nodeName !== "BR") {
            target.appendChild(document.createElement("br"));
          }
          target.appendChild(inner);
        }
      } else {
        // Unknown tag: recurse children only (strip the tag)
        sanitizeInto(target, child, inAnchor);
      }
    }
  }
}

/**
 * Strip all markdown formatting tokens, returning plain text.
 * Used for accurate word count.
 */
export function stripMarkdownFormatting(md) {
  if (!md) return "";
  let s = md;
  // Remove wikilinks: [[target|display]] → display, [[target]] → target
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // Remove markdown links: [text](url) → text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Remove bold+italic (***text*** → text)
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  // Remove bold (**text** → text)
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  // Remove italic (*text* → text)
  s = s.replace(/\*(.+?)\*/g, "$1");
  // Remove inline code (`text` → text)
  s = s.replace(/`([^`]+)`/g, "$1");
  // Remove strikethrough (~~text~~ → text)
  s = s.replace(/~~(.+?)~~/g, "$1");
  // Remove highlight (==text== → text)
  s = s.replace(/==(.+?)==/g, "$1");
  return s;
}
