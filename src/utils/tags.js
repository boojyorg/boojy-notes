const TAG_RE = /#([a-zA-Z][\w/-]*)/g;

/**
 * Extract all tags from noteData.
 * @param {Record<string, object>} noteData
 * @returns {Map<string, Set<string>>} tag → Set of noteIds
 */
export function extractAllTags(noteData) {
  const tagMap = new Map();
  for (const [noteId, note] of Object.entries(noteData)) {
    if (!note?.content?.blocks) continue;
    for (const block of note.content.blocks) {
      if (!block.text) continue;
      for (const match of block.text.matchAll(TAG_RE)) {
        const tag = match[1];
        if (!tagMap.has(tag)) tagMap.set(tag, new Set());
        tagMap.get(tag).add(noteId);
      }
    }
  }
  return tagMap;
}
