import { supabase } from "../lib/supabase";

async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `Sync failed: ${name}`);
  return data;
}

export async function pushNote(note) {
  const content = JSON.stringify({
    title: note.title,
    folder: note.folder || null,
    path: note.path || null,
    content: note.content,
    words: note.words || 0,
  });

  return callFunction("sync-push", {
    noteId: note.id,
    title: note.title || "Untitled",
    content,
    updatedAt: new Date().toISOString(),
  });
}

export async function pullNotes(since = null) {
  return callFunction("sync-pull", { since });
}

export async function deleteNoteRemote(noteId) {
  return callFunction("sync-delete", { noteId });
}
