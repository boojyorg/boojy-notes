import { useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import type { FileViewState } from "../hooks/useFileView";
import { ACTUAL_SIZE, FIT_PAGE } from "../utils/fileView";
import { resolveAttachmentUrl } from "../utils/attachmentUrl";
import { otherFileKind } from "../utils/otherFiles";
import { OtherFileIcon } from "./Icons";
import PdfView from "./PdfView";
import { SHOW_IN_FOLDER_LABEL, SmallButton } from "./settings/SettingsPrimitives";

/** Room round a picture, so a fitted one never touches the pane's edges. */
const PICTURE_MARGIN = 40;

/**
 * A picture in the note's place: fitted to the pane and never enlarged by
 * the fit, or at the zoom chosen. A click on it switches between fitted and
 * its real size, as a click in Preview does; a pinch or ⌘-scroll zooms.
 */
function PictureView({ view }: { view: FileViewState }) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const { setRoom, setNatural, setZoom } = view;
  const [natural, setOwn] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!scroller) return;
    const measure = () =>
      setRoom({
        width: scroller.clientWidth - 2 * PICTURE_MARGIN,
        height: scroller.clientHeight - 2 * PICTURE_MARGIN,
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, setRoom]);

  useEffect(() => {
    if (!scroller) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = view.percent * Math.exp(-e.deltaY * 0.01);
      setZoom({ mode: "pct", pct: Math.round(Math.min(400, Math.max(10, next))) });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [scroller, setZoom, view.percent]);

  const fitted = view.zoom.mode === "fitPage";
  const width = natural && view.scale ? natural.width * view.scale : undefined;
  return (
    <div
      ref={setScroller}
      data-testid="picture-view"
      style={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        alignItems: "safe center",
        justifyContent: "safe center",
        padding: PICTURE_MARGIN,
        boxSizing: "border-box",
      }}
    >
      <button
        type="button"
        aria-label={fitted ? "Show at real size" : "Fit to the window"}
        onClick={() => setZoom(fitted ? ACTUAL_SIZE : FIT_PAGE)}
        style={{
          padding: 0,
          border: "none",
          background: "none",
          flexShrink: 0,
          cursor: fitted ? "zoom-in" : "zoom-out",
          visibility: width ? "visible" : "hidden",
        }}
      >
        <img
          src={resolveAttachmentUrl(view.rel)}
          alt={view.name}
          draggable={false}
          onLoad={(e) => {
            const own = {
              width: e.currentTarget.naturalWidth,
              height: e.currentTarget.naturalHeight,
            };
            setOwn(own);
            setNatural(own);
          }}
          style={{ display: "block", width, height: "auto" }}
        />
      </button>
    </div>
  );
}

/**
 * A file the app cannot show (slides, a document, a sheet): what it is, and
 * the two ways on. Nothing here reads or writes it.
 */
function FileCard({
  view,
  openFile,
  revealFile,
}: {
  view: FileViewState;
  openFile: () => void;
  revealFile: () => void;
}) {
  const { theme } = useTheme();
  return (
    <div
      data-testid="file-card"
      role="status"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 40,
        textAlign: "center",
      }}
    >
      <span style={{ color: theme.TEXT.secondary, display: "flex" }}>
        <OtherFileIcon kind={otherFileKind(view.name)} size={32} />
      </span>
      <div style={{ fontSize: 15, fontWeight: 500, color: theme.TEXT.primary }}>{view.name}</div>
      <div style={{ fontSize: 14, color: theme.TEXT.muted }}>
        Boojy Notes can’t show this kind of file.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <SmallButton onClick={openFile}>Open in Default App</SmallButton>
        <SmallButton onClick={revealFile}>{SHOW_IN_FOLDER_LABEL}</SmallButton>
      </div>
    </div>
  );
}

/** A file that is not a note, shown in the note's place: a PDF, a picture, or a card. */
export default function FileView({
  view,
  openFile,
  revealFile,
}: {
  view: FileViewState;
  openFile: () => void;
  revealFile: () => void;
}) {
  if (view.kind === "pdf") return <PdfView key={view.rel} view={view} />;
  if (view.kind === "picture") return <PictureView key={view.rel} view={view} />;
  return <FileCard view={view} openFile={openFile} revealFile={revealFile} />;
}
