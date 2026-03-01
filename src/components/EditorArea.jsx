import { BG, TEXT, ACCENT } from "../constants/colors";
import { BreadcrumbChevron } from "./Icons";
import StarField from "./StarField";
import EditableBlock from "./EditableBlock";
import FloatingToolbar from "./FloatingToolbar";
import { getBlockFromNode, placeCaret, isEditableBlock } from "../utils/domHelpers";

export default function EditorArea({
  note, activeNote, noteData, editorFadeIn,
  editorRef, editorScrollRef, titleRef, blockRefs,
  noteDataRef, focusBlockId, focusCursorPos, forceRender,
  accentColor, editorBg, settingsFontSize,
  handleEditorKeyDown, handleEditorInput, handleEditorPaste,
  handleEditorPointerDown, handleEditorMouseDown, handleEditorMouseUp,
  handleEditorFocus, handleEditorDragOver, handleEditorDrop,
  commitTextChange, syncGeneration,
  flipCheck, deleteBlock, registerBlockRef,
  insertBlockAfter,
  toolbarState, detectActiveFormats, applyFormat,
}) {
  return (
    <div ref={editorScrollRef} className="editor-scroll" style={{ flex: 1, display: "flex", flexDirection: "column", overflowX: "hidden", overflowY: "auto", background: editorBg, position: "relative" }}>
      <StarField mode={note ? "editor" : "empty"} seed={activeNote || "__empty__"} />
      {note ? (
        <div key={activeNote} style={{
          padding: "28px 56px 80px 56px",
          maxWidth: 720, marginLeft: 40, marginRight: "auto", width: "100%",
          opacity: editorFadeIn ? 1 : 0,
          transform: editorFadeIn ? "translateY(0)" : "translateY(4px)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
          position: "relative", zIndex: 1,
        }}>
          {/* Breadcrumb */}
          {note.path && (
            <div style={{
              display: "flex", alignItems: "center", gap: 5,
              marginBottom: 16, fontSize: 12,
            }}>
              {note.path.map((seg, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  {i > 0 && <BreadcrumbChevron />}
                  <span style={{
                    color: i < note.path.length - 1 ? TEXT.secondary : TEXT.muted,
                    cursor: i < note.path.length - 1 ? "pointer" : "default",
                    transition: "color 0.15s",
                  }}
                    onMouseEnter={(e) => { if (i < note.path.length - 1) e.target.style.color = ACCENT.primary; }}
                    onMouseLeave={(e) => { if (i < note.path.length - 1) e.target.style.color = TEXT.secondary; }}
                  >{seg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Title */}
          <h1
            ref={titleRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              const newTitle = e.currentTarget.innerText;
              commitTextChange(prev => {
                const next = { ...prev };
                const n = { ...next[activeNote] };
                n.title = newTitle;
                n.content = { ...n.content, title: newTitle };
                next[activeNote] = n;
                return next;
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const blocks = noteDataRef.current[activeNote].content.blocks;
                const first = blocks.find(b => isEditableBlock(b));
                if (first) {
                  const firstId = first.id;
                  const el = blockRefs.current[firstId];
                  if (el) {
                    placeCaret(el, 0);
                    requestAnimationFrame(() => {
                      const sel = window.getSelection();
                      if (sel.rangeCount && getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)) return;
                      const freshEl = blockRefs.current[firstId];
                      if (freshEl) placeCaret(freshEl, 0);
                    });
                  } else {
                    focusBlockId.current = firstId;
                    focusCursorPos.current = 0;
                    forceRender(c => c + 1);
                  }
                }
              }
            }}
            onPaste={(e) => {
              e.preventDefault();
              document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            }}
            style={{
              fontSize: 28, fontWeight: 700, color: TEXT.primary,
              margin: "0 0 16px", lineHeight: 1.3, letterSpacing: "-0.4px",
              outline: "none",
            }}
          />

          {/* Title separator */}
          <div style={{
            height: 1,
            marginBottom: 20,
            background: `linear-gradient(90deg, ${accentColor}33, ${accentColor}0D, transparent)`,
          }} />

          {/* Blocks */}
          <div style={{ position: "relative" }}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onKeyDown={handleEditorKeyDown}
              onInput={handleEditorInput}
              onPaste={handleEditorPaste}
              onPointerDown={handleEditorPointerDown}
              onMouseDown={handleEditorMouseDown}
              onMouseUp={handleEditorMouseUp}
              onFocus={handleEditorFocus}
              onDragOver={handleEditorDragOver}
              onDrop={handleEditorDrop}
              onClick={(e) => {
                const anchor = e.target.closest("a");
                if (anchor && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  window.open(anchor.href, "_blank");
                }
              }}
              style={{ outline: "none" }}
            >
              {(() => {
                let numCounter = 0;
                return note.content.blocks.map((block, i) => {
                  if (block.type === "numbered") { numCounter++; } else { numCounter = 0; }
                  return (
                    <EditableBlock
                      key={block.id + "-" + block.type}
                      block={block}
                      blockIndex={i}
                      noteId={activeNote}
                      onCheckToggle={flipCheck}
                      onDeleteBlock={deleteBlock}
                      registerRef={registerBlockRef}
                      syncGen={syncGeneration.current}
                      accentColor={accentColor}
                      fontSize={settingsFontSize}
                      numberedIndex={block.type === "numbered" ? numCounter : undefined}
                    />
                  );
                });
              })()}
            </div>
            <FloatingToolbar
              position={toolbarState}
              activeFormats={toolbarState ? detectActiveFormats() : { bold: false, italic: false, code: false, link: false }}
              onFormat={applyFormat}
            />
          </div>

          {/* Click to create new block */}
          <div
            style={{ minHeight: 200, cursor: "text" }}
            onMouseDown={(e) => {
              e.preventDefault();
              const blocks = noteData[activeNote].content.blocks;
              if (blocks.length > 0) {
                const lastBlock = blocks[blocks.length - 1];
                const lastEl = blockRefs.current[lastBlock.id];
                if (lastEl && (lastEl.innerText || "").trim() === "") {
                  placeCaret(lastEl, 0);
                  const lastId = lastBlock.id;
                  requestAnimationFrame(() => {
                    const sel = window.getSelection();
                    if (sel.rangeCount && getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)) return;
                    const freshEl = blockRefs.current[lastId];
                    if (freshEl) placeCaret(freshEl, 0);
                  });
                  return;
                }
              }
              insertBlockAfter(activeNote, blocks.length - 1, "p", "");
            }}
          />
        </div>
      ) : (
        /* Empty state */
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden", zIndex: 1,
        }}>
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 3, marginBottom: 20, opacity: 0.12 }}>
              <img src="/assets/boojy-notes-text-N.png" alt="" style={{ height: 55, filter: "invert(1)" }} draggable="false" />
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: accentColor, position: "relative", top: 2, flexShrink: 0 }} />
              <img src="/assets/boojy-notes.text-tes.png" alt="" style={{ height: 48, filter: "invert(1)" }} draggable="false" />
            </div>
            <p style={{ color: TEXT.muted, fontSize: 14, marginBottom: 28, opacity: 0.7 }}>Start writing...</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: 0.4 }}>
              {[
                { key: "\u2318N", label: "New note" },
                { key: "\u2318P", label: "Search notes" },
                { key: "/", label: "Commands" },
              ].map((s) => (
                <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
                  <span style={{
                    fontSize: 11, color: TEXT.secondary,
                    background: BG.elevated, padding: "2px 7px",
                    borderRadius: 4, border: `1px solid ${BG.divider}`,
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    minWidth: 28, textAlign: "center",
                  }}>{s.key}</span>
                  <span style={{ fontSize: 12, color: TEXT.muted, width: 90, textAlign: "left" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
