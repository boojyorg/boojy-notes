import { type ReactNode, useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { resolveAttachmentUrl } from "../../utils/attachmentUrl";
import { cssZoom } from "../../utils/domHelpers";
import { imageWashFill } from "../../utils/selectionBand";
import { ExpandIcon, MoreHorizontalIcon } from "../Icons";
import { Tooltip, useTooltip } from "../Tooltip";
import ImageMenu, { type MenuAnchor } from "./ImageMenu";
import MissingAttachment, { findable } from "./MissingAttachment";

interface ImageBlockProps {
  src: string;
  alt?: string;
  /** The width drawn, in CSS pixels, or null for the picture's own size. */
  displayWidth: number | null;
  isSelected: boolean;
  /** Selected and the only block selected: it shows its outline and corner dots. */
  selectedAlone?: boolean;
  onSelect: () => void;
  onLightbox: () => void;
  onDelete: () => void;
  onCopyImage: () => void;
  /** Desktop only. */
  onShowInFolder?: () => void;
  /** A width in CSS pixels, or null to take the width off and draw the picture's own size. */
  onUpdateWidth: (px: number | null) => void;
  accentColor: string;
}

/** A corner dot's drawn size, and the box round it a press may land in. */
const DOT = 12;
const DOT_HIT = 28;
/** The selection's outline, drawn just outside the picture. */
const OUTLINE = 2;
/**
 * The four corner dots. A left dot counts the pointer's travel in reverse, so
 * dragging it outward grows the picture, which grows to the right: the
 * picture sits at the column's left, so the dot slides from under the pointer
 * (Google Docs does the same).
 */
const CORNERS = [
  { name: "top-left", top: true, left: true, cursor: "nwse-resize" },
  { name: "top-right", top: true, left: false, cursor: "nesw-resize" },
  { name: "bottom-left", top: false, left: true, cursor: "nesw-resize" },
  { name: "bottom-right", top: false, left: false, cursor: "nwse-resize" },
] as const;
/** How close to the picture's own size a drag lands on it exactly. */
const SNAP_PX = 8;

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
  const { theme } = useTheme();
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
 * top right (full size, and ··· for the menu); no outline, because a frame
 * round every hovered picture was the teal border this replaced. **A click
 * selects** on the press, and no longer opens the full-size view, so a
 * picture can be selected to delete it; a press anywhere off the picture
 * deselects it (`EditorArea`). A double-click or the bar's button opens it.
 * **Right-click and ··· open one menu.** Alignment, crop and caption are left
 * out by decision: Markdown can hold none of them, and Obsidian would draw the
 * note differently.
 *
 * **Selected alone, it resizes by its corners** (2026-10-01, Google Docs'
 * handles, judged in a prototype): a teal outline just outside the picture and
 * a dot on each corner. In a run of selected blocks it wears the wash
 * (`imageWashFill`) like the rest, with no dots: one drag cannot size several.
 * Corners only, never edges: the file holds a width alone (`|px`), so the
 * height always follows and an edge would move the side it doesn't name. A
 * drag snaps to the picture's own size (capped at the column) and writes no
 * width there; a double-click on a dot does the same. No width label, by
 * decision (2026-09-23): the picture changing size is the feedback.
 */
function ImageBlock({
  src,
  alt,
  displayWidth,
  isSelected,
  selectedAlone = false,
  onSelect,
  onLightbox,
  onDelete,
  onCopyImage,
  onShowInFolder,
  onUpdateWidth,
  accentColor,
}: ImageBlockProps) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const [hovered, setHovered] = useState(false);
  const [errored, setErrored] = useState(false);
  const [loading, setLoading] = useState(true);
  // A new picture is a new load (an outside edit, an undo), so a source that
  // changes after an error is not left drawing "Image not found" (state
  // adjusted in render, React's own pattern).
  const [loadSrc, setLoadSrc] = useState(src);
  if (src !== loadSrc) {
    setLoadSrc(src);
    setErrored(false);
    setLoading(true);
  }
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; fromBar: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const resolvedSrc = src ? resolveAttachmentUrl(src) : "";
  // Found again (Find it…): a new load, remounted so no failed load is reused.
  const [attempt, setAttempt] = useState(0);
  const findMissing = async () => {
    if (!(await window.electronAPI?.findAttachment(src))) return;
    setErrored(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  };

  // Opening the menu does not select the picture: it wears the wash only
  // while its menu is open, so the menu says which picture it is for, and is
  // left as it was once an item has acted (Notion's; 2026-09-23, after Original
  // size left the picture selected).
  const openMenu = (anchor: MenuAnchor, fromBar: boolean) => setMenu({ anchor, fromBar });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openMenu({ top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX }, false);
  };

  // A resize is the picture's width in CSS pixels, what the file's `|px`
  // means: it starts from the width drawn, stops at the column less the frame,
  // and the pointer's travel is divided by the UI scale, which Chromium has
  // already multiplied into it. `sign` is -1 for a left dot.
  const handleResizeStart = (e: React.MouseEvent, sign: 1 | -1) => {
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
      const travel = (sign * (me.clientX - startX)) / zoom;
      let px = Math.round(Math.max(columnWidth * 0.1, Math.min(columnWidth, startWidth + travel)));
      if (Math.abs(px - own) <= SNAP_PX) px = own;
      moved = px;
      img.style.width = `${px}px`;
      setDragging(true);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setDragging(false);
      if (moved == null) return;
      img.style.width = "";
      onUpdateWidth(moved === own ? null : moved);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (errored || !src) {
    return (
      <MissingAttachment
        src={src}
        image
        onFind={findable(src) ? findMissing : undefined}
        onRemove={onDelete}
      />
    );
  }

  // The bar follows the pointer (and a menu it opened), never the selection,
  // so it is never up with the pointer somewhere else (2026-09-23); the
  // corner dots follow the selection alone.
  const pointerOn = (hovered || !!menu || dragging) && !loading;
  const handle = theme.imageHandle;

  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div
        ref={containerRef}
        data-selection-surface
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        // Selected on the press, not the release (2026-09-23): the Mac's own
        // grammar, and the press that deselects elsewhere is the same event.
        // The dots and the bar stop their own press, so neither reselects.
        onMouseDown={(e) => {
          if (e.button === 0) onSelect();
        }}
        onClick={(e) => e.stopPropagation()}
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
          key={attempt}
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
        {(isSelected || !!menu) && !selectedAlone && !loading && (
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
        {pointerOn && !dragging && (
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
        {selectedAlone && !loading && (
          <div
            data-testid="image-selection-outline"
            style={{
              position: "absolute",
              // Over the frame's transparent border, so the outline sits just
              // outside the picture and covers none of it.
              inset: -OUTLINE,
              border: `${OUTLINE}px solid ${ACCENT.primary}`,
              borderRadius: 6 + OUTLINE,
              pointerEvents: "none",
            }}
          />
        )}
        {selectedAlone &&
          !loading &&
          CORNERS.map((corner) => (
            <button
              key={corner.name}
              type="button"
              aria-label="Resize image"
              data-testid="image-resize-handle"
              data-corner={corner.name}
              onMouseDown={(e) => handleResizeStart(e, corner.left ? -1 : 1)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (displayWidth != null) onUpdateWidth(null);
              }}
              style={{
                position: "absolute",
                // Centred on the picture's corner, which is the padding box's.
                top: corner.top ? -DOT_HIT / 2 : `calc(100% - ${DOT_HIT / 2}px)`,
                left: corner.left ? -DOT_HIT / 2 : `calc(100% - ${DOT_HIT / 2}px)`,
                width: DOT_HIT,
                height: DOT_HIT,
                padding: 0,
                border: "none",
                background: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: corner.cursor,
              }}
            >
              <span
                style={{
                  display: "block",
                  width: DOT,
                  height: DOT,
                  boxSizing: "border-box",
                  borderRadius: "50%",
                  background: handle.fill,
                  border: `${OUTLINE}px solid ${ACCENT.primary}`,
                  boxShadow: handle.shadow,
                }}
              />
            </button>
          ))}
      </div>
      {menu && (
        <ImageMenu
          anchor={menu.anchor}
          fromBar={menu.fromBar}
          onView={onLightbox}
          onCopy={onCopyImage}
          onShowInFolder={onShowInFolder}
          onOriginalSize={displayWidth != null ? () => onUpdateWidth(null) : undefined}
          onDelete={onDelete}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

export default ImageBlock;
