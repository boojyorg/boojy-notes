import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useTheme } from "../hooks/useTheme";
import type { FileViewState } from "../hooks/useFileView";
import { cssZoom } from "../utils/domHelpers";
import { loadPdfLib } from "../utils/pdfDocument";
import { PANEL_MS, panelTransition } from "../tokens/motion";

/** Room round the pages: either side, and above the first and below the last. */
export const PAGE_MARGIN_X = 48;
export const PAGE_MARGIN_Y = 24;
/** The gap between two pages. */
export const PAGE_GAP = 16;
/** How far beyond the window a page is drawn ahead of being scrolled to. */
const DRAW_AHEAD = "100% 0px";
/** No canvas bigger than this many device pixels: a 400% page would be hundreds of megabytes. */
const MAX_CANVAS_PIXELS = 16_000_000;
/** A run of size changes (a pinch) is drawn once it rests. */
const REDRAW_REST_MS = 90;
/** The page column's width, and its thumbnails' width inside it. */
export const COLUMN_W = 152;
const THUMB_W = 112;

/** Where each page starts, from the top of the scroller, at `scale`. */
function pageTops(sizes: { height: number }[], scale: number): number[] {
  const tops: number[] = [];
  let y = PAGE_MARGIN_Y;
  for (const s of sizes) {
    tops.push(y);
    y += s.height * scale + PAGE_GAP;
  }
  return tops;
}

/**
 * One page: a canvas drawn at the device's resolution (the UI scale
 * included, so text stays sharp at 125%) and its words laid invisibly over
 * it (PDF.js's TextLayer, `.pdf-text`) so they select and copy. Drawn only
 * when near the window; let go when far, so a long PDF holds a few pages'
 * pixels, not all of them.
 */
const PdfPage = memo(function PdfPage({
  doc,
  n,
  width,
  height,
  scale,
  scroller,
  withText = true,
}: {
  doc: PDFDocumentProxy;
  n: number;
  width: number;
  height: number;
  scale: number;
  scroller: HTMLElement | null;
  withText?: boolean;
}) {
  const { theme } = useTheme();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box || !scroller) return;
    const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: scroller,
      rootMargin: DRAW_AHEAD,
    });
    io.observe(box);
    return () => io.disconnect();
  }, [scroller]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const text = textRef.current;
    if (!canvas) return;
    if (!near || !scale) {
      // Far away: the pixels go; the box keeps its size so nothing moves.
      canvas.width = 0;
      canvas.height = 0;
      if (text) text.replaceChildren();
      return;
    }
    let task: RenderTask | null = null;
    let textLayer: { cancel: () => void } | null = null;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [pdfjs, page] = await Promise.all([loadPdfLib(), doc.getPage(n)]);
      if (cancelled) return;
      const ratio = window.devicePixelRatio * cssZoom(canvas);
      const want = scale * ratio;
      const own = page.getViewport({ scale: 1 });
      const fit = Math.sqrt(MAX_CANVAS_PIXELS / (own.width * own.height));
      const viewport = page.getViewport({ scale: Math.min(want, fit) });
      const drawing = document.createElement("canvas");
      drawing.width = Math.floor(viewport.width);
      drawing.height = Math.floor(viewport.height);
      task = page.render({ canvas: drawing, viewport });
      try {
        await task.promise;
      } catch {
        return; // cancelled by a newer size
      }
      if (cancelled) return;
      // Swapped in whole once drawn, so a redraw never flashes blank.
      canvas.width = drawing.width;
      canvas.height = drawing.height;
      canvas.getContext("2d")?.drawImage(drawing, 0, 0);
      if (!text || !withText) return;
      const layer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text,
        viewport: page.getViewport({ scale }),
      });
      textLayer = layer;
      text.replaceChildren();
      text.style.setProperty("--total-scale-factor", String(scale));
      await layer.render().catch(() => {});
    }, REDRAW_REST_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel();
      textLayer?.cancel();
    };
  }, [near, scale, doc, n, withText]);

  return (
    <div
      ref={boxRef}
      data-pdf-page={n}
      style={{
        position: "relative",
        width,
        height,
        flexShrink: 0,
        background: theme.pageGround,
        boxShadow: `0 0 0 1px ${theme.BG.divider}`,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      {withText && <div ref={textRef} className="pdf-text" />}
    </div>
  );
});

/**
 * The page column: every page small, the one in view ringed in the accent's
 * mark (a picture's selection outline), its number in the corner. A click
 * goes to that page. Thumbnails are drawn as they scroll into view.
 */
function PageColumn({ view }: { view: FileViewState }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const own = view.sizes[0];
  const thumbScale = own ? THUMB_W / own.width : 0;

  // The thumbnail of the page in view stays in the column's view.
  useEffect(() => {
    scroller?.querySelector(`[data-thumb="${view.page}"]`)?.scrollIntoView({ block: "nearest" });
  }, [view.page, scroller]);

  if (!view.doc) return null;
  return (
    <nav
      ref={setScroller}
      aria-label="Pages"
      data-testid="page-column"
      style={{
        width: COLUMN_W,
        minWidth: COLUMN_W,
        flexShrink: 0,
        overflowY: "auto",
        background: BG.editor,
        borderRight: `1px solid ${BG.divider}`,
        padding: "10px 0",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      {view.sizes.map((s, i) => {
        const n = i + 1;
        const current = n === view.page;
        return (
          <button
            key={n}
            type="button"
            data-thumb={n}
            aria-label={`Page ${n}`}
            aria-current={current ? "page" : undefined}
            onClick={() => view.goTo(n)}
            style={{
              position: "relative",
              padding: 0,
              border: "none",
              background: "none",
              cursor: "pointer",
              borderRadius: 2,
              outline: current ? `2px solid ${ACCENT.primary}` : "none",
              outlineOffset: 2,
            }}
          >
            <PdfPage
              doc={view.doc as PDFDocumentProxy}
              n={n}
              width={s.width * thumbScale}
              height={s.height * thumbScale}
              scale={thumbScale}
              scroller={scroller}
              withText={false}
            />
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: 4,
                bottom: 4,
                padding: "0 4px",
                borderRadius: 4,
                fontSize: 10.5,
                lineHeight: "15px",
                fontVariantNumeric: "tabular-nums",
                color: TEXT.secondary,
                background: BG.elevated,
                boxShadow: `0 0 0 1px ${BG.divider}`,
              }}
            >
              {n}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/**
 * The page column as a panel: it slides open and shut on the sidebar's clock
 * (its width, `.panel-motion`, so Reduce Motion snaps it), and its pages stay
 * while it slides out, then go, so a closed column draws nothing.
 */
function PageColumnPanel({ view }: { view: FileViewState }) {
  const shown = view.columnShown;
  const [held, setHeld] = useState(shown);
  useEffect(() => {
    if (shown) {
      setHeld(true);
      return;
    }
    const t = setTimeout(() => setHeld(false), PANEL_MS);
    return () => clearTimeout(t);
  }, [shown]);
  // Open from the first frame when the file opens with the column on: only a
  // press of the toggle slides it.
  const [slides, setSlides] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setSlides(true));
    return () => cancelAnimationFrame(t);
  }, []);
  return (
    <div
      className="panel-motion"
      style={{
        width: shown ? COLUMN_W : 0,
        flexShrink: 0,
        overflow: "hidden",
        display: "flex",
        transition: slides ? panelTransition("width") : "none",
      }}
    >
      {(shown || held) && <PageColumn view={view} />}
    </div>
  );
}

/**
 * A PDF in the note's place: its pages in one column on the faint ground,
 * one scale for all, and the page column beside them when it is open. The
 * page in view drives the field in the top row; the field, the column and the
 * keys drive the scroll. ←/→, Page Up/Down and Space step a page (the pages
 * take the keys as they open, as a note's text takes the caret); ↑/↓ scroll.
 * A pinch or ⌘-scroll zooms the PDF, never the app (⌘± is the UI scale).
 */
export default function PdfView({ view }: { view: FileViewState }) {
  const { theme } = useTheme();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [pane, setPane] = useState<HTMLDivElement | null>(null);
  const { setPaneWidth } = view;

  // The whole pane's width, column included: whether the column still fits.
  useEffect(() => {
    if (!pane) return;
    const measure = () => setPaneWidth(pane.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(pane);
    return () => ro.disconnect();
  }, [pane, setPaneWidth]);
  const { sizes, scale, page, scrollSeq, setRoom, goTo, setPageFromScroll } = view;
  const tops = pageTops(sizes, scale);
  const topsRef = useRef(tops);
  topsRef.current = tops;
  const pageRef = useRef(page);
  pageRef.current = page;
  // When the app last scrolled the pages itself (a page gone to, a zoom
  // held in place): that scroll is not the reader's, so it never re-reads
  // the page. Near the end the last pages cannot reach the top, and reading
  // the page back from where the scroll stopped would undo the jump.
  const ownScrollAt = useRef(0);
  const scrollPagesTo = useCallback((el: HTMLElement, top: number) => {
    ownScrollAt.current = performance.now();
    el.scrollTop = top;
  }, []);

  // The room the pages have, re-read as the pane resizes (CSS pixels).
  useEffect(() => {
    if (!scroller) return;
    const measure = () =>
      setRoom({
        width: scroller.clientWidth - 2 * PAGE_MARGIN_X,
        height: scroller.clientHeight - 2 * PAGE_MARGIN_Y,
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, setRoom]);

  // Taken to a page (opened, the field, the keys, a thumbnail): its top at the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a request (scrollSeq) or a first scale is the trigger
  useLayoutEffect(() => {
    if (!scroller || !scale) return;
    scrollPagesTo(
      scroller,
      Math.max(0, (topsRef.current[pageRef.current - 1] ?? 0) - PAGE_MARGIN_Y),
    );
  }, [scrollSeq, scroller, scale > 0]);

  // Zoomed: the same place on the same page stays under the eye.
  const lastScale = useRef(scale);
  useLayoutEffect(() => {
    const prev = lastScale.current;
    lastScale.current = scale;
    if (!scroller || !prev || !scale || prev === scale) return;
    const p = pageRef.current - 1;
    const prevTop = pageTops(sizes, prev)[p] ?? 0;
    const into = (scroller.scrollTop - prevTop) * (scale / prev);
    scrollPagesTo(scroller, (topsRef.current[p] ?? 0) + into);
  }, [scale, scroller, sizes, scrollPagesTo]);

  // The pages take the keys as the file opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a file opened is the trigger
  useEffect(() => {
    if (!scroller) return;
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      !active.closest("input, textarea, [contenteditable]")
    )
      scroller.focus({ preventScroll: true });
  }, [scroller, view.rel]);

  // A pinch (Chromium sends it as a ⌘/Ctrl wheel) zooms the PDF, smoothly.
  const percentRef = useRef(view.percent);
  percentRef.current = view.percent;
  useEffect(() => {
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = percentRef.current * Math.exp(-e.deltaY * 0.01);
      view.setZoom({ mode: "pct", pct: Math.round(Math.min(400, Math.max(25, next))) });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [scroller, view.setZoom]);

  // The page in view: the last whose top has passed a line a third of the way
  // down, or the last page once the scroll can go no further.
  const onScroll = () => {
    if (!scroller || performance.now() - ownScrollAt.current < 200) return;
    const line = scroller.scrollTop + scroller.clientHeight * 0.3;
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    let n = 1;
    for (let i = 0; i < topsRef.current.length; i++) if (topsRef.current[i] <= line) n = i + 1;
    if (atEnd) n = topsRef.current.length;
    if (n !== pageRef.current) setPageFromScroll(n);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    const next =
      e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)
        ? page + 1
        : e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)
          ? page - 1
          : e.key === "Home"
            ? 1
            : e.key === "End"
              ? view.pageCount
              : null;
    if (next === null) return;
    e.preventDefault();
    goTo(next);
  };

  if (view.failed) {
    return (
      <div role="status" style={{ padding: 40, color: theme.TEXT.muted, fontSize: 14 }}>
        This PDF couldn’t be opened.
      </div>
    );
  }
  return (
    <div
      ref={setPane}
      style={{ flex: 1, minHeight: 0, display: "flex", background: theme.BG.surface }}
    >
      <PageColumnPanel view={view} />
      <div
        ref={setScroller}
        data-testid="pdf-pages"
        role="document"
        aria-label={view.name}
        // A Tab stop: the pages take the page keys.
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "auto",
          // The lane is kept whether the pages overflow or not, so the room,
          // and the fit, never change as the first pages arrive.
          scrollbarGutter: "stable",
          outline: "none",
          display: "flex",
          flexDirection: "column",
          // Safe: a page zoomed wider than the pane scrolls to its left edge
          // instead of overflowing off it.
          alignItems: "safe center",
          gap: PAGE_GAP,
          padding: `${PAGE_MARGIN_Y}px ${PAGE_MARGIN_X}px`,
          boxSizing: "border-box",
        }}
      >
        {view.doc &&
          scale > 0 &&
          sizes.map((s, i) => (
            <PdfPage
              // biome-ignore lint/suspicious/noArrayIndexKey: pages are positional
              key={i}
              doc={view.doc as PDFDocumentProxy}
              n={i + 1}
              width={s.width * scale}
              height={s.height * scale}
              scale={scale}
              scroller={scroller}
            />
          ))}
      </div>
    </div>
  );
}
