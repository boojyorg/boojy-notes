import { memo, useRef, useLayoutEffect } from "react";
import { useTheme } from "../hooks/useTheme";
import { inlineMarkdownToHtml } from "../utils/inlineFormatting";
import { getCaretOffset, placeCaret, caretLength } from "../utils/domHelpers";
import { trace } from "../utils/trace";
import { latestBlock } from "../hooks/useOwnedField";
import { baselineFromTop } from "../utils/typeBaseline";
import CodeBlock from "./CodeBlock";
import FrontmatterBlock from "./FrontmatterBlock";
import CalloutBlock from "./CalloutBlock";
import TableBlock from "./TableBlock";
import ImageBlock from "./blocks/ImageBlock";
import FileBlock from "./blocks/FileBlock";
import EmbedBlock from "./blocks/EmbedBlock";
import SpacerBlock from "./blocks/SpacerBlock";

/**
 * The paragraph pitch: the space after a paragraph or quote block. A soft break
 * (Shift+Enter) is line height alone, a paragraph break (Enter) adds this, and
 * an empty row (Enter twice) adds a whole line on top; the three must read as
 * three. Lists and headings keep their own rhythm. The paragraph's own margin
 * is set in GlobalStyles from this value, beside the rule that gives a
 * paragraph after a list item the same gap; the quote uses it inline. 8 since
 * 2026-09-17 (was 12): at 12 an Enter read as two lines to an Obsidian hand.
 */
export const PARAGRAPH_GAP = 8;

/**
 * Body text size for every text block. Not a preference: the Settings row that
 * used to set it (10–24) was removed on 2026-09-05 because Cmd+Plus/Minus/0
 * already scale the whole app and one knob is enough.
 */
export const EDITOR_FONT_SIZE = 15;
/** The line box of a paragraph, list row or quote: the editor's own rhythm.
 *  Exported because the column's top padding is measured against it — the
 *  note's first line sits on the sidebar's New note row (`EditorArea`). */
export const EDITOR_LINE_HEIGHT = 1.7;
/** Checkbox rows: line height ratio and box size, shared so the box can centre on the first line. */
const CHECKBOX_LINE_HEIGHT = 1.6;
const CHECKBOX_SIZE = 16;
/**
 * The checkbox is two elements: the square you see, and the hit area around it
 * that takes the click.
 *
 * A press within about a pixel of the square's edge used to animate and change
 * nothing: `:active` scales the square to 0.85, Chromium hit-tests against the
 * transformed box, and a held press pulled every edge 1.2px in from under the
 * pointer — so the release landed on the row, and the click fired there rather
 * than on the box (2026-09-19). What fixes it is an element that covers the
 * square's footprint and never transforms; the press animation belongs to the
 * square inside it.
 *
 * The hit area is that footprint and no more. A padded one was tried the same
 * day and rejected live: the target is the box you can see, and 4px of slop
 * around it ticked tasks the pointer was not on.
 */
/** Air between the drawn box and the task's text. */
const CHECKBOX_TEXT_GAP = 9;

// One render path for all heading levels; the smaller levels keep body-sized
// text and use weight/spacing to remain headings. No extra editor chrome.
const HEADING_STYLES = {
  h1: {
    fontSize: 28,
    fontWeight: 700,
    margin: "8px 0 12px",
    lineHeight: 1.3,
    letterSpacing: "-0.4px",
  },
  h2: {
    fontSize: 22,
    fontWeight: 600,
    margin: "6px 0 10px",
    lineHeight: 1.35,
    letterSpacing: "-0.2px",
  },
  h3: { fontSize: 20, fontWeight: 600, margin: "8px 0 8px", lineHeight: 1.35 },
  h4: { fontSize: 18, fontWeight: 600, margin: "8px 0 6px", lineHeight: 1.35 },
  h5: { fontSize: 16.5, fontWeight: 600, margin: "8px 0 4px", lineHeight: 1.35 },
  h6: { fontSize: 15, fontWeight: 700, margin: "8px 0 4px", lineHeight: 1.4 },
};

const INDENT_PX = 24;

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
function firstBlockLift(type) {
  const heading = HEADING_STYLES[type];
  const size = heading ? heading.fontSize : EDITOR_FONT_SIZE;
  const lineHeight = heading
    ? heading.lineHeight
    : type === "checkbox"
      ? CHECKBOX_LINE_HEIGHT
      : EDITOR_LINE_HEIGHT;
  return (
    baselineFromTop(EDITOR_FONT_SIZE, EDITOR_LINE_HEIGHT) -
    (ROW_PAD_TOP[type] ?? 0) -
    baselineFromTop(size, lineHeight)
  );
}

/**
 * Bullet markers alternate by depth: a filled dot at the top level, a hollow
 * ring one level in, filled again at the third, and so on (2026-09-16, judged
 * on a mockup against filled-then-hollow-throughout: the filled third level
 * keeps sibling groups apart without Notion's square). Drawn as boxes rather
 * than the ● and ○ glyphs, so the pair shares one geometry in every font and
 * on every platform and scales cleanly under the UI zoom; the ring is 1px
 * wider because a ring reads optically smaller than a dot of its diameter.
 * Both centre on the first line's x-height, about 13px into the 25.5px line
 * box, so a wrapped item keeps its marker on its first line. Primary ink,
 * never the accent: the marker is typography, the checkbox is a control.
 * Presentation only: the file's own marker character and indentation are
 * untouched (`block.marker`, `block.indentStr`).
 */
const BULLET_DOT = 6;
const BULLET_RING = 7;
const BULLET_RING_STROKE = 1.25;
const BULLET_LINE_CENTRE = 13;

function bulletMarkerStyle(hollow, ink) {
  const size = hollow ? BULLET_RING : BULLET_DOT;
  return {
    width: size,
    height: size,
    marginTop: BULLET_LINE_CENTRE - size / 2,
    borderRadius: "50%",
    boxSizing: "border-box",
    flexShrink: 0,
    userSelect: "none",
    background: hollow ? "transparent" : ink,
    border: hollow ? `${BULLET_RING_STROKE}px solid ${ink}` : undefined,
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
    onUpdateLang,
    onUpdateCallout,
    onUpdateCalloutTitle,
    onUpdateTableCell,
    onUpdateTableRows,
    noteTitleSet,
    onBlockNav,
    isBlockSelected,
    onBlockSelect,
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
    const { TEXT, ACCENT } = theme;
    const elRef = useRef(null);
    // The root of a block that has no text of its own, or that keeps its text
    // in a field of its own: an image, a file, a code block, a callout, an
    // embed. The gutter grip and the drop geometry find blocks in the ref map,
    // and a wrapper that never registered was a grip that showed and a press
    // that did nothing (images 2026-09-16, code, callout and embed
    // 2026-09-19 — a code block could not be moved at all, since the keyboard
    // reorder needs a caret the block's own field never gives the editor).
    // Kept apart from `elRef` on purpose: that ref's repaint effect paints the
    // block's text, and these carry none. Registration is for the grip; whole-
    // block selection for these three is still deferred (`isSelectableBlock`).
    const wholeRef = useRef(null);

    // Paint the text on mount, on a sync-generation bump (undo, redo, a paste,
    // an outside change) and when the title set changes (a wikilink may have
    // become broken or whole), never on a keystroke: the browser owns the DOM
    // while the user types. The text painted is the block as the keystroke
    // ref holds it, never as this render holds it. The ref runs ahead of
    // React state by the text-commit debounce, and a render can carry a text
    // one keystroke behind the DOM: the render the next keystroke publishes
    // the previous one with, and a transition render that finishes after a
    // keystroke. Painted from the render, that lag went over the DOM and the
    // keystroke was lost: the character typed after a `[x](url)` whose
    // styling pass bumped the generation (review 2026-09-07, §1.1), and the
    // characters typed after a title edit in dev, where StrictMode's double
    // invocation recomputed the title set mid-burst (§1.15). Replacing
    // innerHTML collapses a caret inside the block to its start, so the
    // offset is remembered first and the caret put back, clamped to the text.
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
      if (caret >= 0) placeCaret(el, Math.min(caret, caretLength(el)));
    }, [syncGen, noteTitleSet]); // deliberately not exhaustive: the signals, never a keystroke

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

    if (block.type === "image") {
      return (
        <div
          ref={wholeRef}
          data-block-id={block.id}
          data-block-type={block.type}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ padding: "8px 0", userSelect: "none" }}
        >
          <ImageBlock
            src={block.src}
            alt={block.alt}
            width={block.width || 100}
            isSelected={isBlockSelected}
            accentColor={accentColor}
            onSelect={() => onBlockSelect(block.id)}
            onLightbox={() => onImageLightbox(block.src, block.alt)}
            onDelete={() => onDeleteBlock(noteId, blockIndex)}
            onReplace={() => onImageReplace(noteId, blockIndex)}
            onCopyImage={() => onImageCopyImage(block.src)}
            onUpdateWidth={(w) =>
              // widthPx is the source file's exact pixel width — stale after a
              // manual resize, so clear it (serialiser falls back to width%)
              onUpdateBlockProperty(noteId, blockIndex, { width: w, widthPx: undefined })
            }
          />
        </div>
      );
    }

    if (block.type === "file") {
      return (
        <div
          ref={wholeRef}
          data-block-id={block.id}
          data-block-type={block.type}
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
          ref={wholeRef}
          data-block-id={block.id}
          data-block-type={block.type}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <CodeBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            syncGen={syncGen}
            noteDataRef={noteDataRef}
            onUpdateCode={onUpdateText}
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
          data-block-type={block.type}
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
          ref={wholeRef}
          data-block-id={block.id}
          data-block-type={block.type}
          contentEditable="false"
          suppressContentEditableWarning
          style={{ userSelect: "none" }}
        >
          <CalloutBlock
            block={block}
            noteId={noteId}
            blockIndex={blockIndex}
            syncGen={syncGen}
            noteDataRef={noteDataRef}
            noteTitleSet={noteTitleSet}
            onUpdateCallout={onUpdateCallout}
            onUpdateText={onUpdateText}
            onUpdateTitle={onUpdateCalloutTitle}
            onBlockNav={onBlockNav}
            onDelete={(idx) => onDeleteBlock(noteId, idx)}
          />
        </div>
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
          onDelete={() => onDeleteBlock(noteId, blockIndex)}
          registerRef={registerRef}
        />
      );
    }

    if (block.type === "embed") {
      return (
        <div
          ref={wholeRef}
          data-block-id={block.id}
          data-block-type={block.type}
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
          data-block-type={block.type}
          suppressContentEditableWarning
          style={{
            contain: "content",
            borderLeft: `3px solid ${accentColor}`,
            paddingLeft: 14 + indentPad,
            margin: `0 0 ${PARAGRAPH_GAP}px`,
            lineHeight: EDITOR_LINE_HEIGHT,
          }}
        >
          <span
            ref={elRef}
            style={{
              color: TEXT.primary,
              outline: "none",
              display: "block",
              fontSize: EDITOR_FONT_SIZE,
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
          data-placeholder="Type / for commands..."
          className={blockIndex === 0 ? "empty-block" : undefined}
          role="textbox"
          aria-multiline="true"
          aria-label="Paragraph"
          style={{
            // Vertical rhythm lives in GlobalStyles (the paragraph pitch and the
            // gap after a list item), where a sibling rule can reach it.
            contain: "content",
            lineHeight: EDITOR_LINE_HEIGHT,
            color: TEXT.primary,
            fontSize: EDITOR_FONT_SIZE,
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (/^h[1-6]$/.test(block.type)) {
      const Heading = block.type;
      const style = HEADING_STYLES[block.type];
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
            // with it. Every other heading keeps its rhythm. 2026-09-19.
            ...(blockIndex === 0 ? { marginTop: firstBlockLift(block.type) } : null),
            color: TEXT.primary,
            outline: "none",
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        />
      );
    }

    if (block.type === "bullet") {
      const depth = block.indent || 0;
      const hollow = depth % 2 === 1;
      return (
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          suppressContentEditableWarning
          style={{
            contain: "content",
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "2px 0",
            fontSize: EDITOR_FONT_SIZE,
            lineHeight: EDITOR_LINE_HEIGHT,
            paddingLeft: depth * INDENT_PX || undefined,
            // Reaches up to the note's first baseline when it opens the note.
            ...(blockIndex === 0 ? { marginTop: firstBlockLift(block.type) } : null),
          }}
        >
          <span
            contentEditable="false"
            suppressContentEditableWarning
            aria-hidden="true"
            data-marker={hollow ? "hollow" : "filled"}
            style={bulletMarkerStyle(hollow, TEXT.primary)}
          />
          <span
            ref={elRef}
            role="textbox"
            aria-label="Bullet item"
            style={{ color: TEXT.primary, outline: "none", flex: 1 }}
          />
        </div>
      );
    }

    if (block.type === "numbered") {
      return (
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          suppressContentEditableWarning
          style={{
            contain: "content",
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: "2px 0",
            fontSize: EDITOR_FONT_SIZE,
            lineHeight: EDITOR_LINE_HEIGHT,
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
            // Reaches up to the note's first baseline when it opens the note.
            ...(blockIndex === 0 ? { marginTop: firstBlockLift(block.type) } : null),
          }}
        >
          <span
            contentEditable="false"
            suppressContentEditableWarning
            style={{
              color: TEXT.secondary,
              flexShrink: 0,
              fontSize: EDITOR_FONT_SIZE,
              userSelect: "none",
              minWidth: 18,
              textAlign: "right",
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
        </div>
      );
    }

    if (block.type === "checkbox") {
      return (
        <div
          data-block-id={block.id}
          data-block-type={block.type}
          suppressContentEditableWarning
          style={{
            contain: "content",
            display: "flex",
            // Top-aligned, like the bullet and number markers: the box sits on
            // the first line of a wrapped task, not the middle of the block.
            alignItems: "flex-start",
            gap: CHECKBOX_TEXT_GAP,
            padding: "2.5px 0",
            fontSize: EDITOR_FONT_SIZE,
            lineHeight: CHECKBOX_LINE_HEIGHT,
            // Reaches up to the note's first baseline when it opens the note.
            ...(blockIndex === 0 ? { marginTop: firstBlockLift(block.type) } : null),
            paddingLeft: (block.indent || 0) * INDENT_PX || undefined,
          }}
        >
          {/* The hit area, not the drawn box: the same footprint as the square,
              but it never transforms, so the press animation cannot move the
              target out from under the pointer. */}
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
              marginTop: (EDITOR_FONT_SIZE * CHECKBOX_LINE_HEIGHT - CHECKBOX_SIZE) / 2,
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
                transition: "all 0.15s",
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
      prev.numberedIndex === next.numberedIndex &&
      prev.isBlockSelected === next.isBlockSelected &&
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
