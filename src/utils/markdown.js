// @ts-check
// Shared markdown ↔ blocks converters.
// Single source of truth used by both the renderer (browser) and Electron main process.

const CALLOUT_ALIASES = {
  note: "note",
  tip: "tip",
  hint: "tip",
  important: "tip",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  danger: "danger",
  error: "danger",
  info: "info",
  todo: "info",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  quote: "quote",
  cite: "quote",
  example: "example",
  bug: "bug",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
};

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

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
        lines.push(`${"  ".repeat(block.indent || 0)}- ${block.text || ""}`);
        break;
      case "numbered":
        lines.push(`${"  ".repeat(block.indent || 0)}1. ${block.text || ""}`);
        break;
      case "checkbox":
        lines.push(
          `${"  ".repeat(block.indent || 0)}- [${block.checked ? "x" : " "}] ${block.text || ""}`,
        );
        break;
      case "spacer":
        lines.push("---");
        break;
      case "image": {
        const src = block.src || "";
        if (block.width && block.width < 100) {
          const px = Math.round(block.width * 7);
          lines.push(`![[${src}|${px}]]`);
        } else {
          lines.push(`![[${src}]]`);
        }
        break;
      }
      case "file":
        lines.push(`![[${block.src || ""}]]`);
        break;
      case "frontmatter":
        lines.push("---");
        lines.push(block.text || "");
        lines.push("---");
        break;
      case "code": {
        const lang = block.lang || "";
        const text = block.text || "";
        const fence = text.includes("```") ? "````" : "```";
        lines.push(fence + lang);
        lines.push(text);
        lines.push(fence);
        break;
      }
      case "blockquote": {
        const bqLines = (block.text || "").split("\n");
        for (const bqLine of bqLines) {
          lines.push(`> ${bqLine}`);
        }
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
          const header = block.rows[0];
          lines.push("| " + header.join(" | ") + " |");
          const aligns = block.alignments || [];
          const sep = header.map((_, i) => {
            const a = aligns[i];
            if (a === "center") return ":---:";
            if (a === "right") return "---:";
            return "---";
          });
          lines.push("| " + sep.join(" | ") + " |");
          for (let r = 1; r < block.rows.length; r++) {
            const row = block.rows[r];
            const padded = [];
            for (let c = 0; c < header.length; c++) {
              padded.push(row[c] !== undefined ? row[c] : "");
            }
            lines.push("| " + padded.join(" | ") + " |");
          }
        }
        break;
      }
      case "embed": {
        const heading = block.heading ? "#" + block.heading : "";
        lines.push(`![[${block.target || ""}${heading}]]`);
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

    if (!line && blocks.length === 0) {
      i++;
      continue;
    }

    // 1. Frontmatter (--- at position 0 only)
    if (line === "---" && blocks.length === 0) {
      const fmLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "---") {
        fmLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "frontmatter",
        text: fmLines.join("\n"),
        meta: parseFrontmatterYaml(fmLines.join("\n")),
      });
      continue;
    }

    // 2. Code fence (supports variable-length fences: ```, ````, etc.)
    const fenceMatch = line.match(/^(`{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = line.slice(fence.length).trim();
      const closingPattern = new RegExp("^" + "`".repeat(fence.length) + "\\s*$");
      const codeLines = [];
      i++;
      while (i < lines.length && !closingPattern.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
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
      const calloutType = CALLOUT_ALIASES[rawType] || "note";
      const bodyLines = [];
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
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

    // 3b. Blockquote
    if (/^>\s/.test(line) || line === ">") {
      const bqLines = [];
      while (i < lines.length && (/^>\s/.test(lines[i]) || lines[i].trim() === ">")) {
        bqLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "blockquote",
        text: bqLines.join("\n"),
      });
      continue;
    }

    // 4. Table
    if (
      /^\|(.+)\|/.test(line) &&
      i + 1 < lines.length &&
      /^\|[\s\-:|]+\|/.test(lines[i + 1].trim())
    ) {
      const rows = [];
      rows.push(parseTableRow(line));
      const separatorCells = parseTableRow(lines[i + 1]);
      const alignments = separatorCells.map((cell) => {
        const t = cell.trim();
        if (t.startsWith(":") && t.endsWith(":")) return "center";
        if (t.endsWith(":")) return "right";
        return "left";
      });
      i++;
      i++;
      while (i < lines.length && /^\|(.+)\|/.test(lines[i].trim())) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      const colCount = rows[0].length;
      for (let r = 1; r < rows.length; r++) {
        while (rows[r].length < colCount) rows[r].push("");
        if (rows[r].length > colCount) rows[r] = rows[r].slice(0, colCount);
      }
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "table",
        rows,
        alignments,
        text: "",
      });
      continue;
    }

    // 5. Wikilink embed: ![[filename]] or ![[filename|width]]
    const wikiEmbedMatch = line.match(/^!\[\[([^\]|]+?)(?:\|(\d+))?\]\]$/);
    if (wikiEmbedMatch) {
      const filename = wikiEmbedMatch[1];
      const widthPx = wikiEmbedMatch[2] ? parseInt(wikiEmbedMatch[2], 10) : null;
      const ext =
        filename.lastIndexOf(".") !== -1
          ? filename.slice(filename.lastIndexOf(".")).toLowerCase()
          : "";
      if (IMAGE_EXTENSIONS.has(ext)) {
        const width = widthPx ? Math.round(widthPx / 7) : 100;
        blocks.push({
          id: `md-${++_parseBlockId}`,
          type: "image",
          src: filename,
          alt: filename.replace(/\.[^.]+$/, ""),
          width: Math.min(Math.max(width, 10), 100),
          text: "",
        });
      } else if (ext) {
        blocks.push({
          id: `md-${++_parseBlockId}`,
          type: "file",
          src: filename,
          filename: filename,
          size: null,
          text: "",
        });
      } else {
        const headingMatch = filename.match(/^(.+?)#(.+)$/);
        blocks.push({
          id: `md-${++_parseBlockId}`,
          type: "embed",
          target: headingMatch ? headingMatch[1].trim() : filename.trim(),
          heading: headingMatch ? headingMatch[2].trim() : null,
          text: "",
        });
      }
      i++;
      continue;
    }

    // 6. Single-line matchers
    const leadingSpaces = raw.match(/^(\s*)/)[1].length;
    const indent = Math.floor(leadingSpaces / 2);
    /** @type {{ id: string; type: string; text: string; checked?: boolean; indent?: number; src?: string; alt?: string; width?: number }} */
    let block;
    if (line === "---") {
      block = { id: `md-${++_parseBlockId}`, type: "spacer", text: "" };
    } else if (/^- \[([ xX])\] /.test(line)) {
      const checked = line[3] !== " ";
      block = { id: `md-${++_parseBlockId}`, type: "checkbox", text: line.slice(6), checked };
      if (indent > 0) block.indent = Math.min(indent, 6);
    } else if (/^\d+\.\s/.test(line)) {
      block = { id: `md-${++_parseBlockId}`, type: "numbered", text: line.replace(/^\d+\.\s/, "") };
      if (indent > 0) block.indent = Math.min(indent, 6);
    } else if (line.startsWith("- ")) {
      block = { id: `md-${++_parseBlockId}`, type: "bullet", text: line.slice(2) };
      if (indent > 0) block.indent = Math.min(indent, 6);
    } else if (line.startsWith("### ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h3", text: line.slice(4) };
    } else if (line.startsWith("## ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h2", text: line.slice(3) };
    } else if (line.startsWith("# ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h1", text: line.slice(2) };
    } else if (/^!\[([^\]]*)\]\(([^)]+)\)$/.test(line)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      block = {
        id: `md-${++_parseBlockId}`,
        type: "image",
        src: m[2],
        alt: m[1],
        width: 100,
        text: "",
      };
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

export function parseTableRow(line) {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseFrontmatterYaml(yamlStr) {
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

// Sync-specific: serialize note metadata as YAML frontmatter
export function serializeFrontmatter(note) {
  let fm = "---\n";
  fm += `title: ${(note.title || "Untitled").replace(/\n/g, " ")}\n`;
  if (note.folder) fm += `folder: ${note.folder}\n`;
  if (note.path && note.path.length > 0) fm += `path: ${note.path.join("/")}\n`;
  fm += `words: ${note.words || 0}\n`;
  fm += "---";
  return fm;
}
