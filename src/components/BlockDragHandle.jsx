import { useEffect, useRef, useState } from "react";
import { GripVerticalIcon } from "./Icons";
import { useDragMode } from "../dev/dragProto";

/**
 * PROTOTYPE ("handle" drag model) — one floating grip for the whole editor.
 *
 * Rather than a handle per block (which would have to live inside each
 * contentEditable root), a single 20×24 control is positioned in the left
 * gutter beside whichever block the pointer is over. It appears on hover,
 * hides the moment a key is pressed, and is invisible while a drag is live,
 * so the document stays a document until the hand reaches for structure.
 *
 * Hover detection listens on `columnRef` (the padded note column, so the
 * gutter counts as hovering). Geometry is measured against an invisible anchor
 * rendered beside the handle, so it is correct whatever positioned ancestor the
 * handle actually lands in, and scrolls with the blocks.
 */
const HANDLE_W = 20;
const HANDLE_H = 24;
const GAP = 4;

export default function BlockDragHandle({ columnRef, editorRef, startHandleDrag }) {
  const mode = useDragMode();
  const [pos, setPos] = useState(null); // { blockId, top, left } | null
  const rafRef = useRef(null);
  const hoveringHandle = useRef(false);
  const anchorRef = useRef(null);

  useEffect(() => {
    if (mode !== "handle") return;
    const column = columnRef.current;
    if (!column) return;

    const topLevelBlocks = () => {
      const root = editorRef.current;
      if (!root) return [];
      return Array.from(root.children).filter((el) => el.dataset?.blockId);
    };

    const locate = (clientY) => {
      const els = topLevelBlocks();
      if (els.length < 2) return null; // nothing to reorder
      const anchor = anchorRef.current;
      if (!anchor) return null;
      const origin = anchor.getBoundingClientRect(); // top-left of our containing block
      // The block whose vertical band (top → next block's top) holds the pointer.
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        const bottom = i + 1 < els.length ? els[i + 1].getBoundingClientRect().top : r.bottom;
        if (clientY >= r.top && clientY < bottom) {
          const lh = parseFloat(getComputedStyle(els[i]).lineHeight);
          const lineBox = Number.isFinite(lh) ? Math.min(lh, r.height) : Math.min(28, r.height);
          const padTop = parseFloat(getComputedStyle(els[i]).paddingTop) || 0;
          return {
            blockId: els[i].dataset.blockId,
            top: r.top - origin.top + padTop + (lineBox - HANDLE_H) / 2,
            // Negative on purpose: the grip lives in the column's left padding.
            left: r.left - origin.left - HANDLE_W - GAP,
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
    const hide = () => {
      if (hoveringHandle.current) return;
      setPos(null);
    };
    const onLeave = (e) => {
      // Leaving the column onto the handle itself is not leaving.
      if (e.relatedTarget && column.contains(e.relatedTarget)) return;
      hide();
    };
    const onKey = () => setPos(null);

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
  }, [mode, columnRef, editorRef]);

  if (mode !== "handle") return null;

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
          data-visible="true"
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
            zIndex: 2,
          }}
        >
          <GripVerticalIcon size={16} />
        </div>
      )}
    </>
  );
}
