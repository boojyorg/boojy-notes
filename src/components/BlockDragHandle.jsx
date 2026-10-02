import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripVerticalIcon } from "./Icons";
import { cssZoom } from "../utils/domHelpers";
import { Z } from "../constants/zIndex";
import { Tooltip, useTooltip } from "./Tooltip";

/**
 * The block drag handle — one floating grip for the whole editor.
 *
 * Text is for writing and selecting; this is for moving. Nothing is rendered
 * at rest. Move the pointer over a block (or the gutter beside it) and a 16px
 * grip of six filled dots fades in at the column's left padding, aligned to the
 * block's first line. Hovering the grip itself only lifts its ink — there is no
 * hover surface; the gutter stays part of the page. Press it and move to drag
 * (`startHandleDrag` in useBlockDrag, which commits on drop). It hides
 * the moment a key is pressed and while a drag is live, so the note stays a
 * document until the hand reaches for structure. A press released without
 * moving selects the block and opens its menu (`onGripClick`, BlockMenu;
 * Shift extends the run instead), and the grip names both gestures in its chip. No "+" beside it: the keyboard and
 * the slash menu create blocks.
 *
 * One handle rather than one per block, because every block root is a
 * contentEditable and a control inside it would be inside the text. Geometry
 * is measured against an invisible anchor rendered beside the handle, so it is
 * correct whatever positioned ancestor the handle lands in, and it scrolls with
 * the blocks. The handle is absolutely positioned in the gutter, so its
 * appearance never shifts a line of prose. Every rect is in viewport pixels,
 * which under the app's UI scale (`zoom` on `<html>`) are CSS pixels times the
 * scale; the difference is divided by that scale once, where it becomes a
 * style (`cssZoom`), or the grip would drift by the scale factor.
 *
 * Hover is the discoverability model; keyboard reorder (Cmd/Ctrl+Shift+↑/↓)
 * is the non-pointer path.
 */
export const HANDLE_W = 20;
export const HANDLE_H = 24;
/**
 * Gap between the grip's right edge and the block's left edge: clear of the
 * selection band, which reaches 4px past the text, so the pressed grip and a
 * selected block never touch.
 */
export const HANDLE_GAP = 8;
/**
 * A table's own row grips sit across its left edge, 7px out; beside a table
 * the block's grip stands this much further off so the two never touch.
 */
export const TABLE_GRIP_CLEARANCE = 14;

/**
 * The first line box of a block: the rect of its first rendered text line
 * (so headings, list rows, quotes and callouts all centre the grip on the line
 * the eye reads first); otherwise the element's own line-height, for empty
 * blocks and media that have no text line. Always viewport pixels: the
 * computed line-height and padding are CSS pixels and are scaled by `zoom` to
 * match.
 *
 * A block that draws its own rows is asked first, because the text walk below
 * skips whitespace and a row of its own may hold none: a code block's first
 * line is a row even when it is blank. A divider's rule is the same question: the one row it has.
 */
const OWN_FIRST_ROW = ".code-line, hr";

const MODIFIER_KEYS = new Set(["Shift", "Meta", "Control", "Alt"]);

/** What the grip's chip says: the gesture, then what it does. */
const GRIP_GESTURES = [
  ["Drag", "to move"],
  ["Click", "for options"],
];

function firstLineRect(el, zoom) {
  const ownRow = el.querySelector(OWN_FIRST_ROW);
  if (ownRow) return ownRow.getBoundingClientRect();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
  });
  const text = walker.nextNode();
  if (text) {
    const range = document.createRange();
    range.selectNodeContents(text);
    // jsdom has no Range.getClientRects; the fallback below covers it.
    const rects = typeof range.getClientRects === "function" ? range.getClientRects() : [];
    if (rects.length) return rects[0];
  }
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const lh = parseFloat(cs.lineHeight);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const line = (Number.isFinite(lh) ? lh : 28) * zoom;
  return { top: r.top + padTop * zoom, height: Math.min(line, r.height || line) };
}

/**
 * The frontmatter root is left out: it is the file's head, never lifted and
 * never dropped past (utils/blockOrder), so it gets no grip and the block
 * under it is the first there is to reorder.
 */
function topLevelBlocks(root) {
  if (!root) return [];
  return Array.from(root.children).filter(
    (el) => el.dataset?.blockId && el.dataset.blockType !== "frontmatter",
  );
}

/** Where the grip stands beside `els[i]`, in the anchor's CSS pixels. */
function gripAt(els, i, anchor) {
  const origin = anchor.getBoundingClientRect(); // top-left of our containing block
  const zoom = cssZoom(anchor);
  const r = els[i].getBoundingClientRect();
  const line = firstLineRect(els[i], zoom);
  return {
    blockId: els[i].dataset.blockId,
    top: (line.top - origin.top) / zoom + (line.height / zoom - HANDLE_H) / 2,
    // Negative on purpose: the grip lives in the column's left padding.
    left:
      (r.left - origin.left) / zoom -
      HANDLE_W -
      HANDLE_GAP -
      (els[i].dataset.blockType === "table" ? TABLE_GRIP_CLEARANCE : 0),
  };
}

export default function BlockDragHandle({
  columnRef,
  editorRef,
  startHandleDrag,
  onGripClick,
  // The selected block's grip stays up, pressed, until the selection ends
  // (Notion's): the grip the menu hangs from, wherever the pointer goes.
  pinnedBlockId,
  // Changes when the blocks do, so a pinned grip follows its block.
  pinKey,
}) {
  const [pos, setPos] = useState(null); // { blockId, top, left } | null
  const [gripEl, setGripEl] = useState(null);
  const tip = useTooltip();
  // Read by the key listener below, registered once: a hidden grip hides its chip.
  const hideTip = useRef(null);
  hideTip.current = tip.handlers.onMouseLeave;
  const rafRef = useRef(null);
  const hoveringHandle = useRef(false);
  const anchorRef = useRef(null);
  const pinnedRef = useRef(null);
  pinnedRef.current = pinnedBlockId ?? null;
  // Whether the pointer is over the column: an unpinned grip hides only when it isn't.
  const pointerIn = useRef(false);

  // The pinned block's grip, or null.
  const pinnedPos = useCallback(() => {
    const id = pinnedRef.current;
    const els = topLevelBlocks(editorRef.current);
    const i = els.findIndex((el) => el.dataset.blockId === id);
    if (!id || i < 0 || els.length < 2 || !anchorRef.current) return null;
    return gripAt(els, i, anchorRef.current);
  }, [editorRef]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pinKey is the signal that the blocks moved
  useLayoutEffect(() => {
    if (hoveringHandle.current) return;
    const pinned = pinnedPos();
    if (pinned) setPos(pinned);
    else if (!pointerIn.current) setPos(null);
  }, [pinnedBlockId, pinKey, pinnedPos]);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;

    const locate = (clientY) => {
      const els = topLevelBlocks(editorRef.current);
      if (els.length < 2) return null; // nothing to reorder
      const anchor = anchorRef.current;
      if (!anchor) return null;
      // The block whose vertical band (its top → the next block's top) holds
      // the pointer, so the gaps between blocks belong to the block above.
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        const bottom = i + 1 < els.length ? els[i + 1].getBoundingClientRect().top : r.bottom;
        if (clientY >= r.top && clientY < bottom) return gripAt(els, i, anchor);
      }
      return null;
    };

    const onMove = (e) => {
      pointerIn.current = true;
      if (document.body.classList.contains("block-dragging")) return;
      if (hoveringHandle.current) return;
      if (rafRef.current) return;
      const { clientY } = e;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const next = locate(clientY) ?? pinnedPos();
        setPos((prev) =>
          prev && next && prev.blockId === next.blockId && prev.top === next.top ? prev : next,
        );
      });
    };
    const onLeave = (e) => {
      // Leaving the column onto the handle itself is not leaving.
      if (e.relatedTarget && column.contains(e.relatedTarget)) return;
      pointerIn.current = false;
      if (hoveringHandle.current) return;
      setPos(pinnedPos());
    };
    // A key unmounts the grip, and an element unmounted while hovered never
    // fires mouseleave: with the pointer resting on the grip, one keystroke
    // would leave `hoveringHandle` true and every later mousemove ignored.
    // Hidden means not hovered.
    const onKey = (e) => {
      // A modifier alone is the hand getting ready to Shift-click the grip.
      if (MODIFIER_KEYS.has(e.key)) return;
      hoveringHandle.current = false;
      hideTip.current?.();
      setPos(pinnedPos());
    };

    column.addEventListener("mousemove", onMove);
    column.addEventListener("mouseleave", onLeave);
    column.addEventListener("keydown", onKey, true);
    return () => {
      column.removeEventListener("mousemove", onMove);
      column.removeEventListener("mouseleave", onLeave);
      column.removeEventListener("keydown", onKey, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [columnRef, editorRef, pinnedPos]);

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}
      />
      {pos && (
        <div
          ref={setGripEl}
          className="block-drag-handle"
          data-testid="block-drag-handle"
          data-target-block={pos.blockId}
          data-pressed={pos.blockId === pinnedBlockId || undefined}
          // A press here keeps a selection (Shift-click extends it).
          data-selection-surface
          aria-hidden="true"
          onMouseEnter={() => {
            hoveringHandle.current = true;
            tip.handlers.onMouseEnter();
          }}
          onMouseLeave={() => {
            hoveringHandle.current = false;
            tip.handlers.onMouseLeave();
          }}
          onMouseDown={(e) => {
            // Don't let the editor-scroll mousedown focus/caret logic run.
            e.preventDefault();
            e.stopPropagation();
            tip.handlers.onMouseDown();
          }}
          onMouseUp={tip.handlers.onMouseUp}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // A prevented pointerdown sends no mousedown, so the chip is told here.
            tip.handlers.onMouseDown();
            const { blockId } = pos;
            const extend = e.shiftKey;
            const grip = e.currentTarget.getBoundingClientRect();
            startHandleDrag(blockId, e, () => onGripClick?.(blockId, extend, grip));
          }}
          onContextMenu={(e) => {
            // The same menu as a click, as the table's grips do.
            e.preventDefault();
            e.stopPropagation();
            tip.handlers.onMouseDown();
            onGripClick?.(pos.blockId, false, e.currentTarget.getBoundingClientRect());
          }}
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            width: HANDLE_W,
            height: HANDLE_H,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "grab",
            userSelect: "none",
            // Over the table's row strip, which shares the grip's footprint.
            zIndex: Z.BLOCK_HANDLE,
          }}
        >
          <GripVerticalIcon size={16} />
        </div>
      )}
      {pos && tip.shown && (
        <Tooltip
          label="Drag to move, click for options"
          lines={GRIP_GESTURES}
          anchor={gripEl}
          placement="below"
          testId="grip-tooltip"
        />
      )}
    </>
  );
}
