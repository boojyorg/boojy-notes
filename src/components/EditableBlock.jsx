import { memo, useState, useRef, useLayoutEffect } from "react";
import { BG, TEXT, ACCENT } from "../constants/colors";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";

function ImageBlock({ src, alt, onDelete, accentColor }) {
  const [hovered, setHovered] = useState(false);
  const [errored, setErrored] = useState(false);

  // Resolve src — use boojy-att: protocol in Electron, raw src otherwise
  const resolvedSrc = src
    ? (src.startsWith("data:") ? src : `boojy-att://${src}`)
    : "";

  if (errored || !src) {
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          border: `1.5px dashed ${TEXT.muted}`,
          borderRadius: 6,
          padding: "24px 16px",
          textAlign: "center",
          color: TEXT.muted,
          fontSize: 13,
        }}
      >
        Image not found: {src || "(empty)"}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              position: "absolute", top: 6, right: 6,
              width: 22, height: 22, borderRadius: "50%",
              background: "rgba(0,0,0,0.7)", color: "#fff",
              border: "none", cursor: "pointer", fontSize: 14,
              display: "flex", alignItems: "center", justifyContent: "center",
              lineHeight: 1,
            }}
          >&times;</button>
        )}
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        borderRadius: 6,
        border: hovered ? `2px solid ${accentColor}` : "2px solid transparent",
        transition: "border-color 0.15s",
      }}
    >
      <img
        src={resolvedSrc}
        alt={alt || ""}
        draggable="false"
        loading="lazy"
        onError={() => setErrored(true)}
        style={{
          display: "block",
          maxWidth: "100%",
          borderRadius: 6,
        }}
      />
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 24, height: 24, borderRadius: "50%",
            background: "rgba(0,0,0,0.7)", color: "#fff",
            border: "none", cursor: "pointer", fontSize: 15,
            display: "flex", alignItems: "center", justifyContent: "center",
            lineHeight: 1,
          }}
        >&times;</button>
      )}
    </div>
  );
}

const EditableBlock = memo(function EditableBlock({ block, blockIndex, noteId, onCheckToggle, onDeleteBlock, registerRef, syncGen, accentColor, fontSize, numberedIndex }) {
  const elRef = useRef(null);

  // Set text on mount and force-resync on undo/redo (syncGen changes)
  useLayoutEffect(() => {
    if (elRef.current && block.text !== undefined) {
      if (block.text === "") {
        elRef.current.innerHTML = "<br>";
      } else {
        elRef.current.innerHTML = inlineMarkdownToHtml(block.text);
      }
    }
  }, [syncGen]); // eslint-disable-line -- only mount + undo/redo, NOT on every keystroke

  useLayoutEffect(() => {
    if (elRef.current) registerRef(block.id, elRef.current);
    return () => registerRef(block.id, null);
  }, [block.id]);

  if (block.type === "spacer") {
    return <div data-block-id={block.id} contentEditable="false" suppressContentEditableWarning style={{ padding: "8px 0", userSelect: "none" }}><hr style={{ border: "none", borderTop: `1px solid ${BG.divider}`, margin: 0 }} /></div>;
  }

  if (block.type === "image") {
    return (
      <div data-block-id={block.id} contentEditable="false" suppressContentEditableWarning
        style={{ padding: "8px 0", userSelect: "none" }}>
        <ImageBlock src={block.src} alt={block.alt} accentColor={accentColor} onDelete={() => onDeleteBlock(noteId, blockIndex)} />
      </div>
    );
  }

  if (block.type === "p") {
    return (
      <p ref={elRef} data-block-id={block.id} data-placeholder="Type / for commands..." className={blockIndex === 0 && block.text === "" ? "empty-block" : undefined} style={{
        margin: "0 0 6px", lineHeight: 1.7, color: TEXT.primary, fontSize, outline: "none",
      }} />
    );
  }

  if (block.type === "h1") {
    return (
      <h1 ref={elRef} data-block-id={block.id} style={{
        fontSize: 28, fontWeight: 700, color: TEXT.primary, margin: "8px 0 12px", lineHeight: 1.3, letterSpacing: "-0.4px", outline: "none",
      }} />
    );
  }

  if (block.type === "h2") {
    return (
      <h2 ref={elRef} data-block-id={block.id} style={{
        fontSize: 22, fontWeight: 600, color: TEXT.primary, margin: "6px 0 10px", lineHeight: 1.35, letterSpacing: "-0.2px", outline: "none",
      }} />
    );
  }

  if (block.type === "h3") {
    return (
      <h3 ref={elRef} data-block-id={block.id} style={{
        fontSize: 16.5, fontWeight: 600, color: TEXT.primary, margin: "6px 0 6px", lineHeight: 1.35, outline: "none",
      }} />
    );
  }

  if (block.type === "bullet") {
    return (
      <div data-block-id={block.id} suppressContentEditableWarning style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "2px 0", fontSize, lineHeight: 1.7 }}>
        <span contentEditable="false" suppressContentEditableWarning style={{ color: accentColor, marginTop: 6.5, flexShrink: 0, fontSize: 7, userSelect: "none" }}>{"\u25CF"}</span>
        <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
      </div>
    );
  }

  if (block.type === "numbered") {
    return (
      <div data-block-id={block.id} suppressContentEditableWarning style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "2px 0", fontSize, lineHeight: 1.7 }}>
        <span contentEditable="false" suppressContentEditableWarning style={{ color: TEXT.secondary, flexShrink: 0, fontSize, userSelect: "none", minWidth: 18, textAlign: "right" }}>
          {numberedIndex}.
        </span>
        <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
      </div>
    );
  }

  if (block.type === "checkbox") {
    return (
      <div data-block-id={block.id} suppressContentEditableWarning style={{ display: "flex", alignItems: "center", gap: 9, padding: "2.5px 0", fontSize, lineHeight: 1.6 }}>
        <div
          className="checkbox-box"
          contentEditable="false"
          suppressContentEditableWarning
          onClick={(e) => { e.stopPropagation(); onCheckToggle(noteId, blockIndex); }}
          style={{
            width: 16, height: 16, borderRadius: 3.5, flexShrink: 0, cursor: "pointer",
            border: block.checked ? `1.5px solid ${accentColor}` : `1.5px solid ${TEXT.muted}`,
            background: block.checked ? accentColor : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.15s", userSelect: "none",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: block.checked ? 1 : 0, transform: block.checked ? "scale(1)" : "scale(0.5)", transition: "opacity 0.15s, transform 0.15s" }}>
            <path d="M2 5L4.2 7.2L8 3" stroke={BG.darkest} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span ref={elRef} style={{
          color: block.checked ? TEXT.muted : TEXT.primary,
          textDecoration: block.checked ? "line-through" : "none",
          outline: "none", flex: 1, transition: "color 0.15s",
        }} />
      </div>
    );
  }

  return null;
}, (prev, next) => {
  return prev.block.id === next.block.id
    && prev.block.type === next.block.type
    && prev.block.checked === next.block.checked
    && prev.block.src === next.block.src
    && prev.block.alt === next.block.alt
    && prev.blockIndex === next.blockIndex
    && prev.syncGen === next.syncGen
    && prev.accentColor === next.accentColor
    && prev.fontSize === next.fontSize
    && prev.numberedIndex === next.numberedIndex
    && (prev.block.text === "") === (next.block.text === "");
});

export default EditableBlock;
