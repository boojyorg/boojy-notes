import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId, createAdminClient } from "../_shared/supabase-admin.ts";
import { deleteObject } from "../_shared/r2.ts";

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

    const { noteId } = await req.json();

    if (!noteId) {
      return new Response(JSON.stringify({ error: "noteId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete from R2
    const r2Key = `notes/${userId}/${noteId}.json`;
    await deleteObject(r2Key);

    // Mark as deleted in metadata (soft delete so other devices know)
    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("notes_metadata")
      .update({
        deleted: true,
        size_bytes: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("note_id", noteId);

    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    return new Response(
      JSON.stringify({ success: true, noteId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
