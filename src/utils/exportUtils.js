import { stripMarkdownFormatting } from "./inlineFormatting";

/**
 * Convert inline markdown to simple HTML (for export, without interactive wikilink elements).
 */
function inlineToHtml(md) {
  if (!md) return "";
  let s = md;
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
  s = s.replace(/==(.+?)==/g, "<mark>$1</mark>");
  // Wikilinks → plain text
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // Markdown links → HTML links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Bare URLs
  s = s.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2">$2</a>');
  return s;
}

/**
 * Convert block array to standalone HTML string for PDF export.
 */
export function blocksToHtml(blocks, title) {
  const parts = [];
  if (title) {
    parts.push(`<h1>${title.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</h1>`);
  }

  let inList = null; // 'ul' | 'ol' | null
  let inCheckList = false;

  for (const block of blocks) {
    // Close open list if block type doesn't match
    if (inList === "ul" && block.type !== "bullet") {
      parts.push("</ul>");
      inList = null;
    }
    if (inList === "ol" && block.type !== "numbered") {
      parts.push("</ol>");
      inList = null;
    }
    if (inCheckList && block.type !== "checkbox") {
      parts.push("</ul>");
      inCheckList = false;
    }

    switch (block.type) {
      case "h1":
        parts.push(`<h1>${inlineToHtml(block.text)}</h1>`);
        break;
      case "h2":
        parts.push(`<h2>${inlineToHtml(block.text)}</h2>`);
        break;
      case "h3":
        parts.push(`<h3>${inlineToHtml(block.text)}</h3>`);
        break;
      case "p":
        parts.push(`<p>${inlineToHtml(block.text) || "&nbsp;"}</p>`);
        break;
      case "bullet":
        if (inList !== "ul") {
          parts.push("<ul>");
          inList = "ul";
        }
        parts.push(`<li>${inlineToHtml(block.text)}</li>`);
        break;
      case "numbered":
        if (inList !== "ol") {
          parts.push("<ol>");
          inList = "ol";
        }
        parts.push(`<li>${inlineToHtml(block.text)}</li>`);
        break;
      case "checkbox":
        if (!inCheckList) {
          parts.push('<ul style="list-style:none;padding-left:0">');
          inCheckList = true;
        }
        parts.push(`<li>${block.checked ? "\u2611" : "\u2610"} ${inlineToHtml(block.text)}</li>`);
        break;
      case "code":
        parts.push(
          `<pre><code>${(block.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`,
        );
        break;
      case "table":
        if (block.rows && block.rows.length > 0) {
          const aligns = block.alignments || [];
          parts.push("<table>");
          parts.push("<thead><tr>");
          block.rows[0].forEach((cell, ci) => {
            const align = aligns[ci] ? ` style="text-align:${aligns[ci]}"` : "";
            parts.push(`<th${align}>${inlineToHtml(cell)}</th>`);
          });
          parts.push("</tr></thead>");
          parts.push("<tbody>");
          for (let r = 1; r < block.rows.length; r++) {
            parts.push("<tr>");
            block.rows[r].forEach((cell, ci) => {
              const align = aligns[ci] ? ` style="text-align:${aligns[ci]}"` : "";
              parts.push(`<td${align}>${inlineToHtml(cell)}</td>`);
            });
            parts.push("</tr>");
          }
          parts.push("</tbody></table>");
        }
        break;
      case "callout": {
        const cType = block.calloutType || "note";
        parts.push(
          `<blockquote><strong>[${cType.toUpperCase()}]${block.title ? " " + inlineToHtml(block.title) : ""}</strong>`,
        );
        if (block.text) parts.push(`<p>${inlineToHtml(block.text)}</p>`);
        parts.push("</blockquote>");
        break;
      }
      case "image":
        parts.push(
          `<img src="${block.src || ""}" alt="${(block.alt || "").replace(/"/g, "&quot;")}" />`,
        );
        break;
      case "spacer":
        parts.push("<hr>");
        break;
      default:
        if (block.text) parts.push(`<p>${inlineToHtml(block.text)}</p>`);
        break;
    }
  }

  // Close any trailing open lists
  if (inList === "ul") parts.push("</ul>");
  if (inList === "ol") parts.push("</ol>");
  if (inCheckList) parts.push("</ul>");

  return parts.join("\n");
}
