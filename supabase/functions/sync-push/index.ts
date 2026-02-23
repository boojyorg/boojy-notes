import "@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId, createAdminClient } from "../_shared/supabase-admin.ts";
import { putObject } from "../_shared/r2.ts";

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

    const { noteId, title, content, updatedAt } = await req.json();

    if (!noteId || content === undefined) {
      return new Response(JSON.stringify({ error: "noteId and content are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upload content to R2
    const r2Key = `notes/${userId}/${noteId}.json`;
    await putObject(r2Key, content);

    // Calculate size and content hash
    const sizeBytes = new TextEncoder().encode(content).length;
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Upsert metadata
    const supabase = createAdminClient();
    const { error: dbError } = await supabase
      .from("notes_metadata")
      .upsert(
        {
          user_id: userId,
          note_id: noteId,
          title: title || "Untitled",
          content_hash: contentHash,
          size_bytes: sizeBytes,
          r2_key: r2Key,
          updated_at: updatedAt || new Date().toISOString(),
          deleted: false,
        },
        { onConflict: "user_id,note_id" },
      );

    if (dbError) throw new Error(`Database error: ${dbError.message}`);

    return new Response(
      JSON.stringify({ success: true, noteId, sizeBytes, contentHash }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
