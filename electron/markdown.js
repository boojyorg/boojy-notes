// Markdown converters for Electron main process.
// Local .md files are stored as plain markdown (no frontmatter).
// parseFrontmatter() is kept for migrating old files that still have YAML frontmatter.

const CALLOUT_ALIASES = {
  note: 'note', tip: 'tip', hint: 'tip', important: 'tip',
  warning: 'warning', caution: 'warning', attention: 'warning',
  danger: 'danger', error: 'danger',
  info: 'info', todo: 'info',
  success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question',
  quote: 'quote', cite: 'quote',
  example: 'example', bug: 'bug',
  abstract: 'abstract', summary: 'abstract', tldr: 'abstract',
};

let _parseBlockId = 0;

export function blocksToMarkdown(blocks) {
  const lines = [];
  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        lines.push(`# ${block.text || ""}`);
        break;
      case "h2":
        lines.push(`## ${block.text || ""}`);
        break;
      case "h3":
        lines.push(`### ${block.text || ""}`);
        break;
      case "bullet":
        lines.push(`- ${block.text || ""}`);
        break;
      case "numbered":
        lines.push(`1. ${block.text || ""}`);
        break;
      case "checkbox":
        lines.push(`- [${block.checked ? "x" : " "}] ${block.text || ""}`);
        break;
      case "spacer":
        lines.push("---");
        break;
      case "image":
        lines.push(`![${block.alt || ""}](${block.src || ""})`);
        break;
      case "frontmatter":
        lines.push("---");
        lines.push(block.text || "");
        lines.push("---");
        break;
      case "code": {
        const lang = block.lang || "";
        lines.push("```" + lang);
        lines.push(block.text || "");
        lines.push("```");
        break;
      }
      case "callout": {
        const cType = block.calloutTypeRaw || block.calloutType || "note";
        const fold = block.calloutFold || "";
        const title = block.title || "";
        lines.push(`> [!${cType}]${fold} ${title}`.trimEnd());
        if (block.text) {
          for (const bodyLine of block.text.split("\n")) {
            lines.push(`> ${bodyLine}`);
          }
        }
        break;
      }
      case "table": {
        if (block.rows && block.rows.length > 0) {
          // Header row
          const header = block.rows[0];
          lines.push("| " + header.join(" | ") + " |");
          // Separator row
          lines.push("| " + header.map(() => "---").join(" | ") + " |");
          // Data rows
          for (let r = 1; r < block.rows.length; r++) {
            const row = block.rows[r];
            // Pad row to match header length
            const padded = [];
            for (let c = 0; c < header.length; c++) {
              padded.push(row[c] !== undefined ? row[c] : "");
            }
            lines.push("| " + padded.join(" | ") + " |");
          }
        }
        break;
      }
      default:
        lines.push(block.text || "");
        break;
    }
  }
  return lines.join("\n");
}

export function markdownToBlocks(md) {
  const lines = md.split(/\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    // Skip leading blank lines
    if (!line && blocks.length === 0) { i++; continue; }

    // 1. Frontmatter (--- at position 0 only, i.e. very first content)
    if (line === "---" && blocks.length === 0) {
      const fmLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "---") {
        fmLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ---
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "frontmatter",
        text: fmLines.join("\n"),
        meta: parseFrontmatterYaml(fmLines.join("\n")),
      });
      continue;
    }

    // 2. Code fence (``` with optional language)
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "code",
        lang: lang,
        text: codeLines.join("\n"),
      });
      continue;
    }

    // 3. Callout (> [!type] ...)
    if (/^>\s*\[!(\w+)\]/.test(line)) {
      const calloutMatch = line.match(/^>\s*\[!(\w+)\]([+-])?\s*(.*)/);
      const rawType = calloutMatch[1].toLowerCase();
      const calloutFold = calloutMatch[2] || "";
      const title = calloutMatch[3] || "";
      const calloutType = CALLOUT_ALIASES[rawType] || 'note';
      const bodyLines = [];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        // Stop if this line starts a new callout
        if (/^>\s*\[!\w+\]/.test(lines[i])) break;
        bodyLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "callout",
        calloutType,
        calloutTypeRaw: rawType,
        calloutFold,
        title,
        text: bodyLines.join("\n"),
      });
      continue;
    }

    // 4. Table (| ... | with separator row)
    if (/^\|(.+)\|/.test(line) && i + 1 < lines.length && /^\|[\s\-:|]+\|/.test(lines[i + 1].trim())) {
      const rows = [];
      // Parse header row
      rows.push(parseTableRow(line));
      i++; // skip header
      i++; // skip separator row
      // Parse data rows
      while (i < lines.length && /^\|(.+)\|/.test(lines[i].trim())) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      // Normalize column count to header length
      const colCount = rows[0].length;
      for (let r = 1; r < rows.length; r++) {
        while (rows[r].length < colCount) rows[r].push("");
        if (rows[r].length > colCount) rows[r] = rows[r].slice(0, colCount);
      }
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "table",
        rows,
        text: "",
      });
      continue;
    }

    // 5. Existing single-line matchers (unchanged)
    let block;
    if (line === "---") {
      block = { id: `md-${++_parseBlockId}`, type: "spacer", text: "" };
    } else if (/^- \[([ xX])\] /.test(line)) {
      const checked = line[3] !== " ";
      block = { id: `md-${++_parseBlockId}`, type: "checkbox", text: line.slice(6), checked };
    } else if (/^\d+\.\s/.test(line)) {
      block = { id: `md-${++_parseBlockId}`, type: "numbered", text: line.replace(/^\d+\.\s/, "") };
    } else if (line.startsWith("- ")) {
      block = { id: `md-${++_parseBlockId}`, type: "bullet", text: line.slice(2) };
    } else if (line.startsWith("### ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h3", text: line.slice(4) };
    } else if (line.startsWith("## ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h2", text: line.slice(3) };
    } else if (line.startsWith("# ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h1", text: line.slice(2) };
    } else if (/^!\[([^\]]*)\]\(([^)]+)\)$/.test(line)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      block = { id: `md-${++_parseBlockId}`, type: "image", src: m[2], alt: m[1], text: "" };
    } else {
      block = { id: `md-${++_parseBlockId}`, type: "p", text: line };
    }
    blocks.push(block);
    i++;
  }

  if (blocks.length === 0) {
    blocks.push({ id: `md-${++_parseBlockId}`, type: "p", text: "" });
  }
  return blocks;
}

function parseTableRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cell => cell.trim());
}

function parseFrontmatterYaml(yamlStr) {
  const meta = {};
  for (const line of yamlStr.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 2).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    meta[key] = val;
  }
  return meta;
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 2).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    meta[key] = val;
  }

  return {
    id: meta.id || null,
    title: meta.title || "Untitled",
    folder: meta.folder || null,
    path: meta.path ? meta.path.split("/") : null,
    words: parseInt(meta.words, 10) || 0,
    body: match[2],
  };
}
