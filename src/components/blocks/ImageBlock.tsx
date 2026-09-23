import { type ReactNode, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { resolveAttachmentUrl } from "../../utils/attachmentUrl";
import { cssZoom } from "../../utils/domHelpers";
import { imageWashFill } from "../../utils/selectionBand";
import { ExpandIcon, MoreHorizontalIcon } from "../Icons";
import { Tooltip, useTooltip } from "../Tooltip";
import ImageMenu, { type MenuAnchor } from "./ImageMenu";

interface ImageBlockProps {
  src: string;
  alt?: string;
  /** The width drawn, in CSS pixels, or null for the picture's own size. */
  displayWidth: number | null;
  isSelected: boolean;
  onSelect: () => void;
  onLightbox: () => void;
  onDelete: () => void;
  onReplace: () => void;
  onCopyImage: () => void;
  /** Desktop only. */
  onShowInFolder?: () => void;
  /** A width in CSS pixels, or null to take the width off and draw the picture's own size. */
  onUpdateWidth: (px: number | null) => void;
  accentColor: string;
}

type Theme = Record<string, Record<string, string>> & {
  name?: string;
  floatShadow: string;
  imageHandle: { fill: string; edge: string; edgeActive: string; shadow: string };
};

/** The resize pill's length on a picture tall enough for it (Notion's proportion). */
const PILL_LENGTH = 48;
/** How close to the picture's own size a drag lands on it exactly. */
const SNAP_PX = 8;
/** The width label sits outside the picture unless it would leave the column. */
const LABEL_ROOM = 150;

interface Drag {
  px: number;
  /** The picture's own size, capped at the column: the width a drag snaps to. */
  own: number;
  /** Whether the label fits beside the picture or goes inside it. */
  labelInside: boolean;
}

/** A 28px button in the hover bar, named by the app's tooltip chip. */
function BarButton({
  label,
  lit,
  onClick,
  children,
}: {
  label: string;
  lit?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  const { theme } = useTheme() as { theme: Theme };
  const { BG, TEXT } = theme;
  const [hot, setHot] = useState(false);
  const tip = useTooltip();
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        {...tip.handlers}
        onMouseEnter={() => {
          setHot(true);
          tip.handlers.onMouseEnter();
        }}
        onMouseLeave={() => {
          setHot(false);
          tip.handlers.onMouseLeave();
        }}
        onMouseDown={(e) => {
          // Keeps the editor's selection and focus where they are.
          e.preventDefault();
          e.stopPropagation();
          tip.handlers.onMouseDown();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        style={{
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          border: "none",
          borderRadius: 6,
          background: lit ? BG.hover : hot ? BG.surface : "transparent",
          color: TEXT.secondary,
          cursor: "pointer",
        }}
      >
        {children}
      </button>
      {tip.shown && <Tooltip label={label} anchor={ref.current} placement="above" />}
    </>
  );
}

/**
 * An image block (2026-09-23, from a prototype Tyr judged against Obsidian's
 * and Notion's). Nothing at rest but the picture. **Hover** shows a bar at the
 * top right (full size, and ··· for the menu) and a white pill on the right
 * edge that resizes it; no outline, because a frame round every hovered
 * picture was the teal border this replaced. **A click selects** (the teal
 * wash, the whole-block selection's tint, `imageWashFill`) and no longer opens
 * the full-size view, so a picture can be selected to delete it; a
 * double-click or the bar's button opens it. **Right-click and ··· open one
 * menu.** Alignment, crop and caption are left out by decision: Markdown can
 * hold none of them, and Obsidian would draw the note differently.
 *
 * The pill is the only resize control, on the right because the picture sits
 * on the left of the column. It straddles the edge, so it never meets the bar
 * on a short picture, and it is as long as `PILL_LENGTH` or the picture allows.
 * A drag shows the width it will write, snaps to the picture's own size and
 * writes no width there; a double-click on the pill does the same.
 */
function ImageBlock({
  src,
  alt,
  displayWidth,
  isSelected,
  onSelect,
  onLightbox,
  onDelete,
  onReplace,
  onCopyImage,
  onShowInFolder,
  onUpdateWidth,
  accentColor,
}: ImageBlockProps) {
  const { theme } = useTheme() as { theme: Theme };
  const { BG, TEXT } = theme;
  const [hovered, setHovered] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);
  // A new picture is a new load, so a Replace after an error is not left
  // drawing "Image not found" (state adjusted in render, React's own pattern).
  const [loadSrc, setLoadSrc] = useState(src);
  if (src !== loadSrc) {
    setLoadSrc(src);
    setErrored(false);
    setLoading(true);
  }
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; fromBar: boolean } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pillHot, setPillHot] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const resolvedSrc = src ? resolveAttachmentUrl(src) : "";

  const openMenu = (anchor: MenuAnchor, fromBar: boolean) => {
    onSelect();
    setMenu({ anchor, fromBar });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu({ top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX }, false);
  };

  // A resize is the picture's width in CSS pixels, what the file's `|px`
  // means: it starts from the width drawn, stops at the column less the frame,
  // and the pointer's travel is divided by the UI scale, which Chromium has
  // already multiplied into it.
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const box = containerRef.current;
    const img = imgRef.current;
    const column = box?.parentElement;
    if (!box || !img || !column) return;
    const zoom = cssZoom(box);
    const columnWidth = column.offsetWidth - (box.offsetWidth - img.offsetWidth);
    const own = Math.min(img.naturalWidth || img.offsetWidth, columnWidth);
    const startX = e.clientX;
    const startWidth = img.offsetWidth;
    let moved: number | null = null;

    const onMove = (me: MouseEvent) => {
      const travel = (me.clientX - startX) / zoom;
      let px = Math.round(Math.max(columnWidth * 0.1, Math.min(columnWidth, startWidth + travel)));
      if (Math.abs(px - own) <= SNAP_PX) px = own;
      moved = px;
      img.style.width = `${px}px`;
      setDrag({ px, own, labelInside: px + LABEL_ROOM > columnWidth });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setDrag(null);
      if (moved == null) return;
      img.style.width = "";
      onUpdateWidth(moved === own ? null : moved);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (errored || !src) {
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative",
          border: `1.5px dashed ${TEXT.muted}`,
          borderRadius: 6,
          padding: "24px 16px",
          textAlign: "center",
          color: TEXT.muted,
          fontSize: 13,
        }}
      >
        Image not found: {src || "(empty)"}
        {hovered && (
          <button
            type="button"
            aria-label="Remove image"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        )}
      </div>
    );
  }

  const active = (hovered || isSelected || !!menu) && !loading;
  const handle = theme.imageHandle;
  const pillOn = pillHot || !!drag;

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        ref={containerRef}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onLightbox();
        }}
        onContextMenu={handleContextMenu}
        style={{
          position: "relative",
          borderRadius: 6,
          // The frame fits the picture; the column caps both. Loading, the
          // placeholder holds the column until the picture's size is known.
          width: loading ? "100%" : "fit-content",
          maxWidth: "100%",
          // Kept transparent: the resize arithmetic measures the frame as the
          // box less the picture, and the file's widths were judged with it.
          border: "2px solid transparent",
          cursor: "default",
        }}
      >
        {loading && (
          <div
            style={{
              width: "100%",
              height: 120,
              borderRadius: 6,
              background: BG.elevated,
              animation: "img-pulse 1.5s ease-in-out infinite",
            }}
          />
        )}
        <style>{`@keyframes img-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }`}</style>
        <img
          ref={imgRef}
          src={resolvedSrc}
          alt={alt || ""}
          draggable="false"
          loading={resolvedSrc?.startsWith("data:") ? undefined : "lazy"}
          onLoad={() => setLoading(false)}
          onError={() => {
            setErrored(true);
            setLoading(false);
          }}
          style={{
            display: "block",
            // A width in the file is the picture's, in CSS pixels; none is its
            // own size. Never wider than the column, never enlarged to fill it.
            width: displayWidth ? `${displayWidth}px` : "auto",
            maxWidth: "100%",
            borderRadius: 6,
            ...(loading ? { position: "absolute", opacity: 0, pointerEvents: "none" } : {}),
          }}
        />
        {isSelected && !loading && (
          <div
            data-testid="image-selection-wash"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 6,
              background: imageWashFill(accentColor, theme.name),
              pointerEvents: "none",
            }}
          />
        )}
        {active && !drag && (
          <div
            data-testid="image-hover-bar"
            style={{
              position: "absolute",
              top: 8,
              right: 8,
              display: "flex",
              gap: 2,
              padding: 2,
              background: BG.elevated,
              border: `1px solid ${BG.divider}`,
              borderRadius: 8,
              boxShadow: theme.floatShadow,
            }}
          >
            <BarButton label="View full size" onClick={() => onLightbox()}>
              <ExpandIcon />
            </BarButton>
            <BarButton
              label="Image options"
              lit={!!menu?.fromBar}
              onClick={(e) => {
                if (menu) {
                  setMenu(null);
                  return;
                }
                const r = e.currentTarget.getBoundingClientRect();
                openMenu({ top: r.top, bottom: r.bottom, left: r.left, right: r.right }, true);
              }}
            >
              <MoreHorizontalIcon size={16} />
            </BarButton>
          </div>
        )}
        {active && (
          <button
            type="button"
            aria-label="Resize image"
            data-testid="image-resize-handle"
            onMouseDown={handleResizeStart}
            onMouseEnter={() => setPillHot(true)}
            onMouseLeave={() => setPillHot(false)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (displayWidth != null) onUpdateWidth(null);
            }}
            style={{
              position: "absolute",
              top: 8,
              bottom: 8,
              // Centred on the picture's right edge, which is the padding box's.
              right: -12,
              width: 24,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "ew-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                display: "block",
                width: pillOn ? 8 : 6,
                height: "100%",
                maxHeight: PILL_LENGTH,
                minHeight: 16,
                boxSizing: "border-box",
                borderRadius: 4,
                background: handle.fill,
                border: `1px solid ${pillOn ? handle.edgeActive : handle.edge}`,
                boxShadow: handle.shadow,
              }}
            />
          </button>
        )}
        {drag && (
          <div
            data-testid="image-width-label"
            style={{
              position: "absolute",
              top: "50%",
              marginTop: -14,
              height: 28,
              ...(drag.labelInside ? { right: 20 } : { left: "calc(100% + 16px)" }),
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              background: BG.elevated,
              border: `1px solid ${BG.divider}`,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
              fontVariantNumeric: "tabular-nums",
              color: TEXT.primary,
              pointerEvents: "none",
            }}
          >
            {drag.px === drag.own ? `${drag.px} px · original size` : `${drag.px} px`}
          </div>
        )}
      </div>
      {menu && (
        <ImageMenu
          anchor={menu.anchor}
          fromBar={menu.fromBar}
          onView={onLightbox}
          onCopy={onCopyImage}
          onShowInFolder={onShowInFolder}
          onReplace={onReplace}
          onOriginalSize={displayWidth != null ? () => onUpdateWidth(null) : undefined}
          onDelete={onDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

export default ImageBlock;
