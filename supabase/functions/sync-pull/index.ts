import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId, createAdminClient } from "../_shared/supabase-admin.ts";
import { getObject } from "../_shared/r2.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { since } = await req.json().catch(() => ({ since: null }));

    // Query metadata for user's notes
    const supabase = createAdminClient();
    let query = supabase
      .from("notes_metadata")
      .select("note_id, title, content_hash, size_bytes, updated_at, deleted")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });

    // If `since` is provided, only get notes updated after that time
    if (since) {
      query = query.gt("updated_at", since);
    }

    const { data: notes, error: dbError } = await query;
    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    // Fetch content from R2 for non-deleted notes
    const results = await Promise.all(
      (notes || []).map(async (note) => {
        if (note.deleted) {
          return { ...note, content: null };
        }
        const r2Key = `notes/${userId}/${note.note_id}.json`;
        const content = await getObject(r2Key);
        return { ...note, content };
      }),
    );

    return new Response(
      JSON.stringify({ notes: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
