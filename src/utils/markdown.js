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

/**
 * List indentation as written: the parsed raw prefix when the file used
 * something other than 2-space levels (tabs, odd space counts), else the
 * canonical 2 spaces per level. In-app indent changes clear `indentStr`
 * (useBlockOperations.updateBlockIndent), so it can never go stale.
 */
function listIndent(block) {
  return block.indentStr ?? "  ".repeat(block.indent || 0);
}

/**
 * The file's dominant line-ending style. Read before parsing, kept on
 * note.content.eol (desktop), re-applied by applyEol on write — so a CRLF
 * file stays CRLF instead of being silently converted (and mixed EOLs
 * inside code blocks are healed to the dominant style).
 */
export function detectEol(md) {
  const crlf = (md.match(/\r\n/g) || []).length;
  const lone = (md.match(/(?<!\r)\n/g) || []).length;
  return crlf > 0 && crlf >= lone ? "\r\n" : "\n";
}

/** Re-apply a detected EOL style to serialized (LF-only) markdown. */
export function applyEol(md, eol) {
  return eol === "\r\n" ? md.replace(/\n/g, "\r\n") : md;
}

export function blocksToMarkdown(blocks) {
  const lines = [];
  // Numbered items keep their parsed number (block.num); items created in-app
  // have none and continue sequentially from the previous item in the run.
  let numCounter = 0;
  for (const block of blocks) {
    numCounter = block.type === "numbered" ? (block.num ?? numCounter + 1) : 0;
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
        lines.push(`${listIndent(block)}${block.marker || "-"} ${block.text || ""}`);
        break;
      case "numbered":
        lines.push(`${listIndent(block)}${numCounter}. ${block.text || ""}`);
        break;
      case "checkbox":
        lines.push(`${listIndent(block)}- [${block.checked ? "x" : " "}] ${block.text || ""}`);
        break;
      case "spacer":
        lines.push("---");
        break;
      case "image": {
        const src = block.src || "";
        // widthPx is the file's own pixel value, kept when the % quantisation
        // can't reproduce it (e.g. |300 → 43% → 301). In-app resizes clear it.
        const px =
          block.widthPx ?? (block.width && block.width < 100 ? Math.round(block.width * 7) : null);
        if (block.format === "md") {
          // Standard markdown image from an external file — keep its syntax and
          // alt text; a custom width uses the Obsidian alt suffix: ![alt|350](url)
          const alt = block.alt || "";
          lines.push(px ? `![${alt}|${px}](${src})` : `![${alt}](${src})`);
        } else {
          lines.push(px ? `![[${src}|${px}]]` : `![[${src}]]`);
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
        // The fence must be longer than the longest backtick run in the content,
        // or a run of equal length would close the block early on re-parse
        const runs = text.match(/`{3,}/g);
        const longestRun = runs ? Math.max(...runs.map((r) => r.length)) : 0;
        const fence = "`".repeat(Math.max(3, longestRun + 1));
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
          // A literal pipe inside a cell must be written escaped, or the next
          // parse splits the cell apart (content-destroying)
          const esc = (cell) => cell.replace(/\|/g, "\\|");
          const header = block.rows[0];
          lines.push("| " + header.map(esc).join(" | ") + " |");
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
              padded.push(row[c] !== undefined ? esc(row[c]) : "");
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
  // Blocks are always LF-internal; the file's EOL style is handled at the
  // read/write boundary (detectEol/applyEol). Normalising up front also keeps
  // CRLF fragments out of code-block text (which used to produce mixed EOLs).
  const lines = md.replace(/\r\n/g, "\n").split(/\n/);
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();

    // Leading blank lines become empty paragraph blocks like any other blank
    // line, so they survive a save. Side effect (deliberate): `---` after
    // leading blanks is no longer treated as frontmatter — which matches
    // Obsidian/CommonMark, where frontmatter must start on line 1.

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
        if (/^>\s*\[!\w+\][+-]?\s/.test(lines[i]) || /^>\s*\[!\w+\][+-]?$/.test(lines[i])) break;
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
      // Normalize alignment array to match header column count
      while (alignments.length < colCount) alignments.push("left");
      if (alignments.length > colCount) alignments.length = colCount;
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
        const width = widthPx ? Math.min(Math.max(Math.round(widthPx / 7), 10), 100) : 100;
        const imgBlock = {
          id: `md-${++_parseBlockId}`,
          type: "image",
          src: filename,
          alt: filename.replace(/\.[^.]+$/, ""),
          width,
          text: "",
        };
        // Keep the file's exact px when serialising from width% would write a
        // different value (rounding drift) or drop the suffix (width ≥ 100%)
        if (widthPx != null && !(width < 100 && Math.round(width * 7) === widthPx)) {
          imgBlock.widthPx = widthPx;
        }
        blocks.push(imgBlock);
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
    // Indent levels: 2 spaces = 1 level, a tab = 1 level. The raw prefix is
    // kept on the block (indentStr) whenever it differs from the canonical
    // 2-space form, so tab- and odd-space-indented list items round-trip
    // byte-exact instead of being re-quantised (or dedented) on save.
    const leadingWs = raw.match(/^[ \t]*/)[0];
    const tabCount = (leadingWs.match(/\t/g) || []).length;
    const indent = Math.min(6, tabCount + Math.floor((leadingWs.length - tabCount) / 2));
    /** @type {{ id: string; type: string; text: string; checked?: boolean; indent?: number; indentStr?: string; marker?: string; src?: string; alt?: string; width?: number; widthPx?: number; num?: number; format?: string }} */
    let block;
    const applyListIndent = (b) => {
      if (indent > 0) b.indent = indent;
      if (leadingWs && leadingWs !== "  ".repeat(indent)) b.indentStr = leadingWs;
    };
    if (line === "---") {
      block = { id: `md-${++_parseBlockId}`, type: "spacer", text: "" };
    } else if (/^- \[([ xX])\] /.test(line)) {
      const checked = line[3] !== " ";
      block = { id: `md-${++_parseBlockId}`, type: "checkbox", text: line.slice(6), checked };
      applyListIndent(block);
    } else if (/^\d+\.\s/.test(line)) {
      block = {
        id: `md-${++_parseBlockId}`,
        type: "numbered",
        text: line.replace(/^\d+\.\s/, ""),
        num: parseInt(line, 10),
      };
      applyListIndent(block);
    } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("+ ")) {
      // All three CommonMark bullet markers; the marker is kept only when it
      // is not the in-app default "-", so app-created bullets stay unchanged
      block = { id: `md-${++_parseBlockId}`, type: "bullet", text: line.slice(2) };
      if (line[0] !== "-") block.marker = line[0];
      applyListIndent(block);
    } else if (line.startsWith("### ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h3", text: line.slice(4) };
    } else if (line.startsWith("## ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h2", text: line.slice(3) };
    } else if (line.startsWith("# ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h1", text: line.slice(2) };
    } else if (/^!\[([^\]]*)\]\(([^)]+)\)$/.test(line)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      // Obsidian-style width suffix in the alt: ![alt|350](url)
      let alt = m[1];
      let width = 100;
      let mdWidthPx = null;
      const widthMatch = alt.match(/^(.*)\|(\d+)$/);
      if (widthMatch) {
        alt = widthMatch[1];
        mdWidthPx = parseInt(widthMatch[2], 10);
        width = Math.min(100, Math.max(5, Math.round(mdWidthPx / 7)));
      }
      block = {
        id: `md-${++_parseBlockId}`,
        type: "image",
        src: m[2],
        alt,
        width,
        text: "",
        format: "md",
      };
      // Same rounding-drift guard as the wikilink form above
      if (mdWidthPx != null && !(width < 100 && Math.round(width * 7) === mdWidthPx)) {
        block.widthPx = mdWidthPx;
      }
    } else {
      // Preserve the line's own whitespace: leading indentation (indented code
      // blocks, HTML, hanging indents) and trailing spaces (markdown hard
      // breaks) are meaningful bytes that must survive a save. Only a CRLF
      // ending's CR is dropped — line endings are normalised on save, a known
      // separate limitation in the preservation corpus.
      block = { id: `md-${++_parseBlockId}`, type: "p", text: raw.replace(/\r$/, "") };
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
  // Split on unescaped pipes only: `\|` is a literal pipe inside a cell, and
  // `\\` escapes the backslash itself (so `\\|` is a backslash then a
  // separator). A naive split("|") deleted cell content on files using `\|`.
  const s = line.replace(/^\|/, "");
  const cells = [];
  let cur = "";
  let closedByPipe = false;
  for (let j = 0; j < s.length; j++) {
    const ch = s[j];
    if (ch === "\\" && j + 1 < s.length) {
      cur += ch + s[j + 1];
      j++;
      closedByPipe = false;
    } else if (ch === "|") {
      cells.push(cur);
      cur = "";
      closedByPipe = true;
    } else {
      cur += ch;
      closedByPipe = false;
    }
  }
  if (!(closedByPipe && cur === "")) cells.push(cur);
  // After the scan a cell can only contain `\|` if it was an escaped pipe
  return cells.map((cell) => cell.trim().replace(/\\\|/g, "|"));
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
