import { lazy, memo, Suspense, useRef, useLayoutEffect } from "react";
import { useTheme } from "../hooks/useTheme";
import { headingStyle, isHeadingType, useRhythm } from "../tokens/rhythm";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";
import { getCaretOffset, placeCaret, caretLength, showSpaceBeforeCaret } from "../utils/domHelpers";
import { trace } from "../utils/trace";
import { latestBlock } from "../hooks/useOwnedField";
import { useEmptyMark } from "../hooks/useEmptyMark";
import { baselineFromTop } from "../utils/typeBaseline";
import { imageDisplayWidth, imageNoWidthFields, imageWidthFields } from "../utils/imageSize";
import { isElectron, isPhone } from "../utils/platform";
import CodeBlock from "./CodeBlock";
import FrontmatterBlock from "./FrontmatterBlock";
import CalloutBlock from "./CalloutBlock";
import TableBlock from "./TableBlock";
import ImageBlock from "./blocks/ImageBlock";
import FileBlock from "./blocks/FileBlock";
import EmbedBlock from "./blocks/EmbedBlock";
import SpacerBlock from "./blocks/SpacerBlock";

// KaTeX and its fonts stay out of the start: they load once the app is idle,
// so the first formula, typed or opened, finds them already there.
const loadMathBlock = () => import("./MathBlock");
const MathBlock = lazy(loadMathBlock);
if (typeof window !== "undefined") {
  // The module brings KaTeX's stylesheet; its fonts load only when asked for.
  const warm = () =>
    loadMathBlock()
      .then(() =>
        Promise.all(["KaTeX_Main", "KaTeX_Math"].map((f) => document.fonts?.load(`16px ${f}`))),
      )
      .catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 5000 });
  else setTimeout(warm, 2000);
}

/** Checkbox rows: line height ratio and box size, shared so the box can centre on the first line. */
const CHECKBOX_LINE_HEIGHT = 1.6;
const CHECKBOX_SIZE = 16;
const INDENT_PX = 24;
/**
 * Every list item's marker takes one column, then the air, then the text: a
 * dot is centred in it (so it lines up with a task's box), a number sits at
 * its right. Column and air make one indent, so every kind's text starts at
 * the same x and a nested item's marker stands under its parent's text.
 */
const LIST_MARKER_W = CHECKBOX_SIZE;
const LIST_TEXT_GAP = INDENT_PX - LIST_MARKER_W;

/** Padding a row carries above its own first line, which sits between the
 *  block's top edge and its baseline like leading does. */
const ROW_PAD_TOP = { bullet: 2, numbered: 2, checkbox: 2.5 };

/**
 * How far a block that opens a note reaches up from the note's first baseline.
 *
 * The note's first line is set on the sidebar's New note row and the column's
 * padding is one number for every note (`COLUMN_TOP` in EditorArea), so a block
 * that opens a note does not push that line down to make room for itself: it
 * takes the difference between the body's first baseline and its own. Negative
 * for a heading bigger than the body — it reaches up — positive for H6, whose
 * line is tighter than the body's, and zero for a paragraph.
 */
function firstBlockLift(type, r) {
  const heading = isHeadingType(type) ? headingStyle(type, r) : null;
  const size = heading ? heading.fontSize : r.bodySize;
  const lineHeight = heading
    ? heading.lineHeight
    : type === "checkbox"
      ? CHECKBOX_LINE_HEIGHT
      : r.lineHeight;
  return (
    baselineFromTop(r.bodySize, r.lineHeight) -
    (ROW_PAD_TOP[type] ?? 0) -
    baselineFromTop(size, lineHeight)
  );
}

/**
 * Bullet markers alternate by depth: a filled dot at the top level, a hollow
 * ring one level in, filled again at the third, and so on (the filled third
 * level keeps sibling groups apart without Notion's square). Painted rather
 * than the ● and ○ glyphs, so the pair shares one geometry in every font and
 * on every platform; the ring is 1px wider because a ring reads optically
 * smaller than a dot of its diameter. Both centre on the first line's
 * x-height, about 13px into the 25.5px line box, so a wrapped item keeps its
 * marker on its first line. Primary ink, never the accent: the marker is
 * typography, the checkbox is a control. Presentation only: the file's own
 * marker character and indentation are untouched (`block.marker`,
 * `block.indentStr`).
 *
 * A circle painted inside a larger box, never a rounded box: Chromium rounds
 * a box's width and height to device pixels apart, so under a UI scale or a
 * phone's density a 6px round box came out 13×14 or 19×21 device pixels. The
 * box may still move by half a pixel; the circle keeps its shape.
 */
const BULLET_DOT = 6;
const BULLET_RING = 7;
const BULLET_RING_STROKE = 1.25;
/** The box the circle is painted in: room for its soft edge wherever the box lands. */
const BULLET_BOX = 10;
/** Half the soft edge, in CSS px, either side of the circle's outline. */
const BULLET_EDGE = 0.4;
/** Where the marker's centre sits, as a share of the line box: 13px of 25.5 at the default rhythm. */
const BULLET_LINE_CENTRE = 13 / 25.5;

function bulletMarkerStyle(hollow, ink, linePx) {
  const r = (hollow ? BULLET_RING : BULLET_DOT) / 2;
  const outer = `${ink} ${r - BULLET_EDGE}px, transparent ${r + BULLET_EDGE}px`;
  const inner = r - BULLET_RING_STROKE;
  return {
    width: BULLET_BOX,
    height: BULLET_BOX,
    marginTop: BULLET_LINE_CENTRE * linePx - BULLET_BOX / 2,
    // Centred in the list's marker column.
    marginInline: (LIST_MARKER_W - BULLET_BOX) / 2,
    flexShrink: 0,
    userSelect: "none",
    background: hollow
      ? `radial-gradient(circle ${r + BULLET_EDGE}px, transparent ${inner - BULLET_EDGE}px, ${ink} ${inner + BULLET_EDGE}px, ${outer})`
      : `radial-gradient(circle ${r + BULLET_EDGE}px, ${outer})`,
  };
}

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
    numberedIndex,
    onUpdateText,
    onUpdateCalloutTitle,
    onUpdateTableCell,
    onUpdateTableRows,
    noteTitleSet,
    onBlockNav,
    isBlockSelected,
    isOnlyBlockSelected,
    onBlockSelect,
    onImageDragPress,
    onImageCopyImage,
    onUpdateBlockProperty,
    onFileOpen,
    onFileOpenDefault,
    onFileShowInFolder,
    noteDataRef,
    onNavigateToNote,
  }) {
    const { theme } = useTheme();
    const { TEXT, ACCENT } = theme;
    const rhythm = useRhythm();
    const elRef = useRef(null);
    // The root of a block that has no text of its own, or that keeps its text
    // in a field of its own: an image, a file, a code block, a callout, an
    // embed. The gutter grip and the drop geometry find blocks in the ref map,
    // and a wrapper that never registered would be a grip that showed and a
    // press that did nothing (and a code block could not be moved at all,
    // since the keyboard reorder needs a caret its field never gives).
    // Kept apart from `elRef` on purpose: that ref's repaint effect paints the
    // block's text, and these carry none.
    const wholeRef = useRef(null);

    // Paint the text on mount, on a sync-generation bump (undo, redo, a paste,
    // an outside change) and when the title set changes (a wikilink may have
    // become broken or whole), never on a keystroke: the browser owns the DOM
    // while the user types. The text painted is the block as the keystroke
    // ref holds it, never as this render holds it. The ref runs ahead of
    // React state by the text-commit debounce, and a render can carry a text
    // one keystroke behind the DOM: the render the next keystroke publishes
    // the previous one with, and a transition render that finishes after a
    // keystroke. Painted from the render, that lag would go over the DOM and
    // lose the keystroke. Replacing
    // innerHTML collapses a caret inside the block to its start, so the
    // offset is remembered first and the caret put back, clamped to the text.
    // A space typed at the end of the line, just before the caret, is put
    // back as Chromium typed it, or the next keystroke joins the word before it.
    useLayoutEffect(() => {
      const el = elRef.current;
      if (!el || block.text === undefined) return;
      const text = (latestBlock(noteDataRef, noteId, block) ?? block).text ?? "";
      const caret = getCaretOffset(el);
      trace(
        "block repaint",
        block.id,
        block.type,
        "caret",
        caret,
        "syncGen",
        syncGen,
        "len",
        text.length,
      );
      if (text === "") {
        el.innerHTML = "<br>";
      } else {
        el.innerHTML = inlineMarkdownToHtml(text, noteTitleSet);
      }
      if (caret >= 0) {
        placeCaret(el, Math.min(caret, caretLength(el)));
        showSpaceBeforeCaret(el);
      }
    }, [syncGen, noteTitleSet]); // deliberately not exhaustive: the signals, never a keystroke

    // The first paragraph's placeholder shows only while it holds no text,
    // never under `line one ⇧↵ line two`. Not on the phone: `/` is on its
    // keyboard's second layer, and the bar is the quicker way in.
    const placeholder = !isPhone && blockIndex === 0;
    useEmptyMark(elRef, placeholder && block.type === "p");

    useLayoutEffect(() => {
      const el = elRef.current || wholeRef.current;
      if (el) registerRef(block.id, el);
      return () => registerRef(block.id, null);
    }, [block.id]);

    if (block.type === "spacer") {
      return (
        <SpacerBlock
          blockId={block.id}
          isSelected={isBlockSelected}
          accentColor={accentColor}
          onSelect={() => onBlockSelect(block.id)}
          registerRef={registerRef}
        />
      );
    }

    // The root of a block that is not text: the browser never edits it, and
    // `wholeRef` registers it for the grip and the selection band.
    const wholeRoot = (children, style, ref) => (
      <div
        ref={ref}
        data-block-id={block.id}
        data-block-type={block.type}
        data-selected={isBlockSelected ? "true" : undefined}
        contentEditable="false"
        suppressContentEditableWarning
        style={{ ...style, userSelect: "none" }}
      >
        {children}
      </div>
    );

    if (block.type === "image") {
      return wholeRoot(
        <ImageBlock
          src={block.src}
          markdown={block.format === "md"}
          alt={block.alt}
          displayWidth={imageDisplayWidth(block)}
          isSelected={isBlockSelected}
          onDragPress={(e) => onImageDragPress?.(block.id, e)}
          selectedAlone={isOnlyBlockSelected}
          accentColor={accentColor}
          onSelect={() => onBlockSelect(block.id)}
          onDelete={() => onDeleteBlock(noteId, blockIndex)}
          onCopyImage={onImageCopyImage}
          onShowInFolder={
            isElectron && !/^(https?:|data:)/i.test(block.src || "")
              ? onFileShowInFolder
              : undefined
          }
          onUpdateWidth={(px) =>
            onUpdateBlockProperty(
              noteId,
              blockIndex,
              px == null ? imageNoWidthFields() : imageWidthFields(px),
            )
          }
        />,
        { padding: "8px 0" },
        wholeRef,
      );
    }

    if (block.type === "file") {
      return wholeRoot(
        <FileBlock
          src={block.src}
          filename={block.filename || block.src}
          size={block.size}
          accentColor={accentColor}
          onDelete={() => onDeleteBlock(noteId, blockIndex)}
          onOpen={onFileOpen}
          onOpenDefault={onFileOpenDefault}
          onShowInFolder={onFileShowInFolder}
        />,
        { padding: "8px 0" },
        wholeRef,
      );
    }

    if (block.type === "code") {
      return wholeRoot(
        <CodeBlock
          block={block}
          noteId={noteId}
          blockIndex={blockIndex}
          syncGen={syncGen}
          noteDataRef={noteDataRef}
          onUpdateCode={onUpdateText}
          onUpdateBlock={onUpdateBlockProperty}
          onBlockNav={onBlockNav}
          onDelete={(idx) => onDeleteBlock(noteId, idx)}
        />,
        null,
        wholeRef,
      );
    }

    if (block.type === "math") {
      return wholeRoot(
        <Suspense fallback={<div style={{ minHeight: 48 }} />}>
          <MathBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            syncGen={syncGen}
            noteDataRef={noteDataRef}
            isSelected={isBlockSelected}
            accentColor={accentColor}
            onUpdateText={onUpdateText}
            onBlockNav={onBlockNav}
            onSelect={() => onBlockSelect(block.id)}
            onDelete={(idx) => onDeleteBlock(noteId, idx)}
          />
        </Suspense>,
        null,
        wholeRef,
      );
    }

    if (block.type === "frontmatter") {
      return wholeRoot(<FrontmatterBlock block={block} />, null, null);
    }

    if (block.type === "callout") {
      return wholeRoot(
        <CalloutBlock
          block={block}
          noteId={noteId}
          blockIndex={blockIndex}
          syncGen={syncGen}
          noteDataRef={noteDataRef}
          noteTitleSet={noteTitleSet}
          onUpdateBlock={onUpdateBlockProperty}
          onUpdateText={onUpdateText}
          onUpdateTitle={onUpdateCalloutTitle}
          onBlockNav={onBlockNav}
          onDelete={(idx) => onDeleteBlock(noteId, idx)}
        />,
        null,
        wholeRef,
      );
    }

    if (block.type === "table") {
      // The table renders its own root (data-block-id, registered for the
      // gutter grip and the selection band), the way the divider does.
      return (
        <TableBlock
          block={block}
          noteId={noteId}
          blockIndex={blockIndex}
          syncGen={syncGen}
          noteDataRef={noteDataRef}
          onUpdateTableCell={onUpdateTableCell}
          onUpdateTableRows={onUpdateTableRows}
          noteTitleSet={noteTitleSet}
          accentColor={accentColor}
          isSelected={isBlockSelected}
          onSelect={() => onBlockSelect(block.id)}
          onBlockNav={onBlockNav}
          registerRef={registerRef}
        />
      );
    }

    if (block.type === "embed") {
      return wholeRoot(
        <EmbedBlock block={block} accentColor={accentColor} onNavigate={onNavigateToNote} />,
        { padding: "4px 0" },
        wholeRef,
      );
    }

    if (block.type === "blockquote") {
      const indentPad = (block.indent || 0) * INDENT_PX;
      return (
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          suppressContentEditableWarning
          style={{
            contain: "content",
            borderLeft: `3px solid ${accentColor}`,
            paddingLeft: 14 + indentPad,
            margin: `0 0 ${rhythm.paragraphGap}px`,
            lineHeight: rhythm.lineHeight,
          }}
        >
          <span
            ref={elRef}
            style={{
              color: TEXT.primary,
              outline: "none",
              display: "block",
              fontSize: rhythm.bodySize,
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
          data-block-type={block.type}
          data-placeholder="Type / for blocks"
          className={placeholder ? "empty-block" : undefined}
          role="textbox"
          aria-multiline="true"
          aria-label="Paragraph"
          style={{
            // Vertical rhythm lives in GlobalStyles (the paragraph pitch and the
            // gap after a list item), where a sibling rule can reach it.
            contain: "content",
            lineHeight: rhythm.lineHeight,
            color: TEXT.primary,
            fontSize: rhythm.bodySize,
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (/^h[1-6]$/.test(block.type)) {
      const Heading = block.type;
      const style = headingStyle(block.type, rhythm);
      return (
        <Heading
          ref={elRef}
          data-block-id={block.id}
          data-block-type={block.type}
          aria-label={`Heading ${block.type.slice(1)}`}
          // Shown by CSS while the element holds nothing but the caret's <br>
          // (GlobalStyles, the paragraph placeholder's rule), so an empty
          // heading names its level in its own type; a pseudo-element, so it
          // can never reach the file or the clipboard.
          data-placeholder={`Heading ${block.type.slice(1)}`}
          style={{
            contain: "content",
            position: "relative",
            ...style,
            // A heading that opens a note reaches up to the note's first
            // baseline rather than pushing it down, and its top margin — the
            // air between it and a block above, of which it has none — goes
            // with it. Every other heading keeps its rhythm.
            ...(blockIndex === 0 ? { marginTop: firstBlockLift(block.type, rhythm) } : null),
            color: TEXT.primary,
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    // A list item's row: its marker, then its text, both on the first line
    // (top-aligned, so a wrapped item's marker stays by its first line),
    // indented by depth. The task's box and line differ from the bullet's.
    const listRow = (children, style) => (
      <div
        data-block-id={block.id}
        data-block-type={block.type}
        suppressContentEditableWarning
        style={{
          contain: "content",
          display: "flex",
          alignItems: "flex-start",
          gap: LIST_TEXT_GAP,
          padding: "2px 0",
          fontSize: rhythm.bodySize,
          lineHeight: rhythm.lineHeight,
          paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          // Reaches up to the note's first baseline when it opens the note.
          ...(blockIndex === 0 ? { marginTop: firstBlockLift(block.type, rhythm) } : null),
          ...style,
        }}
      >
        {children}
      </div>
    );

    if (block.type === "bullet") {
      const depth = block.indent || 0;
      const hollow = depth % 2 === 1;
      return listRow(
        <>
          <span
            contentEditable="false"
            suppressContentEditableWarning
            aria-hidden="true"
            data-marker={hollow ? "hollow" : "filled"}
            style={bulletMarkerStyle(hollow, TEXT.primary, rhythm.bodySize * rhythm.lineHeight)}
          />
          <span
            ref={elRef}
            role="textbox"
            aria-label="Bullet item"
            style={{ color: TEXT.primary, outline: "none", flex: 1 }}
          />
        </>,
      );
    }

    if (block.type === "numbered") {
      return listRow(
        <>
          <span
            contentEditable="false"
            suppressContentEditableWarning
            style={{
              color: TEXT.secondary,
              flexShrink: 0,
              fontSize: rhythm.bodySize,
              userSelect: "none",
              // The column's width, never more: a number ends at its right
              // edge, and one too wide for it (10.) hangs out to the left, so
              // the text never moves.
              width: LIST_MARKER_W,
              display: "flex",
              justifyContent: "flex-end",
              whiteSpace: "nowrap",
            }}
          >
            {numberedIndex}.
          </span>
          <span
            ref={elRef}
            role="textbox"
            aria-label="Numbered item"
            style={{ color: TEXT.primary, outline: "none", flex: 1 }}
          />
        </>,
        // Layout kept in, paint not: a number hanging left of the row would be cut.
        { contain: "layout style" },
      );
    }

    if (block.type === "checkbox") {
      return listRow(
        <>
          {/* The hit area, not the drawn box: `:active` scales the square, and
              Chromium hit-tests the scaled box, so a press near its edge
              released on the row. The hit area is the square's footprint and
              never transforms; no slop round it, or it would tick tasks the
              pointer was not on. */}
          <div
            className="checkbox-hit"
            role="checkbox"
            aria-checked={!!block.checked}
            contentEditable="false"
            suppressContentEditableWarning
            onClick={(e) => {
              e.stopPropagation();
              onCheckToggle(noteId, blockIndex);
            }}
            style={{
              width: CHECKBOX_SIZE,
              height: CHECKBOX_SIZE,
              // Centre the box on the first line's height, whatever the font size.
              marginTop: (rhythm.bodySize * CHECKBOX_LINE_HEIGHT - CHECKBOX_SIZE) / 2,
              flexShrink: 0,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              userSelect: "none",
            }}
          >
            <div
              className="checkbox-box"
              aria-hidden="true"
              style={{
                width: CHECKBOX_SIZE,
                height: CHECKBOX_SIZE,
                borderRadius: 3.5,
                boxSizing: "border-box",
                flexShrink: 0,
                border: block.checked ? `1.5px solid ${accentColor}` : `1.5px solid ${TEXT.muted}`,
                background: block.checked ? accentColor : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                {/* Drawn, not faded: the stroke's dash offset runs (GlobalStyles). */}
                <path
                  className="checkbox-tick"
                  data-checked={block.checked ? "true" : "false"}
                  pathLength="1"
                  d="M2 5L4.2 7.2L8 3"
                  stroke={ACCENT.onAccent}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <span
            ref={elRef}
            style={{
              color: block.checked ? TEXT.muted : TEXT.primary,
              textDecoration: block.checked ? "line-through" : "none",
              // A done task's strike is half the text's ink: the tick already says
              // done, so the line stays quiet and the words stay readable.
              textDecorationColor: "color-mix(in srgb, currentColor 50%, transparent)",
              outline: "none",
              flex: 1,
              transition: "color var(--motion-fast)",
            }}
          />
        </>,
        { padding: "2.5px 0", lineHeight: CHECKBOX_LINE_HEIGHT },
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
      prev.numberedIndex === next.numberedIndex &&
      prev.isBlockSelected === next.isBlockSelected &&
      prev.isOnlyBlockSelected === next.isOnlyBlockSelected &&
      (prev.block.text === "") === (next.block.text === "") &&
      (prev.block.text === next.block.text ||
        (prev.block.type !== "code" &&
          prev.block.type !== "callout" &&
          prev.block.type !== "math")) &&
      prev.block.rows === next.block.rows &&
      prev.block.target === next.block.target &&
      prev.block.heading === next.block.heading &&
      prev.block.alignments === next.block.alignments &&
      prev.noteTitleSet === next.noteTitleSet
    );
  },
);

export default EditableBlock;
