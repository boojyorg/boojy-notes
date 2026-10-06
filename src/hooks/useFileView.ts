import { useCallback, useEffect, useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ACTUAL_SIZE,
  FIT_PAGE,
  FIT_WIDTH,
  type FileViewKind,
  fileViewKind,
  pageWidth,
  readFileView,
  stepZoom,
  writeFileView,
  type Zoom,
  zoomPercent,
} from "../utils/fileView";
import { openPdf, pageSizes } from "../utils/pdfDocument";
import { baseName } from "../utils/otherFiles";

/** What to show in the note's place: a vault-relative file, at a page a link asked for. */
export interface OpenFile {
  rel: string;
  /** The page a `#page=N` link asked for; otherwise the page the file was left at. */
  page?: number | null;
  /** Bumped by every opening, so opening the open file again still lands on `page`. */
  seq: number;
}

type Size = { width: number; height: number };

/** The pane's width below which the page column closes itself (its own 152 and room for a page). */
const COLUMN_FITS_AT = 640;

/** The page column is open or not for every PDF alike, in this machine's storage. */
const COLUMN_KEY = "boojy-page-column";
const readColumn = () => {
  try {
    return localStorage.getItem(COLUMN_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * The file shown in the note's place, and everything its top-row controls
 * and its pages share: the zoom, the page, the page column. The pages and
 * the controls live in different components (the chrome row is not the
 * pane), so the state is held once, here.
 *
 * A PDF is read through the vault-guarded `read-vault-file`, parsed by
 * PDF.js and measured page by page; a picture reports its own size once it
 * has loaded (`setNatural`). Every page is drawn at one scale, the first
 * page's, so a mixed document never jumps size between pages. Each file's
 * zoom and page are kept per vault (`writeFileView`).
 */
export function useFileView(open: OpenFile | null, vaultKey: string) {
  const rel = open?.rel ?? null;
  const kind: FileViewKind | null = rel ? fileViewKind(rel) : null;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<Size | null>(null);
  const [zoom, setZoomState] = useState<Zoom>(FIT_WIDTH);
  const [page, setPage] = useState(1);
  // A request to bring `page` into view: the pages scroll on each new value.
  const [scrollSeq, setScrollSeq] = useState(0);
  const [room, setRoom] = useState<Size>({ width: 0, height: 0 });
  const [column, setColumn] = useState(readColumn);
  // The pane's width (the page column closes itself when the pages would be
  // squeezed) and the top-row controls' (the path ends before them).
  const [paneWidth, setPaneWidth] = useState(0);
  const [controlsWidth, setControlsWidth] = useState(0);

  // Opened: the zoom and page it was left at, or the page a link asks for.
  // biome-ignore lint/correctness/useExhaustiveDependencies: an opening (rel, seq) is the trigger
  useEffect(() => {
    if (!rel) return;
    const saved = readFileView(vaultKey, rel);
    setZoomState(saved?.zoom ?? (fileViewKind(rel) === "picture" ? FIT_PAGE : FIT_WIDTH));
    setPage(open?.page ?? saved?.page ?? 1);
    setScrollSeq((s) => s + 1);
  }, [rel, open?.seq, vaultKey]);

  // A PDF's bytes, parsed and measured; the last one let go.
  useEffect(() => {
    setDoc(null);
    setSizes([]);
    setFailed(false);
    setNatural(null);
    if (!rel || kind !== "pdf") return;
    let gone = false;
    let release: (() => Promise<void>) | null = null;
    (async () => {
      try {
        const bytes = await window.electronAPI?.readVaultFile?.(rel);
        if (!bytes) throw new Error("unreadable");
        const opened = await openPdf(bytes);
        release = opened.destroy;
        const measured = await pageSizes(opened.doc);
        if (gone) return;
        setDoc(opened.doc);
        setSizes(measured);
        setPage((p) => Math.min(Math.max(1, p), measured.length));
        setScrollSeq((s) => s + 1);
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      release?.();
    };
  }, [rel, kind]);

  // Kept as the file is left: zoom and page, per vault.
  useEffect(() => {
    if (rel && kind !== "card") writeFileView(vaultKey, rel, { zoom, page });
  }, [rel, kind, vaultKey, zoom, page]);

  const own = kind === "pdf" ? (sizes[0] ?? null) : natural;
  const width = own && room.width > 0 ? pageWidth(zoom, own, room, kind === "picture") : 0;
  const scale = own && width ? width / own.width : 0;
  const percent = own && width ? zoomPercent(width, own.width) : 100;
  const pageCount = sizes.length;

  const setZoom = useCallback((z: Zoom) => setZoomState(z), []);
  const zoomBy = useCallback(
    (dir: 1 | -1) => setZoomState({ mode: "pct", pct: stepZoom(percent, dir) }),
    [percent],
  );
  const goTo = useCallback(
    (n: number) => {
      if (!pageCount) return;
      setPage(Math.min(Math.max(1, Math.round(n)), pageCount));
      setScrollSeq((s) => s + 1);
    },
    [pageCount],
  );
  const toggleColumn = useCallback(() => {
    setColumn((c) => {
      try {
        localStorage.setItem(COLUMN_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  return useMemo(
    () =>
      rel && kind
        ? {
            rel,
            name: baseName(rel),
            kind,
            doc,
            failed,
            sizes,
            pageCount,
            scale,
            zoom,
            percent,
            /** The zoom control's label: a picture fitted says Fit; anything else its percentage. */
            zoomLabel: kind === "picture" && zoom.mode === "fitPage" ? "Fit" : `${percent}%`,
            /** The page has been measured, so the figure means something. */
            zoomKnown: scale > 0,
            setZoom,
            zoomIn: () => zoomBy(1),
            zoomOut: () => zoomBy(-1),
            actualSize: () => setZoomState(ACTUAL_SIZE),
            page,
            /** The page scrolled to by hand: the field follows, nothing scrolls. */
            setPageFromScroll: setPage,
            goTo,
            scrollSeq,
            room,
            setRoom,
            setNatural,
            column,
            /** The column is shown: open, and room for it beside the pages. */
            columnShown: column && (paneWidth === 0 || paneWidth >= COLUMN_FITS_AT),
            /**
             * Whether the toggle is offered at all: not where the column could not
             * fit. Before the pane is measured it is assumed to fit, so the row is
             * drawn whole from the first frame.
             */
            columnFits: paneWidth === 0 || paneWidth >= COLUMN_FITS_AT,
            toggleColumn,
            setPaneWidth,
            controlsWidth,
            setControlsWidth,
          }
        : null,
    [
      rel,
      kind,
      doc,
      failed,
      sizes,
      pageCount,
      scale,
      zoom,
      percent,
      setZoom,
      zoomBy,
      page,
      goTo,
      scrollSeq,
      room,
      column,
      paneWidth,
      controlsWidth,
      toggleColumn,
    ],
  );
}

export type FileViewState = NonNullable<ReturnType<typeof useFileView>>;
