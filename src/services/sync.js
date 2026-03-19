import { supabase } from "../lib/supabase";
import {
  blocksToMarkdown,
  markdownToBlocks,
  parseFrontmatter,
  serializeFrontmatter,
} from "../utils/markdown.js";

export { blocksToMarkdown, markdownToBlocks, parseFrontmatter, serializeFrontmatter };

async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Check for conflict response (409)
    if (error.context && typeof error.context.json === "function") {
      try {
        const status = error.context.status;
        if (status === 409) {
          const conflictData = await error.context.json();
          return { conflict: true, ...conflictData };
        }
      } catch {
        // Fall through to normal error handling
      }
    }
    throw new Error(error.message || `Sync failed: ${name}`);
  }
  return data;
}

// ─── Sync API ───

export async function pushNote(note, expectedVersion = null) {
  const bodyMd = blocksToMarkdown(note.content?.blocks || []);
  const frontmatter = serializeFrontmatter(note);
  const content = frontmatter + "\n\n" + bodyMd;

  return callFunction("sync-push", {
    noteId: note.id,
    title: note.title || "Untitled",
    content,
    updatedAt: new Date().toISOString(),
    expectedVersion,
  });
}

export async function pullNotes(since = null) {
  return callFunction("sync-pull", { since });
}

export async function deleteNoteRemote(noteId) {
  return callFunction("sync-delete", { noteId });
}
