import { supabase } from "../lib/supabase";

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function callFunction(name, body) {
  const token = await getAccessToken();
  if (!token) throw new Error("Not authenticated");

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Sync failed (${res.status})`);
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
