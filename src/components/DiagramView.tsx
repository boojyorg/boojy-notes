import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { drawDiagram, drawnBefore, fitToColumn } from "../utils/mermaid";

/** How long typing must pause before the diagram is drawn again. */
const REDRAW_MS = 250;

/**
 * A Mermaid diagram drawn from `source`. It redraws a moment after typing
 * pauses, and a drawing that comes back after a newer one was asked for is
 * dropped. While the source can't be drawn, the last drawing that worked
 * stays, faded, with the reason under it. A drawing already made shows at
 * once, so a note opened again doesn't wait for Mermaid or jump.
 */
export default function DiagramView({ source, emptyText }: { source: string; emptyText: string }) {
  const { theme: t, isDark } = useTheme();
  const colours = {
    dark: isDark,
    ground: t.codeBlockBg,
    box: t.BG.elevated,
    border: t.scrollbar.thumbHover,
    line: t.TEXT.secondary,
    ink: t.TEXT.primary,
  };
  const key = JSON.stringify(colours);

  const [svg, setSvg] = useState(() => drawnBefore(source, colours) ?? "");
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(!source.trim());
  const latest = useRef(0);
  const drawnOnce = useRef(false);
  const renderRef = useRef<HTMLDivElement>(null);

  // Fitted whenever its element is made: a new drawing, or the same one
  // back from empty (undo after clearing the source mounts it afresh).
  // biome-ignore lint/correctness/useExhaustiveDependencies: each new element is fitted once
  useLayoutEffect(() => {
    const drawing = renderRef.current?.querySelector("svg");
    if (drawing) fitToColumn(drawing);
  }, [svg, empty]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the colours are keyed by `key`
  useEffect(() => {
    const ask = ++latest.current;
    // The first drawing is at once; later ones wait for a pause in typing.
    const timer = setTimeout(
      () => {
        drawDiagram(source, colours).then((drawn) => {
          if (ask !== latest.current) return;
          drawnOnce.current = true;
          if ("empty" in drawn) {
            setEmpty(true);
            setError(null);
          } else if ("svg" in drawn) {
            setEmpty(false);
            setSvg(drawn.svg);
            setError(null);
          } else {
            setEmpty(false);
            setError(drawn.error);
          }
        });
      },
      drawnOnce.current ? REDRAW_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [source, key]);

  if (empty) {
    return (
      <div
        className="diagram-empty"
        style={{ textAlign: "center", color: t.TEXT.muted, fontSize: 13.5, padding: "10px 16px" }}
      >
        {emptyText}
      </div>
    );
  }
  return (
    <div>
      {svg ? (
        <div
          ref={renderRef}
          className="diagram-render"
          style={{ opacity: error ? 0.45 : 1 }}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid's own SVG, sanitised (securityLevel strict)
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : !error ? (
        <div style={{ minHeight: 40 }} aria-busy="true" />
      ) : null}
      {error && (
        <div
          role="status"
          style={{
            display: "flex",
            gap: 7,
            alignItems: "baseline",
            justifyContent: "center",
            fontSize: 12.5,
            color: t.TEXT.muted,
            padding: "4px 16px 0",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: t.SEMANTIC.error,
              flex: "none",
              transform: "translateY(-1px)",
            }}
          />
          {svg ? `Showing the last version that worked. ${error}` : error}
        </div>
      )}
    </div>
  );
}
