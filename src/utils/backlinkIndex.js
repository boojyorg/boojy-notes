// @ts-check
// Build a backlink index from all notes.
// Returns a Map: titleLower → [{ sourceNoteId, sourceTitle, snippet }]

/** @typedef {import("../types.d.ts").BacklinkEntry} BacklinkEntry */

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

/**
 * @param {Record<string, any>} noteData
 * @returns {Map<string, BacklinkEntry[]>}
 */
export function buildBacklinkIndex(noteData) {
  /** @type {Map<string, BacklinkEntry[]>} */
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
        const existing = /** @type {Array} */ (index.get(target));
        // Avoid duplicate entries from same note
        if (!existing.some((e) => e.sourceNoteId === noteId)) {
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

/**
 * @param {Map<string, BacklinkEntry[]>} index
 * @param {string | null | undefined} noteTitle
 * @returns {BacklinkEntry[]}
 */
export function getBacklinksForNote(index, noteTitle) {
  if (!noteTitle) return [];
  const key = noteTitle.trim().toLowerCase();
  return index.get(key) || [];
}
