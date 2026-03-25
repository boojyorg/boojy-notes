// Inline markdown ↔ HTML conversion utilities.
// Stores formatting as markdown tokens in block.text, renders as HTML via innerHTML.

/**
 * Convert inline markdown tokens to HTML for rendering.
 * Process order: escape HTML → code → bold+italic → bold → italic →
 *                strikethrough → highlight → wikilinks → markdown links → bare URLs → tags
 */
export function inlineMarkdownToHtml(md, noteTitles) {
  if (!md) return "";
  let s = md;

  // 1. Escape HTML entities (prevent XSS / accidental tag injection)
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 1b. Protect backslash-escaped characters (e.g., \* \~ \= \`)
  // Replace \X with a placeholder, then restore after all formatting
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

  // 9. Markdown links [text](url)
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="external-link" data-url="$2">$1<span class="external-link-icon" contenteditable="false">\u2197</span></a>',
  );

  // 10. Auto-link bare URLs (https://... not already inside an <a> tag or href)
  s = s.replace(/(^|[^"'>=])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"}>])/g, (_, pre, url) => {
    return `${pre}<a href="${url}" class="external-link bare-url" data-url="${url}">${url}<span class="external-link-icon" contenteditable="false">\u2197</span></a>`;
  });

  // 11. Tags (#tag but not # at line start which is heading)
  s = s.replace(
    /(^|[\s(])#([a-zA-Z][\w/-]*)/g,
    '$1<span class="inline-tag" data-tag="$2">#$2</span>',
  );

  // Restore backslash-escaped characters
  s = s.replace(/\x00ESC(\d+)\x00/g, (_, i) => escapes[parseInt(i, 10)]);

  return s;
}

/**
 * Convert DOM HTML back to inline markdown string.
 * Uses DOMParser to walk the tree recursively.
 */
export function htmlToInlineMarkdown(html) {
  if (!html) return "";

  // Fast path: no HTML tags or entities at all
  if (!/[<&]/.test(html)) return html;

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
      } else if (tag === "DEL" || tag === "S") {
        result += `~~${inner}~~`;
      } else if (tag === "MARK") {
        result += `==${inner}==`;
      } else if (tag === "A") {
        const href = child.getAttribute("href") || "";
        // Strip the ↗ icon character from link text for comparison
        const linkText = inner.replace(/\u2197/g, "");
        // If the link text equals the URL, just emit the bare URL
        if (linkText === href) {
          result += linkText;
        } else {
          result += `[${linkText}](${href})`;
        }
      } else if (tag === "SPAN") {
        // External link icon — decorative, skip
        if (child.classList.contains("external-link-icon")) {
          continue;
        }
        // Wikilink spans
        if (child.classList.contains("wikilink")) {
          const target = child.getAttribute("data-target") || inner;
          if (target === inner) {
            result += `[[${inner}]]`;
          } else {
            result += `[[${target}|${inner}]]`;
          }
        } else if (child.classList.contains("inline-tag")) {
          // Tag spans — just pass through the text (already has #)
          result += inner;
        } else {
          result += inner;
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
        // Normalize <b> → <strong>, <i> → <em>, <s> → <del>
        let newTag = tag;
        if (tag === "B") newTag = "STRONG";
        if (tag === "I") newTag = "EM";
        if (tag === "S") newTag = "DEL";

        if (tag === "BR") {
          frag.appendChild(document.createElement("br"));
          continue;
        }

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

        // Recurse into children
        const innerFrag = sanitizeNode(child);
        el.appendChild(innerFrag);

        // Skip empty formatting tags (leftover from toggling off)
        if (el.textContent.trim() === "" && tag !== "BR") {
          continue;
        }

        frag.appendChild(el);
      } else if (
        tag === "DIV" ||
        tag === "P" ||
        tag === "LI" ||
        tag === "H1" ||
        tag === "H2" ||
        tag === "H3" ||
        tag === "H4" ||
        tag === "H5" ||
        tag === "H6"
      ) {
        // Unwrap block elements, but preserve separation as line breaks
        const innerFrag = sanitizeNode(child);
        if (innerFrag.textContent.trim()) {
          if (frag.childNodes.length > 0 && frag.lastChild?.nodeName !== "BR") {
            frag.appendChild(document.createElement("br"));
          }
          frag.appendChild(innerFrag);
        }
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
 * Convert a live DOM element's childNodes directly to inline markdown.
 * Merges sanitizeInlineHtml + htmlToInlineMarkdown into a single walk —
 * no DOMParser, no innerHTML serialisation. Use this on the hot path
 * (every keystroke) where `el` is already in the document.
 */
export function domNodeToMarkdown(element) {
  if (!element) return "";
  return walkLiveNode(element);
}

function walkLiveNode(node) {
  let result = "";
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = child.nodeName;
      const inner = walkLiveNode(child);

      if (tag === "STRONG" || tag === "B") {
        if (inner.trim()) result += `**${inner}**`;
      } else if (tag === "EM" || tag === "I") {
        if (inner.trim()) result += `*${inner}*`;
      } else if (tag === "CODE") {
        if (inner.trim()) result += `\`${inner}\``;
      } else if (tag === "DEL" || tag === "S") {
        if (inner.trim()) result += `~~${inner}~~`;
      } else if (tag === "MARK") {
        if (inner.trim()) result += `==${inner}==`;
      } else if (tag === "A") {
        const href = child.getAttribute("href") || "";
        const linkText = inner.replace(/\u2197/g, "");
        if (linkText === href) {
          result += linkText;
        } else {
          result += `[${linkText}](${href})`;
        }
      } else if (tag === "SPAN") {
        if (child.classList.contains("external-link-icon")) {
          continue;
        }
        if (child.classList.contains("wikilink")) {
          const target = child.getAttribute("data-target") || inner;
          if (target === inner) {
            result += `[[${inner}]]`;
          } else {
            result += `[[${target}|${inner}]]`;
          }
        } else if (child.classList.contains("inline-tag")) {
          result += inner;
        } else {
          result += inner;
        }
      } else if (tag === "BR") {
        if (child.nextSibling) result += "\n";
      } else if (tag === "DIV") {
        const divContent = walkLiveNode(child);
        if (divContent) {
          if (result && !result.endsWith("\n")) result += "\n";
          result += divContent;
        }
      } else {
        result += inner;
      }
    }
  }
  return result;
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
