import { BrowserWindow } from "electron";
import fs from "node:fs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
} from "docx";

// ─── PDF Export ───

export async function exportToPDF(htmlContent, title, savePath, options = {}) {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  const fullHtml = wrapInPrintHtml(htmlContent, title);
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fullHtml)}`);
  const pdfBuffer = await win.webContents.printToPDF({
    pageSize: options.pageSize || "A4",
    margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
    printBackground: true,
  });
  fs.writeFileSync(savePath, pdfBuffer);
  win.close();
}

function wrapInPrintHtml(body, title) {
  const escapedTitle = (title || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><title>${escapedTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; padding: 40px; color: #222; line-height: 1.6; }
    h1 { font-size: 28px; margin-bottom: 16px; } h2 { font-size: 22px; } h3 { font-size: 18px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #ddd; margin: 0; padding: 8px 16px; background: #f9f9f9; }
    img { max-width: 100%; }
    ul, ol { padding-left: 24px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    del { text-decoration: line-through; }
    mark { background: #fff3b0; padding: 1px 2px; }
  </style></head><body>${body}</body></html>`;
}

// ─── DOCX Export ───

export async function exportToDocx(blocks, title, savePath) {
  const children = [];
  children.push(new Paragraph({ text: title || "Untitled", heading: HeadingLevel.TITLE }));

  for (const block of blocks) {
    switch (block.type) {
      case "h1":
        children.push(
          new Paragraph({ children: parseInlineRuns(block.text), heading: HeadingLevel.HEADING_1 }),
        );
        break;
      case "h2":
        children.push(
          new Paragraph({ children: parseInlineRuns(block.text), heading: HeadingLevel.HEADING_2 }),
        );
        break;
      case "h3":
        children.push(
          new Paragraph({ children: parseInlineRuns(block.text), heading: HeadingLevel.HEADING_3 }),
        );
        break;
      case "p":
        children.push(new Paragraph({ children: parseInlineRuns(block.text) }));
        break;
      case "bullet":
        children.push(
          new Paragraph({ children: parseInlineRuns(block.text), bullet: { level: 0 } }),
        );
        break;
      case "numbered":
        children.push(
          new Paragraph({
            children: parseInlineRuns(block.text),
            numbering: { reference: "default-numbering", level: 0 },
          }),
        );
        break;
      case "checkbox":
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: (block.checked ? "\u2611 " : "\u2610 ") + stripMd(block.text) }),
            ],
          }),
        );
        break;
      case "code":
        children.push(
          new Paragraph({
            children: [new TextRun({ text: block.text || "", font: "Courier New", size: 20 })],
          }),
        );
        break;
      case "table":
        children.push(buildDocxTable(block));
        break;
      case "callout":
        children.push(buildDocxCallout(block));
        break;
      case "blockquote":
        children.push(
          new Paragraph({
            children: parseInlineRuns(block.text),
            indent: { left: 720 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 6, color: "999999" },
            },
          }),
        );
        break;
      case "image":
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: block.alt || block.src || "[Image]",
                italics: true,
                color: "666666",
              }),
            ],
          }),
        );
        break;
      case "file":
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `\uD83D\uDCCE ${block.filename || block.src || "[File attachment]"}`,
                color: "666666",
              }),
            ],
          }),
        );
        break;
      case "embed":
        if (block.text) {
          children.push(new Paragraph({ children: parseInlineRuns(block.text) }));
        }
        break;
      case "spacer":
        children.push(new Paragraph({ text: "" }));
        break;
      default:
        if (block.text) {
          children.push(new Paragraph({ children: parseInlineRuns(block.text) }));
        }
        break;
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "default-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [{ children }],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(savePath, buffer);
}

function parseInlineRuns(text) {
  if (!text) return [new TextRun("")];
  const runs = [];
  // Parse markdown formatting into TextRun objects
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|~~(.+?)~~|==(.+?)==)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    // Add preceding plain text
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: stripLinks(text.slice(lastIndex, match.index)) }));
    }
    if (match[2]) {
      // Bold+Italic
      runs.push(new TextRun({ text: match[2], bold: true, italics: true }));
    } else if (match[3]) {
      // Bold
      runs.push(new TextRun({ text: match[3], bold: true }));
    } else if (match[4]) {
      // Italic
      runs.push(new TextRun({ text: match[4], italics: true }));
    } else if (match[5]) {
      // Code
      runs.push(new TextRun({ text: match[5], font: "Courier New", size: 20 }));
    } else if (match[6]) {
      // Strikethrough
      runs.push(new TextRun({ text: match[6], strike: true }));
    } else if (match[7]) {
      // Highlight
      runs.push(new TextRun({ text: match[7], highlight: "yellow" }));
    }
    lastIndex = match.index + match[0].length;
  }
  // Remaining text
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: stripLinks(text.slice(lastIndex)) }));
  }
  return runs.length > 0 ? runs : [new TextRun("")];
}

function stripLinks(text) {
  // [[target|display]] -> display, [[target]] -> target
  let s = text.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  // [text](url) -> text
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  return s;
}

function stripMd(text) {
  if (!text) return "";
  let s = text;
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2");
  s = s.replace(/\[\[([^\]]+)\]\]/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  s = s.replace(/\*\*(.+?)\*\*/g, "$1");
  s = s.replace(/\*(.+?)\*/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/~~(.+?)~~/g, "$1");
  s = s.replace(/==(.+?)==/g, "$1");
  return s;
}

function buildDocxTable(block) {
  const rows = block.rows || [];
  if (rows.length === 0) return new Paragraph({ text: "" });
  const alignments = block.alignments || [];

  const tableRows = rows.map(
    (row, ri) =>
      new TableRow({
        children: row.map(
          (cell, ci) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [new TextRun({ text: stripMd(cell || ""), bold: ri === 0 })],
                  alignment:
                    alignments[ci] === "center"
                      ? AlignmentType.CENTER
                      : alignments[ci] === "right"
                        ? AlignmentType.RIGHT
                        : AlignmentType.LEFT,
                }),
              ],
              width: { size: Math.floor(100 / row.length), type: WidthType.PERCENTAGE },
            }),
        ),
      }),
  );

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function buildDocxCallout(block) {
  const prefix = block.calloutType ? `[${block.calloutType.toUpperCase()}] ` : "";
  const titleText = prefix + (block.title || "");
  const children = [new TextRun({ text: titleText, bold: true })];
  if (block.text) {
    children.push(new TextRun({ break: 1 }));
    children.push(new TextRun({ text: block.text }));
  }
  return new Paragraph({
    children,
    indent: { left: 720 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: "999999" },
    },
  });
}
