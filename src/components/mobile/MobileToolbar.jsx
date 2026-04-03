import { useState, useCallback } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useNoteDataActions } from "../../context/NoteDataContext";
import { useEditorContext } from "../../context/EditorContext";
import { Z } from "../../constants/zIndex";

// ── Toolbar button ──────────────────────────────────────────────────

function TBtn({ label, active, disabled, onPress, style = {}, ariaLabel }) {
  const { theme } = useTheme();
  return (
    <button
      aria-pressed={active}
      aria-label={ariaLabel || (typeof label === "string" ? label : undefined)}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault(); // keep editor focus
        if (!disabled) onPress();
      }}
      style={{
        minWidth: 32,
        height: 36,
        padding: "0 6px",
        borderRadius: 5,
        border: "none",
        cursor: disabled ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 600,
        background: active ? `${theme.ACCENT.primary}30` : "transparent",
        color: disabled
          ? `${theme.TEXT.muted}50`
          : active
            ? theme.ACCENT.primary
            : theme.TEXT.secondary,
        opacity: disabled ? 0.35 : 1,
        flexShrink: 0,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function Divider() {
  const { theme } = useTheme();
  return (
    <div
      style={{
        width: 1,
        height: 20,
        background: theme.BG.divider,
        margin: "0 4px",
        flexShrink: 0,
      }}
    />
  );
}

// ── Aa Panel (block type picker) ────────────────────────────────────

const BLOCK_TYPES = [
  { type: "p", label: "¶" },
  { type: "h1", label: "H1" },
  { type: "h2", label: "H2" },
  { type: "h3", label: "H3" },
  { type: "bullet", label: "•" },
  { type: "numbered", label: "1." },
  { type: "checkbox", label: "☐" },
  { type: "blockquote", label: ">" },
  { type: "code", label: "</>" },
  { type: "spacer", label: "─" },
  { type: "callout", label: "!" },
];

function AaPanel({ currentType, onSelect, onClose }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 12px",
        background: theme.BG.dark,
        borderTop: `1px solid ${theme.BG.divider}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{ fontSize: 11, fontWeight: 600, color: theme.TEXT.muted, letterSpacing: 0.5 }}
        >
          BLOCK TYPE
        </span>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onClose();
          }}
          style={{
            background: "none",
            border: "none",
            fontSize: 12,
            color: theme.TEXT.muted,
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          done
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {BLOCK_TYPES.map((bt) => (
          <TBtn
            key={bt.type}
            label={bt.label}
            active={currentType === bt.type}
            onPress={() => onSelect(bt.type)}
            style={{ minWidth: 36, height: 36, fontSize: bt.label.length > 2 ? 11 : 14 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── + Panel (insert menu) ───────────────────────────────────────────

const INSERT_TYPES = [
  ...BLOCK_TYPES,
  { type: "_divider", label: "" },
  { type: "image", label: "📷", insertOnly: true },
  { type: "wikilink", label: "[[", insertOnly: true },
  { type: "tag", label: "#", insertOnly: true },
  { type: "table", label: "📋", insertOnly: true },
];

function InsertPanel({ onInsert, onClose }) {
  const { theme } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "8px 12px",
        background: theme.BG.dark,
        borderTop: `1px solid ${theme.BG.divider}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span
          style={{ fontSize: 11, fontWeight: 600, color: theme.TEXT.muted, letterSpacing: 0.5 }}
        >
          INSERT
        </span>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onClose();
          }}
          style={{
            background: "none",
            border: "none",
            fontSize: 12,
            color: theme.TEXT.muted,
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          done
        </button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {INSERT_TYPES.filter((t) => t.type !== "_divider").map((bt) => (
          <TBtn
            key={bt.type}
            label={bt.label}
            onPress={() => onInsert(bt.type)}
            style={{ minWidth: 36, height: 36, fontSize: bt.label.length > 2 ? 11 : 14 }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main toolbar ────────────────────────────────────────────────────

export default function MobileToolbar({
  isVisible,
  activeNote,
  note,
  activeFormats,
  onDismiss,
  onImageInsert,
}) {
  const { theme } = useTheme();
  const { canUndo, canRedo, undo, redo } = useNoteDataActions();
  const { applyFormat, updateBlockProperty, insertBlockAfter, editorRef, blockRefs } =
    useEditorContext();
  const [panel, setPanel] = useState(null); // null | "aa" | "insert"

  // Detect current block type from cursor position
  const getCurrentBlock = useCallback(() => {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !editorRef?.current) return null;
    let el =
      sel.focusNode?.nodeType === Node.TEXT_NODE ? sel.focusNode.parentElement : sel.focusNode;
    while (el && el !== editorRef.current) {
      if (el.dataset?.blockId) {
        const blocks = note?.content?.blocks;
        if (!blocks) return null;
        const idx = blocks.findIndex((b) => b.id === el.dataset.blockId);
        if (idx === -1) return null;
        return { block: blocks[idx], index: idx };
      }
      el = el.parentElement;
    }
    return null;
  }, [editorRef, note]);

  const currentBlock = getCurrentBlock();
  const blockType = currentBlock?.block?.type || "p";
  const hasSelection = (() => {
    const sel = window.getSelection();
    return sel?.rangeCount > 0 && !sel.isCollapsed;
  })();

  // Is the current block a list-like type where indent/outdent is useful?
  const isListLike = ["bullet", "numbered", "checkbox"].includes(blockType);
  const isCodeBlock = blockType === "code";
  const isHeading = ["h1", "h2", "h3"].includes(blockType);

  // ── Handlers ──────────────────────────────────────────────────────

  const handleFormat = useCallback(
    (fmt) => {
      applyFormat(fmt);
    },
    [applyFormat],
  );

  const handleIndent = useCallback(() => {
    if (!currentBlock || !activeNote) return;
    const { block, index } = currentBlock;
    const newIndent = Math.min((block.indent || 0) + 1, 6);
    updateBlockProperty(activeNote, index, { indent: newIndent });
  }, [currentBlock, activeNote, updateBlockProperty]);

  const handleOutdent = useCallback(() => {
    if (!currentBlock || !activeNote) return;
    const { block, index } = currentBlock;
    const newIndent = Math.max((block.indent || 0) - 1, 0);
    updateBlockProperty(activeNote, index, { indent: newIndent });
  }, [currentBlock, activeNote, updateBlockProperty]);

  const handleChangeBlockType = useCallback(
    (newType) => {
      if (!currentBlock || !activeNote) return;
      const updates = { type: newType };
      if (newType === "checkbox") updates.checked = false;
      if (newType === "code") updates.lang = "javascript";
      if (newType === "callout") updates.calloutType = "note";
      updateBlockProperty(activeNote, currentBlock.index, updates);
      setPanel(null);
    },
    [currentBlock, activeNote, updateBlockProperty],
  );

  const handleInsert = useCallback(
    (type) => {
      if (!activeNote || !note) return;
      const blocks = note.content?.blocks || [];
      const insertIdx = currentBlock ? currentBlock.index : blocks.length - 1;

      if (type === "image") {
        onImageInsert?.();
        setPanel(null);
        return;
      }
      if (type === "wikilink") {
        // Type [[ to trigger wikilink menu
        document.execCommand("insertText", false, "[[");
        setPanel(null);
        return;
      }
      if (type === "tag") {
        document.execCommand("insertText", false, "#");
        setPanel(null);
        return;
      }
      if (type === "table") {
        insertBlockAfter(activeNote, insertIdx, "table", "", {});
        setPanel(null);
        return;
      }

      const opts = {};
      if (type === "code") opts.lang = "javascript";
      if (type === "callout") opts.calloutType = "note";
      insertBlockAfter(activeNote, insertIdx, type, "");
      setPanel(null);
    },
    [activeNote, note, currentBlock, insertBlockAfter, onImageInsert],
  );

  const togglePanel = useCallback((p) => setPanel((prev) => (prev === p ? null : p)), []);

  if (!isVisible) return null;

  // ── Determine Aa label ────────────────────────────────────────────
  const aaLabel = isHeading ? blockType.toUpperCase() : "Aa";

  // ── Context buttons (middle section) ──────────────────────────────
  const contextButtons = [];

  if (isCodeBlock) {
    contextButtons.push(
      <TBtn key="indent" label="⇥" onPress={handleIndent} ariaLabel="Indent" />,
      <TBtn key="outdent" label="⇤" onPress={handleOutdent} ariaLabel="Outdent" />,
    );
  } else if (hasSelection) {
    contextButtons.push(
      <TBtn
        key="b"
        label="B"
        active={activeFormats.bold}
        onPress={() => handleFormat("bold")}
        style={{ fontWeight: 700 }}
      />,
      <TBtn
        key="i"
        label="I"
        active={activeFormats.italic}
        onPress={() => handleFormat("italic")}
        style={{ fontStyle: "italic" }}
      />,
      <TBtn
        key="s"
        label={<span style={{ textDecoration: "line-through" }}>S</span>}
        active={activeFormats.strikethrough}
        onPress={() => handleFormat("strikethrough")}
      />,
      <TBtn
        key="code"
        label="`"
        active={activeFormats.code}
        onPress={() => handleFormat("code")}
        style={{ fontFamily: "monospace" }}
      />,
      <TBtn
        key="hl"
        label="=="
        active={activeFormats.highlight}
        onPress={() => handleFormat("highlight")}
        style={{ fontSize: 11 }}
      />,
      <TBtn key="link" label="[[" onPress={() => handleFormat("link")} style={{ fontSize: 11 }} />,
    );
  } else if (isListLike) {
    contextButtons.push(
      <TBtn
        key="b"
        label="B"
        active={activeFormats.bold}
        onPress={() => handleFormat("bold")}
        style={{ fontWeight: 700 }}
      />,
      <TBtn
        key="i"
        label="I"
        active={activeFormats.italic}
        onPress={() => handleFormat("italic")}
        style={{ fontStyle: "italic" }}
      />,
      <TBtn
        key="code"
        label="`"
        active={activeFormats.code}
        onPress={() => handleFormat("code")}
        style={{ fontFamily: "monospace" }}
      />,
      <TBtn key="indent" label="⇥" onPress={handleIndent} ariaLabel="Indent" />,
      <TBtn key="outdent" label="⇤" onPress={handleOutdent} ariaLabel="Outdent" />,
    );
  } else {
    // Default: paragraph, heading, blockquote
    contextButtons.push(
      <TBtn
        key="b"
        label="B"
        active={activeFormats.bold}
        onPress={() => handleFormat("bold")}
        style={{ fontWeight: 700 }}
      />,
      <TBtn
        key="i"
        label="I"
        active={activeFormats.italic}
        onPress={() => handleFormat("italic")}
        style={{ fontStyle: "italic" }}
      />,
      <TBtn
        key="code"
        label="`"
        active={activeFormats.code}
        onPress={() => handleFormat("code")}
        style={{ fontFamily: "monospace" }}
      />,
      <TBtn
        key="hl"
        label="=="
        active={activeFormats.highlight}
        onPress={() => handleFormat("highlight")}
        style={{ fontSize: 11 }}
      />,
      <TBtn key="link" label="[[" onPress={() => handleFormat("link")} style={{ fontSize: 11 }} />,
    );
  }

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Aa or Insert panel */}
      {panel === "aa" && (
        <AaPanel
          currentType={blockType}
          onSelect={handleChangeBlockType}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "insert" && <InsertPanel onInsert={handleInsert} onClose={() => setPanel(null)} />}

      {/* Main toolbar bar */}
      <div
        role="toolbar"
        aria-label="Editor toolbar"
        style={{
          height: 44,
          background: theme.BG.dark,
          borderTop: `1px solid ${theme.BG.divider}`,
          display: "flex",
          alignItems: "center",
          padding: "0 4px",
          gap: 2,
          zIndex: Z.TOOLBAR,
        }}
      >
        {/* Fixed left: undo / redo */}
        <TBtn label="↩" disabled={!canUndo} onPress={undo} ariaLabel="Undo" />
        <TBtn label="↪" disabled={!canRedo} onPress={redo} ariaLabel="Redo" />
        <Divider />

        {/* Context buttons */}
        <div style={{ flex: 1, display: "flex", gap: 2, overflow: "hidden" }}>{contextButtons}</div>

        {/* Fixed right: Aa, +, camera, dismiss */}
        <Divider />
        <TBtn
          label={aaLabel}
          active={panel === "aa"}
          onPress={() => togglePanel("aa")}
          ariaLabel="Block type"
          style={{ fontSize: 13 }}
        />
        <TBtn
          label="+"
          active={panel === "insert"}
          onPress={() => togglePanel("insert")}
          ariaLabel="Insert block"
          style={{ fontSize: 16 }}
        />
        <TBtn label="📷" onPress={() => onImageInsert?.()} ariaLabel="Insert image" />
        <TBtn
          label="▾"
          onPress={() => {
            setPanel(null);
            onDismiss();
          }}
          ariaLabel="Dismiss keyboard"
          style={{ fontSize: 12, color: theme.TEXT.muted }}
        />
      </div>
    </div>
  );
}
