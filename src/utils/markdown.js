// @ts-check
// Shared markdown ↔ blocks converters.
// Single source of truth used by both the renderer (browser) and Electron main process.

import { listLayout, readListIndents } from "./listStructure";

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
 * The leading spaces of a blockquote line (`> text`, `>` alone, or `>` and a
 * tab), or null when the raw line is not one. `>text` with no space is not a
 * quote line, as before. One predicate for both the opening test and the
 * consuming loop of the blockquote branch; see the note there.
 * @param {string} raw
 * @returns {string | null}
 */
function quoteIndent(raw) {
  const m = raw.match(/^( {0,3})>(?:\s|$)/);
  return m ? m[1] : null;
}

// ─── Paragraph structure ───
// Blocks represent Markdown structure, not source lines. A paragraph block
// holds every adjacent plain line of the source joined by "\n" (soft breaks);
// a single blank line between two paragraphs, or between a list item and a
// paragraph, is the separator conventional Markdown needs and is not a block;
// every further blank line is an empty paragraph block, a visible empty row.
// A plain line directly under a list item is a lazy continuation and belongs
// to the item, as it does to every Markdown reader. Nothing is recorded that
// the source does not say: the separator is implied by structure, so an
// untouched file serialises to the same bytes it was read from.

const isListItem = (b) => b.type === "bullet" || b.type === "numbered" || b.type === "checkbox";
/** An item with no text: `- `, `1. `, `- [ ] `, or the bare marker alone. */
const isEmptyListItem = (b) => isListItem(b) && (b.text || "") === "";
/** A blank source line: an empty paragraph block, or one holding only whitespace. */
const isBlankParagraph = (b) => b.type === "p" && (b.text || "").trim() === "";
const isTextParagraph = (b) => b.type === "p" && !isBlankParagraph(b);
/**
 * A block a following plain line would be absorbed into by a conventional
 * reader unless a blank line separates them. Quotes and callouts would absorb
 * one too, but their lines are written with a `> ` prefix, so a lazy line
 * under them cannot be stored as part of the block without changing the
 * bytes on save; it stays its own paragraph, and no separator is written.
 * An empty item absorbs nothing either: a lazy line continues the paragraph
 * inside the item, and an empty item has none, so `- ` over `foo` is an
 * empty item and then a paragraph to every reader.
 */
const absorbsFollowingLine = (b) => isTextParagraph(b) || (isListItem(b) && !isEmptyListItem(b));
/**
 * A block that needs the single separator blank after an absorbing block: a
 * text paragraph, or a divider. Without the blank a reader folds the paragraph
 * into the block above, and takes `---` under a paragraph for a setext heading
 * underline: `hello` / `---` is a heading called "hello" and no divider at all.
 */
const takesSeparator = (b) => isTextParagraph(b) || b.type === "spacer";

/**
 * From one block per source line to one block per structure: merge adjacent
 * plain lines into a paragraph, attach a lazy continuation to its list item,
 * and drop the single separator blank between an absorbing block and the
 * paragraph or divider after it. Extra blanks stay, as empty paragraph blocks.
 */
function structureParagraphs(lineBlocks) {
  const merged = [];
  for (const b of lineBlocks) {
    const prev = merged[merged.length - 1];
    if (isTextParagraph(b) && prev && absorbsFollowingLine(prev)) {
      prev.text = `${prev.text}\n${b.text}`;
      continue;
    }
    merged.push(b);
  }
  const out = [];
  for (let i = 0; i < merged.length; i++) {
    const b = merged[i];
    const prev = out[out.length - 1];
    if (isBlankParagraph(b) && prev && absorbsFollowingLine(prev)) {
      let j = i;
      while (j < merged.length && isBlankParagraph(merged[j])) j++;
      // The first blank of the run is the separator; keep the rest. Only a run
      // of exactly empty lines has one: a whitespace-only line is a blank line
      // to a reader too, but its bytes are the file's own, so such a run is
      // kept literally, every line a row, and the serializer writes no
      // separator in front of it. The two rules mirror each other on the run.
      const literalRun = merged.slice(i, j).some((r) => (r.text || "") !== "");
      if (j < merged.length && takesSeparator(merged[j]) && !literalRun) {
        for (let k = i + 1; k < j; k++) out.push(merged[k]);
        i = j - 1;
        continue;
      }
    }
    out.push(b);
  }
  return out;
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

/**
 * A marker line's text with the space after the marker: `- text`, `# text`,
 * `- ` for an empty item the app made. A file written elsewhere may hold the
 * bare marker (`-`, `1.`, `#`) with no space; that is read as the same empty
 * block with `bare` set, and written back without the space until text is
 * typed, so the file's bytes are its own.
 */
const afterMarker = (block, text = block.text || "") => (block.bare && !text ? "" : ` ${text}`);

// ─── What the serializer writes, its parser reads back as the same block ───
// A paragraph or list item holds soft breaks (Shift+Enter, a multi-line
// paste), so its text can hold a line that, written as it is, every reader
// including this parser takes for the start of another block: `foo\n# bar`
// is a paragraph and a heading, `foo\n- bar` a paragraph and a list,
// `foo\n---` a setext heading, a soft-broken fence swallows the rest of the
// note. The user wrote one block; the file must mean one block. Such a line
// is written with its marker's first punctuation character backslash-escaped
// (`\# bar`, `\- bar`, `1\. two`, `\---`), the CommonMark escape every
// reader renders as the character itself. The parser is the judge of which
// lines need it, so a line it reads as text (`#### four`, `1) x`, an already
// escaped `\# x`) is written as it is, and a file that holds `foo\n# bar`
// is read as the paragraph and heading it means and written back unchanged.
// A heading has no soft break in its syntax, so a newline in one (a paste)
// is written as a space, as a callout title's is.

/** A line that could open a block: the cheap test before the parser is asked. */
const MARKER_START = /^[ \t]*[-*+#>`~|!\d]/;
/** The first ASCII punctuation character of a line, where the escape goes. */
const FIRST_PUNCTUATION = /[!-/:-@[-`{-~]/;

/**
 * `text` with each line from `fromLine` on that the parser would read as the
 * start of another block escaped so it reads as this block's text.
 * @param {string} text
 * @param {number} fromLine
 */
function readsBackAsText(text, fromLine) {
  const lines = text.split("\n");
  for (let i = fromLine; i < lines.length; i++) {
    if (!MARKER_START.test(lines[i])) continue;
    const [first] = markdownToBlocks(lines.slice(i).join("\n"));
    if (first.type !== "p") lines[i] = lines[i].replace(FIRST_PUNCTUATION, "\\$&");
  }
  return lines.join("\n");
}
/** A paragraph's every line reads as text. */
const paragraphText = (block) => readsBackAsText(block.text || "", 0);
/** A list item's first line follows its marker; its continuation lines read as text. */
const itemText = (block) => readsBackAsText(block.text || "", 1);
/** A heading is one line: a newline in its text is written as a space. */
const headingText = (block) => (block.text || "").replace(/\n/g, " ");

// A separate closing marker keeps a literal final hash run inside the heading
// text, without inserting escapes into the text the editor shows.
const headingSuffix = (text) => (/(?:^|[ \t])#+$/.test(text) ? " #" : "");

/** The app's default fence; imported spelling is retained separately when different. */
function defaultCodeFence(text) {
  const runs = text.match(/`{3,}/g);
  const longestRun = runs ? Math.max(...runs.map((run) => run.length)) : 0;
  return "`".repeat(Math.max(3, longestRun + 1));
}

export function blocksToMarkdown(blocks) {
  const lines = [];
  // Where each block's lines end, so the paragraph separator can be written
  // directly after the block it terminates, ahead of any empty rows between.
  const endOfBlock = [];
  const listPositions = listLayout(blocks);
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (takesSeparator(block)) {
      // A paragraph or divider after a paragraph or a list item needs one blank
      // line, or a conventional reader folds the paragraph into the block above
      // and reads the divider as a heading underline. The blank goes right
      // after that block; empty rows between them follow it.
      let j = i - 1;
      let literalRun = false;
      while (j >= 0 && isBlankParagraph(blocks[j])) {
        if ((blocks[j].text || "") !== "") literalRun = true;
        j--;
      }
      if (j >= 0 && absorbsFollowingLine(blocks[j]) && !literalRun) {
        lines.splice(endOfBlock[j], 0, "");
      }
    }
    switch (block.type) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const marker = "#".repeat(Number(block.type.slice(1)));
        const text = headingText(block);
        const source = block.headingSource;
        const authoredSuffix = source?.suffix || "";
        const suffix =
          (/[ \t]#+[ \t]*$/.test(authoredSuffix) ? "" : headingSuffix(text)) + authoredSuffix;
        lines.push(
          source
            ? source.indent + marker + (source.gap || (text ? " " : "")) + text + suffix
            : marker + afterMarker(block, text) + suffix,
        );
        break;
      }
      case "bullet":
        lines.push(
          `${listPositions[i]?.prefix}${block.marker || "-"}${afterMarker(block, itemText(block))}`,
        );
        break;
      case "numbered":
        lines.push(
          `${listPositions[i]?.prefix}${block.numRaw ?? block.num ?? listPositions[i]?.number}.${afterMarker(block, itemText(block))}`,
        );
        break;
      case "checkbox":
        lines.push(
          `${listPositions[i]?.prefix}- [${block.checked ? "x" : " "}]${afterMarker(block, itemText(block))}`,
        );
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
        const source = block.fenceSource;
        const opening = source?.open.match(/^(\s*)(`{3,}|~{3,})(.*)$/s);
        if (opening) {
          const char = opening[2][0];
          // Only a closing-looking line can end an imported fence. Grow it
          // if an intentional content edit adds one; keep its character and
          // every other part of the authored boundary unchanged.
          const closingLine = new RegExp(`^\\s*(${char}{3,})\\s*$`);
          const longest = text
            .split("\n")
            .reduce(
              (length, line) => Math.max(length, line.match(closingLine)?.[1].length || 0),
              0,
            );
          const fence = char.repeat(Math.max(opening[2].length, longest + 1));
          const info = opening[3].trim() === lang ? opening[3] : lang;
          lines.push(opening[1] + fence + info);
          if (text || !source.empty) lines.push(text);
          if (source.close !== null) {
            lines.push(
              source.close.replace(new RegExp(`${char}{3,}`), (old) =>
                char.repeat(Math.max(old.length, fence.length)),
              ),
            );
          } else if (i < blocks.length - 1) {
            // Adding a block after an unclosed fence intentionally ends it;
            // otherwise a reopen would swallow that new block as code.
            lines.push(fence);
          }
        } else {
          const fence = defaultCodeFence(text);
          lines.push(fence + lang);
          lines.push(text);
          lines.push(fence);
        }
        break;
      }
      case "blockquote": {
        const bqLines = (block.text || "").split("\n");
        const bqIndent = block.indentStr || "";
        for (const bqLine of bqLines) {
          lines.push(`${bqIndent}> ${bqLine}`);
        }
        break;
      }
      case "callout": {
        const cType = block.calloutTypeRaw || block.calloutType || "note";
        const fold = block.calloutFold || "";
        // The title is the rest of the marker line: a newline in it would
        // end the callout, so one is written as a space.
        const title = (block.title || "").replace(/\n/g, " ");
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
          // parse splits the cell apart (content-destroying). A row is one
          // line: a newline inside a cell (Shift+Enter, a multi-line paste)
          // is written as `<br>`, the line break GitHub and Obsidian read in
          // a cell; written raw it broke the row and every row below it into
          // a paragraph (review 2026-09-07, §3.1). parseTableRow maps that
          // exact form back, so the bytes round-trip.
          const esc = (cell) => cell.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
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
          // Each body row is written with its own cells, one more or one fewer
          // than the header included; padding or trimming a row to the header
          // here is what used to drop a wide row's extra cells on every save.
          for (let r = 1; r < block.rows.length; r++) {
            const row = block.rows[r].length > 0 ? block.rows[r] : [""];
            lines.push("| " + row.map((cell) => esc(cell ?? "")).join(" | ") + " |");
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
        lines.push(paragraphText(block));
        break;
    }
    endOfBlock[i] = lines.length;
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

    // 2. Fenced code: matching character, closing run at least as long as
    // the opener. Everything between the boundaries stays literal text.
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = line.slice(fence.length).trim();
      const closingPattern = new RegExp(`^${fence[0]}{${fence.length},}\\s*$`);
      const codeLines = [];
      i++;
      while (i < lines.length && !closingPattern.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      const close = i < lines.length ? lines[i++] : null;
      const text = codeLines.join("\n");
      const canonicalFence = defaultCodeFence(text);
      const source = raw !== canonicalFence + lang || close !== canonicalFence || !codeLines.length;
      blocks.push({
        id: `md-${++_parseBlockId}`,
        type: "code",
        lang: lang,
        text,
        ...(source
          ? { fenceSource: { open: raw, close, ...(!codeLines.length ? { empty: true } : {}) } }
          : {}),
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

    // 3b. Blockquote. CommonMark allows up to three spaces before the marker
    // (four is an indented code line, kept as a paragraph like any other). The
    // opening test and the consuming loop share one predicate on the raw line,
    // so the loop always advances: testing the trimmed line here and the raw
    // line below consumed nothing on `  > quote` and never moved on. The
    // indent is kept on the block (indentStr, as list items keep theirs) so
    // the file's bytes survive a save; a change of indent starts a new block
    // for the same reason.
    const bqIndent = quoteIndent(raw);
    if (bqIndent !== null) {
      const bqLines = [];
      while (i < lines.length && quoteIndent(lines[i]) === bqIndent) {
        bqLines.push(lines[i].slice(bqIndent.length).replace(/^>\s?/, ""));
        i++;
      }
      /** @type {{ id: string; type: string; text: string; indentStr?: string }} */
      const bq = { id: `md-${++_parseBlockId}`, type: "blockquote", text: bqLines.join("\n") };
      if (bqIndent) bq.indentStr = bqIndent;
      blocks.push(bq);
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
      // The separator row follows the header's width; every other row keeps
      // exactly the cells its line holds. A row wider than the header used to
      // be sliced to it and a shorter one padded, so the extra cells were gone
      // on the next save and short rows were rewritten. The grid on screen is
      // the widest row wide (utils/tableShape.ts); the file is never
      // rectangularised by reading it.
      const colCount = rows[0].length;
      while (alignments.length < colCount) alignments.push("left");
      if (alignments.length > colCount) alignments.length = colCount;
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
    // Capture the prefix before the list walk resolves depth in context:
    // numbered parents need their marker width, not a fixed two spaces.
    const leadingWs = raw.match(/^[ \t]*/)[0];
    const tabCount = (leadingWs.match(/\t/g) || []).length;
    const indent = Math.min(6, tabCount + Math.floor((leadingWs.length - tabCount) / 2));
    /** @type {{ id: string; type: string; text: string; checked?: boolean; indent?: number; indentStr?: string; marker?: string; bare?: boolean; src?: string; alt?: string; width?: number; widthPx?: number; num?: number; numRaw?: string; format?: string; headingSource?: { indent: string; gap: string; suffix: string } }} */
    let block;
    const applyListIndent = (b) => {
      if (indent > 0) b.indent = indent;
      if (leadingWs && leadingWs !== "  ".repeat(indent)) b.indentStr = leadingWs;
    };
    // The marker forms match on the trimmed line, so the marker alone is the
    // empty block (`- `, `1. `, `- [ ] `, `# ` are what the app writes for an
    // item left empty; CommonMark reads them so, and the bare `-`, `1.`, `#`
    // too). A bare marker is remembered on the block so its bytes survive.
    const markerText = (m) => {
      const text = line.slice(m[0].length);
      // Bare: nothing at all after the marker on the source line, not even the space.
      if (text === "" && raw.trimStart().length === m[0].trimEnd().length) block.bare = true;
      return text;
    };
    let m;
    if (line === "---") {
      block = { id: `md-${++_parseBlockId}`, type: "spacer", text: "" };
    } else if ((m = line.match(/^- \[([ xX])\](?: |$)/))) {
      const checked = m[1] !== " ";
      block = { id: `md-${++_parseBlockId}`, type: "checkbox", text: "", checked };
      block.text = markerText(m);
      applyListIndent(block);
    } else if ((m = line.match(/^(\d+)\.(?:\s|$)/))) {
      block = {
        id: `md-${++_parseBlockId}`,
        type: "numbered",
        text: "",
        num: parseInt(line, 10),
      };
      block.text = markerText(m);
      // Keep the number exactly as written when parseInt would reformat it
      // (leading zeros: "007." must not become "7." on save)
      if (m[1] !== String(block.num)) block.numRaw = m[1];
      applyListIndent(block);
    } else if ((m = line.match(/^[-*+](?: |$)/))) {
      // All three CommonMark bullet markers; the marker is kept only when it
      // is not the in-app default "-", so app-created bullets stay unchanged
      block = { id: `md-${++_parseBlockId}`, type: "bullet", text: "" };
      block.text = markerText(m);
      if (line[0] !== "-") block.marker = line[0];
      applyListIndent(block);
    } else if ((m = raw.match(/^( {0,3})(#{1,6})(?:([ \t]+)(.*)|$)/))) {
      let gap = m[3] || "";
      let text = m[4] || "";
      let suffix = "";
      const closing = text.match(/(?:^|[ \t]+)#+[ \t]*$|[ \t]+$/);
      if (closing) {
        suffix = closing[0];
        text = text.slice(0, closing.index);
        // In an empty closed heading, the opening gap also separates the
        // closing marker. Keep it with that marker when text is later typed.
        if (!text && suffix.startsWith("#")) {
          suffix = gap + suffix;
          gap = "";
        }
      }
      block = { id: `md-${++_parseBlockId}`, type: `h${m[2].length}`, text };
      if (!gap && !suffix && !text) block.bare = true;
      if (m[1] || suffix !== headingSuffix(text) || gap !== (block.bare ? "" : " ")) {
        block.headingSource = { indent: m[1], gap, suffix };
      }
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
  return readListIndents(structureParagraphs(blocks));
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
  // After the scan a cell can only contain `\|` if it was an escaped pipe.
  // `<br>` is the one form the serializer writes for a newline inside a cell;
  // `<br/>` and `<br />` are left as the text they are, so their bytes hold.
  return cells.map((cell) => cell.trim().replace(/\\\|/g, "|").replace(/<br>/g, "\n"));
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
    body: match[2],
  };
}
