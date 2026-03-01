// Inline markdown ↔ HTML conversion utilities.
// Stores formatting as markdown tokens in block.text, renders as HTML via innerHTML.

/**
 * Convert inline markdown tokens to HTML for rendering.
 * Process order: escape HTML → code → bold → italic → markdown links → bare URLs
 */
export function inlineMarkdownToHtml(md) {
  if (!md) return "";
  let s = md;

  // 1. Escape HTML entities (prevent XSS / accidental tag injection)
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 2. Inline code (must be first so formatting inside backticks is preserved literally)
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 3. Bold+Italic (***text***) — must come before bold and italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");

  // 4. Bold (**text**)
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 5. Italic (*text*) — single asterisks, but not inside words like file*name
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 6. Markdown links [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 7. Auto-link bare URLs (https://... not already inside an <a> tag)
  s = s.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');

  return s;
}

/**
 * Convert DOM HTML back to inline markdown string.
 * Uses DOMParser to walk the tree recursively.
 */
export function htmlToInlineMarkdown(html) {
  if (!html) return "";

  // Fast path: no HTML tags at all
  if (!/</.test(html)) return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return walkNode(doc.body);
}

function walkNode(node) {
  let result = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.nodeName;
      const inner = walkNode(child);

      if (tag === "STRONG" || tag === "B") {
        result += `**${inner}**`;
      } else if (tag === "EM" || tag === "I") {
        result += `*${inner}*`;
      } else if (tag === "CODE") {
        result += `\`${inner}\``;
      } else if (tag === "A") {
        const href = child.getAttribute("href") || "";
        // If the link text equals the URL, just emit the bare URL
        if (inner === href) {
          result += inner;
        } else {
          result += `[${inner}](${href})`;
        }
      } else if (tag === "BR") {
        // Ignore <br> at end of block (browser artifact)
        // Only add newline if it's not the last child
        if (child.nextSibling) result += "\n";
      } else if (tag === "DIV") {
        // Browser sometimes wraps lines in <div>; treat as line break
        const divContent = walkNode(child);
        if (divContent) {
          if (result && !result.endsWith("\n")) result += "\n";
          result += divContent;
        }
      } else {
        // Unknown element — recurse children, strip the tag
        result += inner;
      }
    }
  }
  return result;
}

const ALLOWED_TAGS = new Set(["STRONG", "EM", "CODE", "A", "B", "I", "BR"]);

/**
 * Sanitize HTML: strip all tags except formatting tags.
 * Normalizes <b> → <strong>, <i> → <em>.
 * Strips empty formatting tags.
 */
export function sanitizeInlineHtml(html) {
  if (!html) return "";

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const cleaned = sanitizeNode(doc.body);
  return cleaned.innerHTML;
}

function sanitizeNode(sourceNode) {
  const frag = document.createDocumentFragment();

  for (const child of sourceNode.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      frag.appendChild(document.createTextNode(child.textContent));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.nodeName;

      if (ALLOWED_TAGS.has(tag)) {
        // Normalize <b> → <strong>, <i> → <em>
        let newTag = tag;
        if (tag === "B") newTag = "STRONG";
        if (tag === "I") newTag = "EM";

        if (tag === "BR") {
          frag.appendChild(document.createElement("br"));
          continue;
        }

        const el = document.createElement(newTag);

        // Copy href for links
        if (tag === "A" && child.getAttribute("href")) {
          el.setAttribute("href", child.getAttribute("href"));
        }

        // Recurse into children
        const innerFrag = sanitizeNode(child);
        el.appendChild(innerFrag);

        // Skip empty formatting tags (leftover from toggling off)
        if (el.textContent.trim() === "" && tag !== "BR") {
          continue;
        }

        frag.appendChild(el);
      } else if (tag === "DIV" || tag === "P" || tag === "SPAN") {
        // Unwrap block/span elements, keep content
        const innerFrag = sanitizeNode(child);
        // Add line break before block elements if needed
        if ((tag === "DIV" || tag === "P") && frag.childNodes.length > 0) {
          // Don't add <br> — just flatten. The block structure handles line separation.
        }
        frag.appendChild(innerFrag);
      } else {
        // Unknown tag: recurse children only (strip the tag)
        const innerFrag = sanitizeNode(child);
        frag.appendChild(innerFrag);
      }
    }
  }

  // Wrap in a container to get innerHTML
  const container = document.createElement("div");
  container.appendChild(frag);
  return container;
}

/**
 * Strip all markdown formatting tokens, returning plain text.
 * Used for accurate word count.
 */
export function stripMarkdownFormatting(md) {
  if (!md) return "";
  let s = md;
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
  return s;
}
