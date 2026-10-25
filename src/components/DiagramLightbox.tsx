import { useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import Lightbox from "./Lightbox";

/** The panel's padding around the drawing. */
const PAD = 24;
/** A drawing is lines, so it may grow past its own size, to this much. */
const MAX_ZOOM = 2;

/** The drawing's own size, from its viewBox. */
const viewBoxSize = (svg: string) => {
  const m = svg.match(/viewBox="[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};

/**
 * A diagram full size, in the image's dark room: the drawing on its code
 * block's ground, as large as the window allows, up to `MAX_ZOOM`.
 * Portalled out of the editor, which is contentEditable.
 */
export default function DiagramLightbox({ svg, onClose }: { svg: string; onClose: () => void }) {
  const { theme: t } = useTheme();
  const roomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const size = viewBoxSize(svg);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refitted per drawing
  useLayoutEffect(() => {
    const room = roomRef.current;
    if (!room || !size) return;
    const refit = () =>
      setScale(
        Math.min(
          (room.clientWidth - PAD * 2) / size.w,
          (room.clientHeight - PAD * 2) / size.h,
          MAX_ZOOM,
        ),
      );
    refit();
    const observer = new ResizeObserver(refit);
    observer.observe(room);
    return () => observer.disconnect();
  }, [svg]);

  useLayoutEffect(() => {
    const drawing = panelRef.current?.querySelector("svg");
    if (!drawing || !size || scale === null) return;
    drawing.removeAttribute("width");
    drawing.removeAttribute("height");
    drawing.style.maxWidth = "none";
    drawing.style.minWidth = "0";
    drawing.style.width = `${size.w * scale}px`;
    drawing.style.height = `${size.h * scale}px`;
  });

  return (
    <Lightbox label="Diagram" onClose={onClose}>
      <div
        ref={roomRef}
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          ref={panelRef}
          className="diagram-lightbox-panel"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: t.codeBlockBg,
            borderRadius: 8,
            padding: PAD,
            visibility: size && scale === null ? "hidden" : undefined,
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </Lightbox>
  );
}
