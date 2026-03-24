// Pure search functions — no React dependencies.

import { stripMarkdownFormatting } from "./inlineFormatting";

/**
 * Join all block text (stripping markdown) into one plain string.
 * Returns { plainText, blockOffsets } where blockOffsets maps
 * character positions back to block indices.
 */
export function buildPlainText(blocks) {
  if (!blocks || blocks.length === 0) return { plainText: "", blockOffsets: [] };
  const blockOffsets = []; // [{ blockIndex, blockId, start, end }]
  let offset = 0;
  const parts = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const raw =
      b.type === "callout" ? ((b.title || "") + " " + (b.text || "")).trim() : b.text || "";
    const text = stripMarkdownFormatting(raw);
    blockOffsets.push({ blockIndex: i, blockId: b.id, start: offset, end: offset + text.length });
    parts.push(text);
    offset += text.length + 1; // +1 for the space separator
  }
  return { plainText: parts.join(" "), blockOffsets };
}

/**
 * Build a search index from noteData.
 * Returns Map<noteId, IndexEntry>.
 */
export function buildSearchIndex(noteData) {
  const index = new Map();
  for (const [noteId, note] of Object.entries(noteData)) {
    index.set(noteId, createIndexEntry(noteId, note));
  }
  return index;
}

function createIndexEntry(noteId, note) {
  const title = note.title || note.content?.title || "";
  const { plainText, blockOffsets } = buildPlainText(note.content?.blocks || []);
  return {
    noteId,
    title,
    titleLower: title.toLowerCase(),
    plainText,
    plainTextLower: plainText.toLowerCase(),
    blockOffsets,
    folder: note.folder || null,
    lastModified: note.lastModified || 0,
  };
}

/**
 * Update a single entry in the index.
 */
export function updateIndexEntry(index, noteId, note) {
  index.set(noteId, createIndexEntry(noteId, note));
}

/**
 * Delete a single entry from the index.
 */
export function removeIndexEntry(index, noteId) {
  index.delete(noteId);
}

/**
 * Character-sequence fuzzy matcher.
 * Returns { match, score, type, matchStart, matchEnd } or { match: false }.
 *
 * Checks exact substring first (score 1.0), then ordered character
 * sequence (score 0.01–0.99 based on spread + consecutive bonus).
 */
export function fuzzyMatch(query, target) {
  if (!query || !target) return { match: false };
  const qLower = query.toLowerCase();
  const tLower = target.toLowerCase();

  // Exact substring match
  const exactIdx = tLower.indexOf(qLower);
  if (exactIdx !== -1) {
    return {
      match: true,
      score: 1.0,
      type: "exact",
      matchStart: exactIdx,
      matchEnd: exactIdx + qLower.length,
    };
  }

  // Fuzzy: ordered character sequence
  let qi = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let consecutive = 0;
  let maxConsecutive = 0;

  for (let ti = 0; ti < tLower.length && qi < qLower.length; ti++) {
    if (tLower[ti] === qLower[qi]) {
      if (firstMatch === -1) firstMatch = ti;
      if (lastMatch === ti - 1) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
      lastMatch = ti;
      qi++;
    }
  }

  if (qi < qLower.length) return { match: false };

  // Score based on spread and consecutive bonus
  const spread = lastMatch - firstMatch + 1;
  const spreadRatio = qLower.length / spread; // 1.0 = perfectly tight
  const consecutiveBonus = maxConsecutive / qLower.length; // 0–1
  const score = Math.min(0.99, Math.max(0.01, spreadRatio * 0.6 + consecutiveBonus * 0.39));

  return {
    match: true,
    score,
    type: "fuzzy",
    matchStart: firstMatch,
    matchEnd: lastMatch + 1,
  };
}

/**
 * Main search function. For each index entry, checks title and body
 * with different scoring boosts.
 *
 * Returns { results: [...], totalCount } sorted by score desc,
 * then lastModified desc.
 */
export function searchNotes(query, index, limit = 20) {
  if (!query || !query.trim()) return { results: [], totalCount: 0 };
  const q = query.trim();
  const qLower = q.toLowerCase();
  const singleChar = q.length === 1;
  const results = [];

  for (const entry of index.values()) {
    let bestScore = 0;
    let matchType = null;
    let matchStart = -1;
    let matchEnd = -1;
    let matchIn = null; // "title" or "body"

    // Check title — exact substring
    const titleExact = entry.titleLower.indexOf(qLower);
    if (titleExact !== -1) {
      bestScore = 1.0 + 2.0; // exact + title boost
      matchType = "exact";
      matchStart = titleExact;
      matchEnd = titleExact + qLower.length;
      matchIn = "title";
    }

    // Check title — fuzzy
    if (!matchIn) {
      const titleFuzzy = fuzzyMatch(q, entry.title);
      if (titleFuzzy.match) {
        const s = titleFuzzy.score + 1.5;
        if (s > bestScore) {
          bestScore = s;
          matchType = titleFuzzy.type;
          matchStart = titleFuzzy.matchStart;
          matchEnd = titleFuzzy.matchEnd;
          matchIn = "title";
        }
      }
    }

    // Check body (skip for single-char queries — too noisy)
    if (!singleChar) {
      // Body exact substring
      const bodyExact = entry.plainTextLower.indexOf(qLower);
      if (bodyExact !== -1) {
        const s = 1.0 + 1.0; // exact + body boost
        if (s > bestScore) {
          bestScore = s;
          matchType = "exact";
          matchStart = bodyExact;
          matchEnd = bodyExact + qLower.length;
          matchIn = "body";
        } else if (matchIn === "title") {
          // Still record body match for snippet even if title match is better
        }
      }

      // Body fuzzy
      if (matchIn !== "body" && !matchIn) {
        const bodyFuzzy = fuzzyMatch(q, entry.plainText);
        if (bodyFuzzy.match && bodyFuzzy.score >= 0.3) {
          const s = bodyFuzzy.score;
          if (s > bestScore) {
            bestScore = s;
            matchType = bodyFuzzy.type;
            matchStart = bodyFuzzy.matchStart;
            matchEnd = bodyFuzzy.matchEnd;
            matchIn = "body";
          }
        }
      }
    }

    if (bestScore > 0) {
      // For title matches, also find a body snippet if there's a body match
      let snippetMatchStart = matchIn === "body" ? matchStart : -1;
      let snippetMatchEnd = matchIn === "body" ? matchEnd : -1;
      if (matchIn === "title" && !singleChar) {
        const bodyIdx = entry.plainTextLower.indexOf(qLower);
        if (bodyIdx !== -1) {
          snippetMatchStart = bodyIdx;
          snippetMatchEnd = bodyIdx + qLower.length;
        }
      }

      results.push({
        noteId: entry.noteId,
        title: entry.title,
        folder: entry.folder,
        score: bestScore,
        matchType,
        matchIn,
        matchStart,
        matchEnd,
        snippetMatchStart,
        snippetMatchEnd,
        plainText: entry.plainText,
        blockOffsets: entry.blockOffsets,
        lastModified: entry.lastModified,
        snippet: /** @type {any} */ (null),
        matchBlockId: /** @type {any} */ (null),
      });
    }
  }

  // Sort by score desc, then lastModified desc
  results.sort((a, b) => b.score - a.score || b.lastModified - a.lastModified);

  const totalCount = results.length;
  const limited = results.slice(0, limit);

  // Add snippets to limited results
  for (const r of limited) {
    if (r.matchIn === "body") {
      r.snippet = extractSnippet(r.plainText, r.matchStart, r.matchEnd);
    } else if (r.snippetMatchStart >= 0) {
      r.snippet = extractSnippet(r.plainText, r.snippetMatchStart, r.snippetMatchEnd);
    } else {
      r.snippet = null;
    }

    // Find match block for scroll-to-match
    if (r.matchIn === "body") {
      r.matchBlockId = findMatchBlock(r.blockOffsets, r.matchStart);
    } else if (r.snippetMatchStart >= 0) {
      r.matchBlockId = findMatchBlock(r.blockOffsets, r.snippetMatchStart);
    } else {
      r.matchBlockId = null;
    }
  }

  return { results: limited, totalCount };
}

/**
 * Extract a snippet around a match.
 * Returns { text, highlightStart, highlightEnd } with ~25 char padding and ellipsis.
 */
export function extractSnippet(plainText, matchStart, matchEnd) {
  if (matchStart < 0 || !plainText) return null;
  const pad = 25;
  let start = Math.max(0, matchStart - pad);
  let end = Math.min(plainText.length, matchEnd + pad);

  // Try to break at word boundaries
  if (start > 0) {
    const spaceIdx = plainText.indexOf(" ", start);
    if (spaceIdx !== -1 && spaceIdx < matchStart) start = spaceIdx + 1;
  }
  if (end < plainText.length) {
    const spaceIdx = plainText.lastIndexOf(" ", end);
    if (spaceIdx > matchEnd) end = spaceIdx;
  }

  const prefix = start > 0 ? "..." : "";
  const suffix = end < plainText.length ? ".." : "";
  const text = prefix + plainText.slice(start, end) + suffix;
  const highlightStart = prefix.length + (matchStart - start);
  const highlightEnd = prefix.length + (matchEnd - start);

  return { text, highlightStart, highlightEnd };
}

/**
 * Find the blockId containing the match position in plain text.
 */
export function findMatchBlock(blockOffsets, matchStartInPlainText) {
  if (!blockOffsets || blockOffsets.length === 0) return null;
  for (const bo of blockOffsets) {
    if (matchStartInPlainText >= bo.start && matchStartInPlainText < bo.end) {
      return bo.blockId;
    }
  }
  // Fall back: check if it's in a gap (space between blocks)
  for (let i = 0; i < blockOffsets.length - 1; i++) {
    if (
      matchStartInPlainText >= blockOffsets[i].end &&
      matchStartInPlainText < blockOffsets[i + 1].start
    ) {
      return blockOffsets[i + 1].blockId;
    }
  }
  return blockOffsets[0]?.blockId || null;
}

/**
 * Group results by folder for display.
 * Root notes first, then folders sorted alphabetically.
 * Each result gets a _globalIndex for keyboard navigation.
 */
export function groupByFolder(results) {
  const rootResults = [];
  const folderMap = new Map(); // folderPath → results[]

  for (const r of results) {
    if (!r.folder) {
      rootResults.push(r);
    } else {
      if (!folderMap.has(r.folder)) folderMap.set(r.folder, []);
      folderMap.get(r.folder).push(r);
    }
  }

  const groups = [];
  if (rootResults.length > 0) {
    groups.push({ folderId: null, folderName: null, results: rootResults });
  }

  // Sort folders alphabetically
  const sortedFolders = [...folderMap.keys()].sort((a, b) => a.localeCompare(b));
  for (const fp of sortedFolders) {
    const folderName = fp.includes("/") ? fp.split("/").pop() : fp;
    groups.push({ folderId: fp, folderName, results: folderMap.get(fp) });
  }

  // Assign global indices
  let idx = 0;
  for (const group of groups) {
    for (const r of group.results) {
      r._globalIndex = idx++;
    }
  }

  return groups;
}
