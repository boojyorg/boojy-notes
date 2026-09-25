import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Z } from "../constants/zIndex";
import { useTheme } from "../hooks/useTheme";
import { cssZoom } from "../utils/domHelpers";
import { dropIndex } from "../utils/tableShape";
import { GripHorizontalIcon, GripVerticalIcon } from "./Icons";

export type HandleKind = "row" | "col";
export interface HandleTarget {
  kind: HandleKind;
  index: number;
}
/** Where a grip's menu hangs: viewport pixels, as `useMenuPosition` takes them. */
export interface MenuAnchor {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A grip's long and short sides: a row's stands upright, a column's lies flat. */
const GRIP_LONG = 24;
const GRIP_SHORT = 14;
/** Travel before a press on a grip becomes a drag (below it, the press is a click). */
const DRAG_START = 4;
/** The selection outline and the carried copy's, and the drop line's thickness. */
const RING = 2;
const LINE = 3;
/** The carried copy's opacity: enough to read it, enough to see what it is over. */
const GHOST_OPACITY = 0.9;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
interface Grip {
  target: HandleTarget;
  left: number;
  top: number;
}
interface Drag {
  target: HandleTarget;
  x0: number;
  y0: number;
  moved: boolean;
  spans: [number, number][];
  offset: number;
  to: number;
  ghost: HTMLDivElement | null;
  lifted: HTMLElement[];
}

const sameTarget = (a: HandleTarget | null | undefined, b: HandleTarget | null | undefined) =>
  !!a && !!b && a.kind === b.kind && a.index === b.index;

function rowsOf(table: HTMLTableElement): HTMLTableRowElement[] {
  return Array.from(table.rows).filter((r) => !r.classList.contains("table-preview-row"));
}

/** The table's own rows and columns in viewport pixels, and the scroller's visible edges. */
function measure(root: HTMLElement, table: HTMLTableElement) {
  const o = root.getBoundingClientRect();
  const z = cssZoom(root);
  const rows = rowsOf(table);
  const rowRects = rows.map((r) => r.getBoundingClientRect());
  const colRects = rows[0] ? Array.from(rows[0].cells).map((c) => c.getBoundingClientRect()) : [];
  const sc = (table.parentElement ?? table).getBoundingClientRect();
  return { o, z, rows, rowRects, colRects, sc, table: table.getBoundingClientRect() };
}
type Geometry = ReturnType<typeof measure>;

/**
 * A row's or column's box in the root's CSS pixels (measured rects are
 * already scaled by the UI's `zoom`, so they are divided by it), clipped
 * sideways to what the scroller shows.
 */
function boxOf(g: Geometry, t: HandleTarget): Box | null {
  const first = g.rowRects[0];
  const last = g.rowRects[g.rowRects.length - 1];
  const r = t.kind === "row" ? g.rowRects[t.index] : g.colRects[t.index];
  if (!r || !first || !last) return null;
  const left = Math.max(t.kind === "row" ? first.left : r.left, g.sc.left);
  const right = Math.min(t.kind === "row" ? g.table.right : r.right, g.sc.right);
  if (right - left < 1) return null;
  const top = t.kind === "row" ? r.top : first.top;
  const bottom = t.kind === "row" ? r.bottom : last.bottom;
  return {
    left: (left - g.o.left) / g.z,
    top: (top - g.o.top) / g.z,
    width: (right - left) / g.z,
    height: (bottom - top) / g.z,
  };
}

/** A grip sits across the table's edge: a row's on the left edge, a column's on the top. */
function gripOf(g: Geometry, t: HandleTarget): Grip | null {
  const b = boxOf(g, t);
  if (!b) return null;
  if (t.kind === "row") {
    // A row's grip rides the grid's left edge, which scrolls away with the grid.
    const edge = (g.rowRects[0].left - g.o.left) / g.z;
    if (edge < (g.sc.left - g.o.left) / g.z - 1) return null;
    return { target: t, left: edge - GRIP_SHORT / 2, top: b.top + b.height / 2 - GRIP_LONG / 2 };
  }
  return { target: t, left: b.left + b.width / 2 - GRIP_LONG / 2, top: b.top - GRIP_SHORT / 2 };
}

/**
 * The table's row and column grips (Notion's), drawn on a layer over the
 * table's root rather than inside the scroller, which would clip them. They
 * show only on the table's edges: a pointer in the first column, or in the
 * margin beside it, shows that row's grip; one in the header row shows that
 * column's. Middle cells show none.
 *
 * A press that stays put is a click and opens the grip's menu (the owner
 * draws it just under the grip, and hands the target back as `selection`,
 * outlined here). A
 * press that travels carries the row or column: its see-through copy follows
 * the pointer wearing the outline, the slot it left stays empty, and a line marks where
 * it lands. It passes a neighbour once its leading edge crosses that
 * neighbour's middle (`dropIndex`). Nothing is written until the drop, and a
 * drop where it started writes nothing; Escape, blur or a cancelled pointer
 * put it back.
 */
export default function TableHandles({
  rootRef,
  tableRef,
  selection,
  shapeKey,
  onOpenMenu,
  onMove,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  tableRef: RefObject<HTMLTableElement | null>;
  selection: HandleTarget | null;
  /** Changes whenever the table's shape or content does, so the grips are measured again. */
  shapeKey: unknown;
  onOpenMenu: (target: HandleTarget, anchor: MenuAnchor) => void;
  onMove: (kind: HandleKind, from: number, to: number) => void;
}) {
  const { theme } = useTheme() as {
    theme: {
      BG: Record<string, string>;
      TEXT: Record<string, string>;
      ACCENT: Record<string, string>;
      button: { border: string };
      dragShadow: string;
      floatShadow: string;
    };
  };
  const [hover, setHover] = useState<{ row: number | null; col: number | null }>({
    row: null,
    col: null,
  });
  const [grips, setGrips] = useState<Grip[]>([]);
  const [active, setActive] = useState<{ box: Box; grip: Grip | null } | null>(null);
  const [dragView, setDragView] = useState<{ target: HandleTarget; line: Box | null } | null>(null);
  const drag = useRef<Drag | null>(null);

  const geometry = useCallback(() => {
    const root = rootRef.current;
    const table = tableRef.current;
    return root && table ? measure(root, table) : null;
  }, [rootRef, tableRef]);

  // The grips the hovered cell asks for, measured now.
  useLayoutEffect(() => {
    void shapeKey;
    const g = geometry();
    if (!g || hover.row === null || hover.col === null) {
      setGrips([]);
      return;
    }
    const wanted: HandleTarget[] = [];
    if (hover.col === 0) wanted.push({ kind: "row", index: hover.row });
    if (hover.row === 0) wanted.push({ kind: "col", index: hover.col });
    setGrips(wanted.map((t) => gripOf(g, t)).filter((x): x is Grip => !!x));
  }, [hover, shapeKey, geometry]);

  // The row or column the owner's menu is open for: outlined, its grip lit.
  useLayoutEffect(() => {
    void shapeKey;
    const g = selection && geometry();
    const box = g && selection ? boxOf(g, selection) : null;
    setActive(g && selection && box ? { box, grip: gripOf(g, selection) } : null);
  }, [selection, shapeKey, geometry]);

  // Hover: which cell the pointer is over, or the margin left of the grid.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const set = (row: number | null, col: number | null) =>
      setHover((h) => (h.row === row && h.col === col ? h : { row, col }));
    const onPointerMove = (e: PointerEvent) => {
      if (drag.current) return;
      const t = e.target as Element | null;
      if (!t?.closest || t.closest("[data-table-grip]")) return;
      const table = tableRef.current;
      const cell = t.closest("th, td") as HTMLTableCellElement | null;
      if (table && cell && table.contains(cell) && !cell.closest(".table-preview-row")) {
        set((cell.parentElement as HTMLTableRowElement).rowIndex, cell.cellIndex);
      } else if (table && t.closest(".table-left-zone")) {
        const k = rowsOf(table).findIndex((r) => {
          const b = r.getBoundingClientRect();
          return e.clientY >= b.top && e.clientY < b.bottom;
        });
        set(k === -1 ? null : k, k === -1 ? null : 0);
      } else {
        set(null, null);
      }
    };
    const onPointerLeave = () => {
      if (!drag.current) set(null, null);
    };
    // A scrolled grid moves its columns under the grips: hide them until the pointer moves.
    const scroller = tableRef.current?.parentElement;
    const onScroll = () => set(null, null);
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", onPointerLeave);
    scroller?.addEventListener("scroll", onScroll);
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      scroller?.removeEventListener("scroll", onScroll);
    };
  }, [rootRef, tableRef]);

  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    d.ghost?.remove();
    for (const el of d.lifted) el.classList.remove("table-cell-lifted");
    setDragView(null);
  }, []);

  useEffect(() => endDrag, [endDrag]);

  // While carrying, Escape and a lost window put the row or column back.
  useEffect(() => {
    if (!dragView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      endDrag();
    };
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", endDrag);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", endDrag);
    };
  }, [dragView, endDrag]);

  /** Lift the row or column: its copy goes on the layer, its own cells go blank. */
  const lift = (d: Drag, g: Geometry) => {
    const { kind, index } = d.target;
    const ghost = document.createElement("div");
    ghost.setAttribute("aria-hidden", "true");
    ghost.className = "table-drag-ghost";
    const copy = document.createElement("table");
    copy.className = "table-block";
    Object.assign(copy.style, { tableLayout: "fixed", minWidth: "0", margin: "0" });
    const body = document.createElement("tbody");
    copy.appendChild(body);
    const cellCopy = (cell: HTMLTableCellElement, width: number) => {
      const c = cell.cloneNode(true) as HTMLElement;
      c.removeAttribute("contenteditable");
      c.removeAttribute("data-inline-field");
      Object.assign(c.style, { width: `${width}px`, minWidth: "0", boxSizing: "border-box" });
      return c;
    };
    let box: Box;
    if (kind === "row") {
      const tr = g.rows[index];
      const line = document.createElement("tr");
      for (const cell of Array.from(tr.cells)) {
        line.appendChild(cellCopy(cell, cell.getBoundingClientRect().width / g.z));
        d.lifted.push(cell);
      }
      body.appendChild(line);
      copy.style.width = `${g.table.width / g.z}px`;
      copy.style.marginLeft = `${(g.table.left - g.sc.left) / g.z}px`;
      box = {
        left: (g.sc.left - g.o.left) / g.z,
        top: (g.rowRects[index].top - g.o.top) / g.z,
        width: g.sc.width / g.z,
        height: g.rowRects[index].height / g.z,
      };
    } else {
      const width = g.colRects[index].width / g.z;
      g.rows.forEach((tr, r) => {
        const line = document.createElement("tr");
        line.style.height = `${g.rowRects[r].height / g.z}px`;
        const cell = tr.cells[index];
        if (cell) {
          line.appendChild(cellCopy(cell, width));
          d.lifted.push(cell);
        }
        body.appendChild(line);
      });
      copy.style.width = `${width}px`;
      box = {
        left: (g.colRects[index].left - g.o.left) / g.z,
        top: (g.rowRects[0].top - g.o.top) / g.z,
        width,
        height: (g.table.height || 0) / g.z,
      };
    }
    // The copy is see-through, so the rows it passes over show beneath it;
    // its outline, on the frame around it, stays solid.
    Object.assign(copy.style, { background: theme.BG.editor, opacity: String(GHOST_OPACITY) });
    ghost.appendChild(copy);
    Object.assign(ghost.style, {
      position: "absolute",
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      overflow: "hidden",
      boxShadow: theme.dragShadow,
      outline: `${RING}px solid ${theme.ACCENT.primary}`,
      outlineOffset: `-${RING / 2}px`,
      pointerEvents: "none",
      zIndex: String(Z.ELEMENT_OVERLAY),
    });
    rootRef.current?.appendChild(ghost);
    for (const el of d.lifted) el.classList.add("table-cell-lifted");
    d.ghost = ghost;
  };

  const onGripDown = (target: HandleTarget) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    // The press never takes focus from the cell or moves the caret.
    e.preventDefault();
    e.stopPropagation();
    // The grip keeps the pointer for the whole carry, wherever it goes.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the carry still works while over the grip.
    }
    drag.current = {
      target,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      spans: [],
      offset: 0,
      to: target.index,
      ghost: null,
      lifted: [],
    };
  };

  const onGripMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    const g = geometry();
    if (!d || !g) return;
    const rowWise = d.target.kind === "row";
    const at = rowWise ? e.clientY : e.clientX;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_START) return;
      d.moved = true;
      const rects = rowWise ? g.rowRects : g.colRects;
      d.spans = rects.map((r) => (rowWise ? [r.top, r.bottom] : [r.left, r.right]));
      d.offset = (rowWise ? d.y0 : d.x0) - d.spans[d.target.index][0];
      lift(d, g);
      setDragView({ target: d.target, line: null });
    }
    const [s0, s1] = d.spans[d.target.index];
    const start = at - d.offset;
    const shift = (start - s0) / g.z;
    if (d.ghost)
      d.ghost.style.transform = rowWise ? `translateY(${shift}px)` : `translateX(${shift}px)`;
    const to = dropIndex(d.spans, d.target.index, start, start + (s1 - s0));
    if (to === d.to) return;
    d.to = to;
    let line: Box | null = null;
    if (to !== d.target.index) {
      const edge = to > d.target.index ? d.spans[to][1] : d.spans[to][0];
      line = rowWise
        ? {
            left: (g.sc.left - g.o.left) / g.z,
            top: (edge - g.o.top) / g.z - LINE / 2,
            width: g.sc.width / g.z,
            height: LINE,
          }
        : {
            left: (edge - g.o.left) / g.z - LINE / 2,
            top: (g.table.top - g.o.top) / g.z,
            width: LINE,
            height: g.table.height / g.z,
          };
    }
    setDragView({ target: d.target, line });
  };

  const onGripUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    if (d.moved) {
      endDrag();
      if (d.to !== d.target.index) onMove(d.target.kind, d.target.index, d.to);
      return;
    }
    drag.current = null;
    openMenu(d.target, e.currentTarget);
  };

  /** The grip's menu, hung from the grip: a click, and a right-click too. */
  const openMenu = (target: HandleTarget, gripEl: HTMLElement) => {
    const g = geometry();
    if (!g) return;
    const grip = gripEl.getBoundingClientRect();
    const r = target.kind === "row" ? g.rowRects[target.index] : g.colRects[target.index];
    if (!r) return;
    // The menu hangs from the grip, its left edge on the grip's (Notion's
    // placement): a row's under the row, a column's just under the grip.
    onOpenMenu(
      target,
      target.kind === "row"
        ? { top: r.top, bottom: r.bottom, left: grip.left, right: grip.right }
        : { top: grip.top, bottom: grip.bottom, left: grip.left, right: grip.right },
    );
  };

  const carried = dragView?.target ?? null;
  const lit = carried ?? (active ? selection : null);
  const shown: Grip[] = [];
  if (carried) {
    const g = geometry();
    const grip = g && gripOf(g, carried);
    if (grip) shown.push(grip);
  } else {
    if (active?.grip) shown.push(active.grip);
    for (const grip of grips) if (!sameTarget(grip.target, selection)) shown.push(grip);
  }

  return (
    <>
      {active && !carried && (
        <div
          className="table-selection-outline"
          style={{
            position: "absolute",
            left: active.box.left - RING / 2,
            top: active.box.top - RING / 2,
            width: active.box.width + RING,
            height: active.box.height + RING,
            boxSizing: "border-box",
            border: `${RING}px solid ${theme.ACCENT.primary}`,
            borderRadius: 3,
            pointerEvents: "none",
            zIndex: Z.ELEMENT_OVERLAY,
          }}
        />
      )}
      {dragView?.line && (
        <div
          className="table-drop-line"
          style={{
            position: "absolute",
            ...dragView.line,
            borderRadius: LINE,
            background: theme.ACCENT.primary,
            pointerEvents: "none",
            zIndex: Z.ELEMENT_OVERLAY,
          }}
        />
      )}
      {shown.map((grip) => {
        const on = sameTarget(grip.target, lit);
        const row = grip.target.kind === "row";
        return (
          <button
            key={`${grip.target.kind}-${grip.target.index}`}
            type="button"
            tabIndex={-1}
            data-table-grip={grip.target.kind}
            aria-label={row ? "Row options, or drag to move" : "Column options, or drag to move"}
            onPointerDown={onGripDown(grip.target)}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={endDrag}
            // A right-click on a grip is its menu, as on any Mac control;
            // claimed so the note's text menu never opens over a handle.
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openMenu(grip.target, e.currentTarget);
            }}
            style={{
              position: "absolute",
              left: grip.left,
              top: grip.top,
              width: row ? GRIP_SHORT : GRIP_LONG,
              height: row ? GRIP_LONG : GRIP_SHORT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              margin: 0,
              boxSizing: "border-box",
              borderRadius: 5,
              border: `1px solid ${on ? theme.ACCENT.primary : theme.button.border}`,
              background: on ? theme.ACCENT.primary : theme.BG.elevated,
              color: on ? theme.ACCENT.onAccent : theme.TEXT.muted,
              boxShadow: theme.floatShadow,
              cursor: carried ? "grabbing" : "grab",
              touchAction: "none",
              zIndex: Z.ELEMENT_OVERLAY,
            }}
          >
            {row ? <GripVerticalIcon size={12} /> : <GripHorizontalIcon size={12} />}
          </button>
        );
      })}
    </>
  );
}
