import { memo, useRef, useLayoutEffect } from "react";
import { BG, TEXT, ACCENT } from "../constants/colors";

const EditableBlock = memo(function EditableBlock({ block, blockIndex, noteId, onCheckToggle, registerRef, syncGen, accentColor }) {
  const elRef = useRef(null);

  // Set text on mount and force-resync on undo/redo (syncGen changes)
  useLayoutEffect(() => {
    if (elRef.current && block.text !== undefined) {
      if (block.text === "") {
        elRef.current.innerHTML = "<br>";
      } else {
        elRef.current.innerText = block.text;
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

  if (block.type === "p") {
    return (
      <p ref={elRef} data-block-id={block.id} data-placeholder="Type / for commands..." style={{
        margin: "0 0 6px", lineHeight: 1.7, color: TEXT.primary, fontSize: 14.5, outline: "none",
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
      <div data-block-id={block.id} suppressContentEditableWarning style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "2px 0", fontSize: 14.5, lineHeight: 1.7 }}>
        <span contentEditable="false" suppressContentEditableWarning style={{ color: accentColor, marginTop: 6.5, flexShrink: 0, fontSize: 7, userSelect: "none" }}>{"\u25CF"}</span>
        <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
      </div>
    );
  }

  if (block.type === "checkbox") {
    return (
      <div data-block-id={block.id} suppressContentEditableWarning style={{ display: "flex", alignItems: "center", gap: 9, padding: "2.5px 0", fontSize: 14.5, lineHeight: 1.6 }}>
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
    && prev.blockIndex === next.blockIndex
    && prev.syncGen === next.syncGen
    && prev.accentColor === next.accentColor;
});

export default EditableBlock;
