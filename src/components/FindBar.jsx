import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { isEditableBlock } from "../utils/domHelpers";
import { domNodeToMarkdown } from "../utils/inlineFormatting";

/** Put `replacement` where `range` is, on screen. */
function replaceRange(range, replacement) {
  range.deleteContents();
  if (replacement) range.insertNode(document.createTextNode(replacement));
}

/**
 * Find and replace inside the open note.
 *
 * Find walks the text nodes on screen and highlights them (the CSS Custom
 * Highlight API). Replace edits those same text nodes, in place, and the block
 * is then read back from what is on screen, exactly as a keystroke is: the
 * live DOM is what the user is looking at, and reading it back keeps state and
 * screen the same note. Before this, Replace rewrote the block's Markdown in
 * state alone, which the editor never repaints for a text-only change, so the
 * file changed, the paragraph did not, and the next keystroke in it read the
 * old text back over the replacement (review 2026-09-07, §3.3). Editing the
 * visible text also means the nth visible match is the one replaced (the
 * Markdown-index arithmetic it replaces counted a match inside a link's URL),
 * and the replacement is text, never a pattern. Only a text block is edited
 * (a table cell, a callout and a code block own their fields); a match in one
 * of those is found and highlighted but left alone by Replace.
 */
export default function FindBar({
  editorRef,
  blocks,
  blockRefs,
  noteId,
  updateBlockText,
  initialShowReplace,
  onClose,
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [showReplace, setShowReplace] = useState(!!initialShowReplace);
  const inputRef = useRef(null);

  // The find/highlight feature relies on the CSS Custom Highlight API.
  // Firefox and Safari < 17.4 lack it — surface that instead of a silent "0 of 0".
  const highlightSupported = typeof CSS !== "undefined" && !!CSS.highlights;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Find matches using CSS Custom Highlight API. `active` is the match to
  // land on, clamped: a replace keeps the user's place in the list.
  const findMatches = useCallback(
    (term, active = 0) => {
      if (typeof CSS === "undefined" || !CSS.highlights) {
        // Fallback: no highlight API
        setMatches([]);
        return;
      }
      CSS.highlights.delete("find-matches");
      CSS.highlights.delete("find-active");

      if (!term || !editorRef.current) {
        setMatches([]);
        setActiveMatchIndex(0);
        return;
      }

      const ranges = [];
      const lowerTerm = term.toLowerCase();
      const walker = document.createTreeWalker(editorRef.current, NodeFilter.SHOW_TEXT);

      while (walker.nextNode()) {
        const textNode = walker.currentNode;
        const text = textNode.textContent.toLowerCase();
        let startIdx = 0;
        while (startIdx < text.length) {
          const idx = text.indexOf(lowerTerm, startIdx);
          if (idx === -1) break;
          const range = new Range();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + term.length);
          ranges.push(range);
          startIdx = idx + 1;
        }
      }

      const idx = Math.max(0, Math.min(active, ranges.length - 1));
      setMatches(ranges);
      setActiveMatchIndex(idx);

      if (ranges.length > 0) {
        const highlight = new Highlight(...ranges);
        CSS.highlights.set("find-matches", highlight);
        CSS.highlights.set("find-active", new Highlight(ranges[idx]));
        ranges[idx].startContainer.parentElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    },
    [editorRef],
  );

  useEffect(() => {
    findMatches(searchTerm);
  }, [searchTerm, findMatches]);

  // Update active highlight when index changes
  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.highlights) return;
    if (matches.length === 0) return;
    const idx = Math.min(activeMatchIndex, matches.length - 1);
    CSS.highlights.set("find-active", new Highlight(matches[idx]));
    matches[idx].startContainer.parentElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeMatchIndex, matches]);

  // Clean up highlights on unmount
  useEffect(() => {
    return () => {
      if (typeof CSS !== "undefined" && CSS.highlights) {
        CSS.highlights.delete("find-matches");
        CSS.highlights.delete("find-active");
      }
    };
  }, []);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev + 1) % matches.length);
  }, [matches]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    setActiveMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches]);

  // The text block a match sits in, with its registered element, or null when
  // the match is inside a block that owns its own field (a table cell, a
  // callout, a code block) or one that is no longer in the note.
  const blockOf = useCallback(
    (range) => {
      const blockId = range.startContainer.parentElement
        ?.closest("[data-block-id]")
        ?.getAttribute("data-block-id");
      const blockIndex = blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1 || !isEditableBlock(blocks[blockIndex])) return null;
      const el = blockRefs.current[blockId];
      if (!el?.contains(range.startContainer)) return null;
      return { blockIndex, el };
    },
    [blocks, blockRefs],
  );

  // Read a block back from what is on screen, as a keystroke is.
  const readBack = useCallback(
    (blockIndex, el) => {
      el.normalize();
      const text = domNodeToMarkdown(el)
        .replace(/[\n\r]+$/, "")
        .replace(/^[\n\r]+/, "");
      updateBlockText(noteId, blockIndex, text);
    },
    [noteId, updateBlockText],
  );

  const handleReplace = useCallback(() => {
    if (matches.length === 0 || !searchTerm) return;
    const idx = Math.min(activeMatchIndex, matches.length - 1);
    const target = blockOf(matches[idx]);
    if (!target) return;
    replaceRange(matches[idx], replaceTerm);
    readBack(target.blockIndex, target.el);
    // The screen already holds the replacement; find again in it, staying on
    // the match that now sits where the replaced one was.
    findMatches(searchTerm, idx);
  }, [matches, activeMatchIndex, searchTerm, replaceTerm, blockOf, findMatches, readBack]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0 || !searchTerm) return;
    const touched = new Map();
    // Ranges are live: editing one adjusts the others in the same text node,
    // so document order is safe.
    for (const range of matches) {
      const target = blockOf(range);
      if (!target) continue;
      replaceRange(range, replaceTerm);
      touched.set(target.blockIndex, target.el);
    }
    for (const [blockIndex, el] of touched) readBack(blockIndex, el);
    findMatches(searchTerm);
  }, [matches, searchTerm, replaceTerm, blockOf, findMatches, readBack]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      goNext();
      return;
    }
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      goPrev();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "g" || e.key === "G") && !e.shiftKey) {
      e.preventDefault();
      goNext();
      return;
    }
    if (mod && (e.key === "g" || e.key === "G") && e.shiftKey) {
      e.preventDefault();
      goPrev();
      return;
    }
  };

  const btnStyle = {
    background: "none",
    border: "none",
    color: TEXT.secondary,
    cursor: "pointer",
    padding: "2px 6px",
    borderRadius: 3,
    fontSize: 12,
    fontFamily: "inherit",
    display: "flex",
    alignItems: "center",
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: Z.FIND_BAR,
        background: BG.elevated,
        border: `1px solid ${BG.divider}`,
        borderRadius: "0 0 0 8px",
        padding: "8px 12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        minWidth: 280,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onClick={() => setShowReplace((v) => !v)}
          style={{ ...btnStyle, fontSize: 10, padding: "2px 4px" }}
          title="Toggle replace"
        >
          {showReplace ? "\u25BC" : "\u25B6"}
        </button>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Find in note..."
          style={{
            flex: 1,
            background: theme.overlay(0.06),
            border: `1px solid ${BG.divider}`,
            borderRadius: 4,
            color: TEXT.primary,
            fontSize: 12,
            padding: "4px 8px",
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <span
          title={
            !highlightSupported
              ? "Find isn't supported in this browser (needs Chrome/Edge or Safari 17.4+)"
              : undefined
          }
          style={{
            fontSize: 11,
            color: TEXT.muted,
            whiteSpace: "nowrap",
            minWidth: 40,
            textAlign: "center",
          }}
        >
          {!highlightSupported
            ? "n/a"
            : matches.length > 0
              ? `${activeMatchIndex + 1} of ${matches.length}`
              : "0 of 0"}
        </span>
        <button onClick={goPrev} style={btnStyle} title="Previous (Shift+Enter)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 9L6 3M6 3L3 6M6 3L9 6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button onClick={goNext} style={btnStyle} title="Next (Enter)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M6 3L6 9M6 9L3 6M6 9L9 6"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button onClick={onClose} style={btnStyle} title="Close (Escape)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 3L9 9M9 3L3 9"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 24 }}>
          <input
            type="text"
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            placeholder="Replace with..."
            style={{
              flex: 1,
              background: theme.overlay(0.06),
              border: `1px solid ${BG.divider}`,
              borderRadius: 4,
              color: TEXT.primary,
              fontSize: 12,
              padding: "4px 8px",
              outline: "none",
              fontFamily: "inherit",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleReplace();
              }
            }}
          />
          <button onClick={handleReplace} style={{ ...btnStyle, fontSize: 11 }} title="Replace">
            Replace
          </button>
          <button
            onClick={handleReplaceAll}
            style={{ ...btnStyle, fontSize: 11 }}
            title="Replace All"
          >
            All
          </button>
        </div>
      )}
    </div>
  );
}
