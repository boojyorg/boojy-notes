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

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

/** Boojy's look: rounded boxes, hairline borders, finer lines. */
const THEME_CSS =
  ".node rect { rx: 6px; ry: 6px; stroke-width: 1px; } .node polygon, .node circle { stroke-width: 1px; } .flowchart-link { stroke-width: 1.5px; } .edgeLabel { font-size: 13px; }";

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

/** Smaller arrowheads than Mermaid's own. */
const shrinkMarkers = (svg: string) =>
  svg.replace(
    /marker(Width|Height)="([\d.]+)"/g,
    (_, d, v) => `marker${d}="${(Number(v) * 0.7).toFixed(1)}"`,
  );

/** Draw `source`, or say why it can't be drawn. */
export function drawDiagram(source: string, colours: DiagramColours): Promise<Drawn> {
  if (!source.trim()) return Promise.resolve({ empty: true });
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
      themeCSS: THEME_CSS,
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
      return { svg: shrinkMarkers(svg) };
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
