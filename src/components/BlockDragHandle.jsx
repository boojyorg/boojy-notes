import { useEffect, useRef, useState } from "react";
import { GripVerticalIcon } from "./Icons";
import { cssZoom } from "../utils/domHelpers";
import { Z } from "../constants/zIndex";

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
 * document until the hand reaches for structure. Deliberately nothing else: no
 * "+" beside it (the slash menu creates blocks), no click menu.
 *
 * One handle rather than one per block, because every block root is a
 * contentEditable and a control inside it would be inside the text. Geometry
 * is measured against an invisible anchor rendered beside the handle, so it is
 * correct whatever positioned ancestor the handle lands in, and it scrolls with
 * the blocks. The handle is absolutely positioned in the gutter, so its
 * appearance never shifts a line of prose. Every rect is in viewport pixels,
 * which under the app's UI scale (`zoom` on `<html>`) are CSS pixels times the
 * scale; the difference is divided by that scale once, where it becomes a
 * style (`cssZoom`). Before this the grip drifted down the note by the scale
 * factor at any setting but 100% (2026-09-10).
 *
 * Desktop-only by design (hover is the discoverability model); the mobile
 * layout does not mount it. Keyboard reorder (Cmd/Ctrl+Shift+↑/↓) is the
 * non-pointer path.
 */
export const HANDLE_W = 20;
export const HANDLE_H = 24;
/** Gap between the grip's right edge and the block's left edge. */
export const HANDLE_GAP = 4;
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
 * line is a row even when it is blank, and a fence opening on one put the grip
 * on the first line with characters in it — two rows down and 40px low
 * (2026-09-19). A divider's rule is the same question: the one row it has.
 */
const OWN_FIRST_ROW = ".code-line, hr";

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

export default function BlockDragHandle({ columnRef, editorRef, startHandleDrag }) {
  const [pos, setPos] = useState(null); // { blockId, top, left } | null
  const rafRef = useRef(null);
  const hoveringHandle = useRef(false);
  const anchorRef = useRef(null);

  useEffect(() => {
    const column = columnRef.current;
    if (!column) return;

    // The frontmatter root is left out: it is the file's head, never lifted
    // and never dropped past (utils/blockOrder), so it gets no grip and the
    // block under it is the first there is to reorder.
    const topLevelBlocks = () => {
      const root = editorRef.current;
      if (!root) return [];
      return Array.from(root.children).filter(
        (el) => el.dataset?.blockId && el.dataset.blockType !== "frontmatter",
      );
    };

    const locate = (clientY) => {
      const els = topLevelBlocks();
      if (els.length < 2) return null; // nothing to reorder
      const anchor = anchorRef.current;
      if (!anchor) return null;
      const origin = anchor.getBoundingClientRect(); // top-left of our containing block
      const zoom = cssZoom(anchor);
      // The block whose vertical band (its top → the next block's top) holds
      // the pointer, so the gaps between blocks belong to the block above.
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        const bottom = i + 1 < els.length ? els[i + 1].getBoundingClientRect().top : r.bottom;
        if (clientY >= r.top && clientY < bottom) {
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
      }
      return null;
    };

    const onMove = (e) => {
      if (document.body.classList.contains("block-dragging")) return;
      if (hoveringHandle.current) return;
      if (rafRef.current) return;
      const { clientY } = e;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const next = locate(clientY);
        setPos((prev) =>
          prev && next && prev.blockId === next.blockId && prev.top === next.top ? prev : next,
        );
      });
    };
    const onLeave = (e) => {
      // Leaving the column onto the handle itself is not leaving.
      if (e.relatedTarget && column.contains(e.relatedTarget)) return;
      if (hoveringHandle.current) return;
      setPos(null);
    };
    // A key unmounts the grip, and an element unmounted while hovered never
    // fires mouseleave: with the pointer resting on the grip, one keystroke
    // (Cmd+Z was the natural one) left `hoveringHandle` true for the life of
    // the mount and every mousemove was ignored from then on — the grip was
    // gone until the next note switch (2026-09-20). Hidden means not hovered.
    const onKey = () => {
      hoveringHandle.current = false;
      setPos(null);
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
  }, [columnRef, editorRef]);

  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }}
      />
      {pos && (
        <div
          className="block-drag-handle"
          data-testid="block-drag-handle"
          data-target-block={pos.blockId}
          aria-hidden="true"
          onMouseEnter={() => {
            hoveringHandle.current = true;
          }}
          onMouseLeave={() => {
            hoveringHandle.current = false;
          }}
          onMouseDown={(e) => {
            // Don't let the editor-scroll mousedown focus/caret logic run.
            e.preventDefault();
            e.stopPropagation();
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startHandleDrag(pos.blockId, e);
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
    </>
  );
}
