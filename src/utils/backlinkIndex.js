// Build a backlink index from all notes.
// Returns a Map: titleLower → [{ sourceNoteId, sourceTitle, snippet }]

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function buildBacklinkIndex(noteData) {
  const index = new Map(); // targetTitleLower → [{ sourceNoteId, sourceTitle, snippet }]

  for (const [noteId, note] of Object.entries(noteData)) {
    if (!note?.content?.blocks) continue;
    const sourceTitle = note.title || "Untitled";

    for (const block of note.content.blocks) {
      if (!block.text) continue;
      let match;
      WIKILINK_RE.lastIndex = 0;
      while ((match = WIKILINK_RE.exec(block.text)) !== null) {
        const target = match[1].trim().toLowerCase();
        if (!index.has(target)) index.set(target, []);
        const existing = index.get(target);
        // Avoid duplicate entries from same note
        if (!existing.some(e => e.sourceNoteId === noteId)) {
          existing.push({
            sourceNoteId: noteId,
            sourceTitle,
            snippet: block.text.slice(0, 100),
          });
        }
      }
    }
  }

  return index;
}

export function getBacklinksForNote(index, noteTitle) {
  if (!noteTitle) return [];
  const key = noteTitle.trim().toLowerCase();
  return index.get(key) || [];
}
