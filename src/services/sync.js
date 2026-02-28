import { supabase } from "../lib/supabase";

async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `Sync failed: ${name}`);
  return data;
}

// ─── Markdown ↔ Blocks converters ───

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
      case "checkbox":
        lines.push(`- [${block.checked ? "x" : " "}] ${block.text || ""}`);
        break;
      case "spacer":
        lines.push("---");
        break;
      default: // "p" or unknown
        lines.push(block.text || "");
        break;
    }
  }
  return lines.join("\n");
}

export function markdownToBlocks(md) {
  const lines = md.split(/\n/);
  const blocks = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line && blocks.length === 0) continue;

    let block;
    if (line === "---") {
      block = { id: `md-${++_parseBlockId}`, type: "spacer", text: "" };
    } else if (/^- \[([ xX])\] /.test(line)) {
      const checked = line[3] !== " ";
      block = { id: `md-${++_parseBlockId}`, type: "checkbox", text: line.slice(6), checked };
    } else if (line.startsWith("- ")) {
      block = { id: `md-${++_parseBlockId}`, type: "bullet", text: line.slice(2) };
    } else if (line.startsWith("### ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h3", text: line.slice(4) };
    } else if (line.startsWith("## ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h2", text: line.slice(3) };
    } else if (line.startsWith("# ")) {
      block = { id: `md-${++_parseBlockId}`, type: "h1", text: line.slice(2) };
    } else {
      block = { id: `md-${++_parseBlockId}`, type: "p", text: line };
    }
    blocks.push(block);
  }
  // Ensure at least one block
  if (blocks.length === 0) {
    blocks.push({ id: `md-${++_parseBlockId}`, type: "p", text: "" });
  }
  return blocks;
}

export function serializeFrontmatter(note) {
  let fm = "---\n";
  fm += `title: ${(note.title || "Untitled").replace(/\n/g, " ")}\n`;
  if (note.folder) fm += `folder: ${note.folder}\n`;
  if (note.path && note.path.length > 0) fm += `path: ${note.path.join("/")}\n`;
  fm += `words: ${note.words || 0}\n`;
  fm += "---";
  return fm;
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;

  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(": ");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 2).trim();
    meta[key] = val;
  }

  return {
    title: meta.title || "Untitled",
    folder: meta.folder || null,
    path: meta.path ? meta.path.split("/") : null,
    words: parseInt(meta.words, 10) || 0,
    body: match[2],
  };
}

// ─── Sync API ───

export async function pushNote(note) {
  const bodyMd = blocksToMarkdown(note.content?.blocks || []);
  const frontmatter = serializeFrontmatter(note);
  const content = frontmatter + "\n\n" + bodyMd;

  return callFunction("sync", {
    action: "push",
    noteId: note.id,
    title: note.title || "Untitled",
    content,
    updatedAt: new Date().toISOString(),
  });
}

export async function pullNotes(since = null) {
  return callFunction("sync", { action: "pull", since });
}

export async function deleteNoteRemote(noteId) {
  return callFunction("sync", { action: "delete", noteId });
}
