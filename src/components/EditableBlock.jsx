import { memo, useRef, useLayoutEffect } from "react";
import { useTheme } from "../hooks/useTheme";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";
import CodeBlock from "./CodeBlock";
import FrontmatterBlock from "./FrontmatterBlock";
import CalloutBlock from "./CalloutBlock";
import TableBlock from "./TableBlock";
import ImageBlock from "./blocks/ImageBlock";
import FileBlock from "./blocks/FileBlock";
import EmbedBlock from "./blocks/EmbedBlock";
import SpacerBlock from "./blocks/SpacerBlock";

const INDENT_PX = 24;

const EditableBlock = memo(
  function EditableBlock({
    block,
    blockIndex,
    noteId,
    onCheckToggle,
    onDeleteBlock,
    registerRef,
    syncGen,
    accentColor,
    fontSize,
    numberedIndex,
    onUpdateCode,
    onUpdateLang,
    onUpdateCallout,
    onUpdateTableRows,
    noteTitleSet,
    onBlockNav,
    isImageSelected,
    onImageSelect,
    onImageLightbox,
    onImageReplace,
    onImageCopyImage,
    onUpdateBlockProperty,
    onFileOpen,
    onFileShowInFolder,
    noteDataRef,
    onNavigateToNote,
  }) {
    const { theme } = useTheme();
    const { BG, TEXT, ACCENT } = theme;
    const elRef = useRef(null);

    // Set text on mount and force-resync on undo/redo (syncGen changes)
    useLayoutEffect(() => {
      if (elRef.current && block.text !== undefined) {
        if (block.text === "") {
          elRef.current.innerHTML = "<br>";
        } else {
          elRef.current.innerHTML = inlineMarkdownToHtml(block.text, noteTitleSet);
        }
      }
    }, [syncGen, noteTitleSet]); // eslint-disable-line -- only mount + undo/redo, NOT on every keystroke

    useLayoutEffect(() => {
      if (elRef.current) registerRef(block.id, elRef.current);
      return () => registerRef(block.id, null);
    }, [block.id]);

    if (block.type === "spacer") {
      return <SpacerBlock blockId={block.id} />;
    }

    if (block.type === "image") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "8px 0", userSelect: "none" }}
        >
          <ImageBlock
            src={block.src}
            alt={block.alt}
            width={block.width || 100}
            isSelected={isImageSelected}
            accentColor={accentColor}
            onSelect={() => onImageSelect(block.id)}
            onLightbox={() => onImageLightbox(block.src, block.alt)}
            onDelete={() => onDeleteBlock(noteId, blockIndex)}
            onReplace={() => onImageReplace(noteId, blockIndex)}
            onCopyImage={() => onImageCopyImage(block.src)}
            onUpdateWidth={(w) => onUpdateBlockProperty(noteId, blockIndex, { width: w })}
          />
        </div>
      );
    }

    if (block.type === "file") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "8px 0", userSelect: "none" }}
        >
          <FileBlock
            src={block.src}
            filename={block.filename || block.src}
            size={block.size}
            accentColor={accentColor}
            onDelete={() => onDeleteBlock(noteId, blockIndex)}
            onOpen={() => onFileOpen(block.src)}
            onShowInFolder={() => onFileShowInFolder(block.src)}
          />
        </div>
      );
    }

    if (block.type === "code") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <CodeBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            onUpdateCode={onUpdateCode}
            onUpdateLang={onUpdateLang}
            onBlockNav={onBlockNav}
            onDelete={(idx) => onDeleteBlock(noteId, idx)}
          />
        </div>
      );
    }

    if (block.type === "frontmatter") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <FrontmatterBlock block={block} />
        </div>
      );
    }

    if (block.type === "callout") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <CalloutBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            onUpdateCallout={onUpdateCallout}
            onBlockNav={onBlockNav}
            onDelete={(idx) => onDeleteBlock(noteId, idx)}
          />
        </div>
      );
    }

    if (block.type === "table") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <TableBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            onUpdateTableRows={onUpdateTableRows}
            noteTitleSet={noteTitleSet}
            accentColor={accentColor}
          />
        </div>
      );
    }

    if (block.type === "embed") {
      return (
        <div
          data-block-id={block.id}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "4px 0", userSelect: "none" }}
        >
          <EmbedBlock
            block={block}
            noteData={noteDataRef?.current}
            accentColor={accentColor}
            onNavigate={(target, create) => {
              if (create && onNavigateToNote) {
                // create=true means we should create the note
                onNavigateToNote(target, true);
              } else if (onNavigateToNote) {
                onNavigateToNote(target);
              }
            }}
          />
        </div>
      );
    }

    if (block.type === "blockquote") {
      const indentPad = (block.indent || 0) * INDENT_PX;
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            contain: "content",
            borderLeft: `3px solid ${accentColor}`,
            paddingLeft: 14 + indentPad,
            margin: "0 0 6px",
            lineHeight: 1.7,
          }}
        >
          <span
            ref={elRef}
            style={{
              color: TEXT.secondary,
              fontStyle: "italic",
              outline: "none",
              display: "block",
              fontSize,
            }}
          />
        </div>
      );
    }

    if (block.type === "p") {
      return (
        <p
          ref={elRef}
          data-block-id={block.id}
          data-placeholder="Type / for commands..."
          className={blockIndex === 0 && block.text === "" ? "empty-block" : undefined}
          style={{
            contain: "content",
            margin: "0 0 6px",
            lineHeight: 1.7,
            color: TEXT.primary,
            fontSize,
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (block.type === "h1") {
      return (
        <h1
          ref={elRef}
          data-block-id={block.id}
          style={{
            contain: "content",
            fontSize: 28,
            fontWeight: 700,
            color: TEXT.primary,
            margin: "8px 0 12px",
            lineHeight: 1.3,
            letterSpacing: "-0.4px",
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (block.type === "h2") {
      return (
        <h2
          ref={elRef}
          data-block-id={block.id}
          style={{
            contain: "content",
            fontSize: 22,
            fontWeight: 600,
            color: TEXT.primary,
            margin: "6px 0 10px",
            lineHeight: 1.35,
            letterSpacing: "-0.2px",
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (block.type === "h3") {
      return (
        <h3
          ref={elRef}
          data-block-id={block.id}
          style={{
            contain: "content",
            fontSize: 16.5,
            fontWeight: 600,
            color: TEXT.primary,
            margin: "6px 0 6px",
            lineHeight: 1.35,
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (block.type === "bullet") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            contain: "content",
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "2px 0",
            fontSize,
            lineHeight: 1.7,
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        >
          <span
            contentEditable="false"
            suppressContentEditableWarning
            style={{
              color: accentColor,
              marginTop: 6.5,
              flexShrink: 0,
              fontSize: 7,
              userSelect: "none",
            }}
          >
            {"\u25CF"}
          </span>
          <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
        </div>
      );
    }

    if (block.type === "numbered") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            contain: "content",
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "2px 0",
            fontSize,
            lineHeight: 1.7,
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        >
          <span
            contentEditable="false"
            suppressContentEditableWarning
            style={{
              color: TEXT.secondary,
              flexShrink: 0,
              fontSize,
              userSelect: "none",
              minWidth: 18,
              textAlign: "right",
            }}
          >
            {numberedIndex}.
          </span>
          <span ref={elRef} style={{ color: TEXT.primary, outline: "none", flex: 1 }} />
        </div>
      );
    }

    if (block.type === "checkbox") {
      return (
        <div
          data-block-id={block.id}
          suppressContentEditableWarning
          style={{
            contain: "content",
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "2.5px 0",
            fontSize,
            lineHeight: 1.6,
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        >
          <div
            className="checkbox-box"
            role="checkbox"
            aria-checked={!!block.checked}
            contentEditable="false"
            suppressContentEditableWarning
            onClick={(e) => {
              e.stopPropagation();
              onCheckToggle(noteId, blockIndex);
            }}
            style={{
              width: 16,
              height: 16,
              borderRadius: 3.5,
              flexShrink: 0,
              cursor: "pointer",
              border: block.checked ? `1.5px solid ${accentColor}` : `1.5px solid ${TEXT.muted}`,
              background: block.checked ? accentColor : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s",
              userSelect: "none",
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              style={{
                opacity: block.checked ? 1 : 0,
                transform: block.checked ? "scale(1)" : "scale(0.5)",
                transition: "opacity 0.15s, transform 0.15s",
              }}
            >
              <path
                d="M2 5L4.2 7.2L8 3"
                stroke={BG.darkest}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span
            ref={elRef}
            style={{
              color: block.checked ? TEXT.muted : TEXT.primary,
              textDecoration: block.checked ? "line-through" : "none",
              outline: "none",
              flex: 1,
              transition: "color 0.15s",
            }}
          />
        </div>
      );
    }

    return null;
  },
  (prev, next) => {
    return (
      prev.block.id === next.block.id &&
      prev.block.type === next.block.type &&
      prev.block.indent === next.block.indent &&
      prev.block.checked === next.block.checked &&
      prev.block.src === next.block.src &&
      prev.block.alt === next.block.alt &&
      prev.block.width === next.block.width &&
      prev.block.size === next.block.size &&
      prev.block.lang === next.block.lang &&
      prev.block.calloutType === next.block.calloutType &&
      prev.block.calloutTypeRaw === next.block.calloutTypeRaw &&
      prev.block.title === next.block.title &&
      prev.blockIndex === next.blockIndex &&
      prev.syncGen === next.syncGen &&
      prev.accentColor === next.accentColor &&
      prev.fontSize === next.fontSize &&
      prev.numberedIndex === next.numberedIndex &&
      prev.isImageSelected === next.isImageSelected &&
      (prev.block.text === "") === (next.block.text === "") &&
      (prev.block.text === next.block.text ||
        (prev.block.type !== "code" && prev.block.type !== "callout")) &&
      prev.block.rows === next.block.rows &&
      prev.block.target === next.block.target &&
      prev.block.heading === next.block.heading &&
      prev.block.alignments === next.block.alignments &&
      prev.noteTitleSet === next.noteTitleSet
    );
  },
);

export default EditableBlock;
