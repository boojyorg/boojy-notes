import { useState, useRef, useEffect, useCallback } from "react";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { domNodeToMarkdown } from "../utils/inlineFormatting";

export default function FindBar({
  editorRef,
  blocks,
  blockRefs,
  noteId,
  commitTextChange,
  onClose,
}) {
  const { theme } = useTheme();
  const { BG, TEXT } = theme;

  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matches, setMatches] = useState([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Find matches using CSS Custom Highlight API
  const findMatches = useCallback(
    (term) => {
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

      setMatches(ranges);
      setActiveMatchIndex(0);

      if (ranges.length > 0) {
        const highlight = new Highlight(...ranges);
        CSS.highlights.set("find-matches", highlight);
        const active = new Highlight(ranges[0]);
        CSS.highlights.set("find-active", active);
        ranges[0].startContainer.parentElement?.scrollIntoView({
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

  const handleReplace = useCallback(() => {
    if (matches.length === 0 || !searchTerm) return;
    const idx = Math.min(activeMatchIndex, matches.length - 1);
    const range = matches[idx];
    // Find which block this match is in
    const blockEl = range.startContainer.parentElement?.closest("[data-block-id]");
    if (!blockEl) return;
    const blockId = blockEl.getAttribute("data-block-id");
    const blockIndex = blocks.findIndex((b) => b.id === blockId);
    if (blockIndex === -1) return;

    const el = blockRefs.current[blockId];
    if (!el) return;

    // Read current text, replace the match
    const currentText = domNodeToMarkdown(el);
    const lowerText = currentText.toLowerCase();
    const lowerTerm = searchTerm.toLowerCase();

    // Find the nth occurrence in this block
    let count = 0;
    let charIdx = -1;
    for (let i = 0; i < matches.length; i++) {
      if (i === idx) break;
      const mBlockEl = matches[i].startContainer.parentElement?.closest("[data-block-id]");
      if (mBlockEl?.getAttribute("data-block-id") === blockId) count++;
    }
    let searchFrom = 0;
    for (let c = 0; c <= count; c++) {
      charIdx = lowerText.indexOf(lowerTerm, searchFrom);
      if (charIdx === -1) break;
      searchFrom = charIdx + 1;
    }

    if (charIdx === -1) return;

    const newText =
      currentText.slice(0, charIdx) + replaceTerm + currentText.slice(charIdx + searchTerm.length);

    commitTextChange((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blks = [...n.content.blocks];
      blks[blockIndex] = { ...blks[blockIndex], text: newText };
      n.content = { ...n.content, blocks: blks };
      next[noteId] = n;
      return next;
    });

    // Re-search after a tick
    setTimeout(() => findMatches(searchTerm), 50);
  }, [
    matches,
    activeMatchIndex,
    searchTerm,
    replaceTerm,
    blocks,
    blockRefs,
    noteId,
    commitTextChange,
    findMatches,
  ]);

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0 || !searchTerm) return;

    commitTextChange((prev) => {
      const next = { ...prev };
      const n = { ...next[noteId] };
      const blks = [...n.content.blocks];
      for (let i = 0; i < blks.length; i++) {
        if (blks[i].text && blks[i].text.toLowerCase().includes(searchTerm.toLowerCase())) {
          const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          blks[i] = { ...blks[i], text: blks[i].text.replace(regex, replaceTerm) };
        }
      }
      n.content = { ...n.content, blocks: blks };
      next[noteId] = n;
      return next;
    });

    setTimeout(() => findMatches(searchTerm), 50);
  }, [matches, searchTerm, replaceTerm, noteId, commitTextChange, findMatches]);

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
          style={{
            fontSize: 11,
            color: TEXT.muted,
            whiteSpace: "nowrap",
            minWidth: 40,
            textAlign: "center",
          }}
        >
          {matches.length > 0 ? `${activeMatchIndex + 1} of ${matches.length}` : "0 of 0"}
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
