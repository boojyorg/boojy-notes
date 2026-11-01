/**
 * Mermaid, drawing a ```` ```mermaid ```` code block. Loaded with the first
 * diagram a note shows, never with the app's start (its chunks are large),
 * and drawn with its default layout (Dagre); its ELK layout is a further
 * chunk, fetched only by a diagram that asks for it.
 *
 * Nothing in a diagram runs: `securityLevel: "strict"` sanitises it and drops
 * click handlers, and labels are plain SVG text, never HTML.
 *
 * Mermaid is configured globally, so drawings are made one at a time, each
 * with the theme of its own request.
 */
type Mermaid = typeof import("mermaid")["default"];

let loading: Promise<Mermaid> | null = null;
const loadMermaid = (): Promise<Mermaid> => {
  loading ??= import("mermaid").then((m) => m.default);
  return loading;
};

/** The theme a diagram is drawn in, from the app's tokens. */
export interface DiagramColours {
  dark: boolean;
  ground: string;
  box: string;
  border: string;
  line: string;
  ink: string;
}

export type Drawn = { svg: string } | { error: string } | { empty: true };

import { fontStack } from "../tokens/typography";

const FONT = fontStack;

/**
 * Boojy's look: rounded flat boxes (no shadow), hairline borders, finer
 * lines; a state diagram's end drawn in the line's ink, as its start is.
 */
const themeCss = (line: string) =>
  `.node rect { rx: 6px; ry: 6px; stroke-width: 1px; } .node polygon, .node circle { stroke-width: 1px; } * { filter: none !important; } .flowchart-link { stroke-width: 1.5px; } .edgeLabel { font-size: 13px; } .node[id*="_end"] .outer-path path { stroke: ${line} !important; } .node[id*="_end"] .outer-path g path:first-child { fill: ${line} !important; }`;

let queue: Promise<unknown> = Promise.resolve();
let renders = 0;

/** A parse error's first line and its last (what was expected), short enough for one line. */
export function shortError(e: unknown): string {
  const raw = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const msg = lines.length > 1 ? `${lines[0]} ${lines[lines.length - 1]}` : (lines[0] ?? "");
  return msg.length > 170 ? `${msg.slice(0, 167)}…` : msg || "This diagram can't be read";
}

/**
 * Smaller arrowheads than Mermaid's own. A marker without a viewBox (the
 * state diagram's) is given its own size as one first, so it scales rather
 * than being cut off.
 */
export const shrinkMarkers = (svg: string) =>
  svg.replace(/<marker\b[^>]*>/g, (tag) => {
    const size = (d: string) => Number(tag.match(new RegExp(`marker${d}="([\\d.]+)"`))?.[1]);
    const w = size("Width");
    const h = size("Height");
    if (!w || !h) return tag;
    const scaled = tag
      .replace(/markerWidth="[\d.]+"/, `markerWidth="${(w * 0.7).toFixed(1)}"`)
      .replace(/markerHeight="[\d.]+"/, `markerHeight="${(h * 0.7).toFixed(1)}"`);
    return /viewBox=/.test(tag)
      ? scaled
      : scaled.replace("<marker", `<marker viewBox="0 0 ${w} ${h}"`);
  });

/** The narrowest a wide diagram is drawn to fit the column, before it scrolls. */
export const MIN_FIT = 0.65;

/** Fit a drawing to the column: never enlarged, shrunk to `MIN_FIT` at most, then scrolling. */
export function fitToColumn(svg: SVGSVGElement): void {
  const width = svg.viewBox.baseVal?.width;
  if (!width) return;
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.removeProperty("width");
  svg.style.height = "auto";
  svg.style.maxWidth = `${width}px`;
  svg.style.minWidth = `${Math.round(width * MIN_FIT)}px`;
}

/** Drawings already made, by theme and source, so a note opened again shows them at once. */
const drawings = new Map<string, string>();
const DRAWINGS_KEPT = 50;
const drawingKey = (source: string, colours: DiagramColours) =>
  `${JSON.stringify(colours)}\n${source}`;

/** The drawing already made of `source` in this theme, if any. */
export const drawnBefore = (source: string, colours: DiagramColours): string | undefined =>
  drawings.get(drawingKey(source, colours));

/** Draw `source`, or say why it can't be drawn. */
export function drawDiagram(source: string, colours: DiagramColours): Promise<Drawn> {
  if (!source.trim()) return Promise.resolve({ empty: true });
  const key = drawingKey(source, colours);
  const kept = drawings.get(key);
  if (kept) return Promise.resolve({ svg: kept });
  const run = queue.then(async (): Promise<Drawn> => {
    let mermaid: Mermaid;
    try {
      mermaid = await loadMermaid();
    } catch {
      return { error: "The diagram library didn't load." };
    }
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily: FONT,
      flowchart: { useMaxWidth: false, htmlLabels: false, curve: "basis" },
      themeCSS: themeCss(colours.line),
      themeVariables: {
        darkMode: colours.dark,
        fontFamily: FONT,
        fontSize: "14px",
        background: colours.ground,
        primaryColor: colours.box,
        secondaryColor: colours.box,
        tertiaryColor: colours.ground,
        primaryTextColor: colours.ink,
        secondaryTextColor: colours.ink,
        tertiaryTextColor: colours.ink,
        textColor: colours.ink,
        primaryBorderColor: colours.border,
        secondaryBorderColor: colours.border,
        tertiaryBorderColor: colours.border,
        nodeBorder: colours.border,
        lineColor: colours.line,
        edgeLabelBackground: colours.ground,
        clusterBkg: colours.ground,
      },
    });
    const id = `boojy-mermaid-${++renders}`;
    try {
      await mermaid.parse(source);
      const { svg } = await mermaid.render(id, source);
      const drawn = shrinkMarkers(svg);
      if (drawings.size >= DRAWINGS_KEPT) drawings.delete(drawings.keys().next().value as string);
      drawings.set(key, drawn);
      return { svg: drawn };
    } catch (e) {
      return { error: shortError(e) };
    } finally {
      // A failed render can leave its scratch element in the page.
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = run.catch(() => {});
  return run;
}
