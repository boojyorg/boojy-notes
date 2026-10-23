import { INLINE_MATH_CLASS, isMathAtom } from "./domHelpers";

/**
 * Drawing inline formulas. The renderer writes each `$x$` as an element
 * holding its source (`data-math`) and, until KaTeX is here, the source as
 * text; every path that puts one in the editor (a repaint, a typed `$`, a
 * paste, a cell or a callout) is covered by one observer that draws what
 * arrives. Drawing never changes what the element reads back as.
 */
type KatexModule = typeof import("./katexRender");

let katexModule: KatexModule | null = null;
let loading: Promise<KatexModule> | null = null;
function loadKatex(): Promise<KatexModule> {
  loading ??= import("./katexRender").then((m) => {
    katexModule = m;
    return m;
  });
  return loading;
}

/** Draw one formula from its source, unless it already shows that source. */
export function drawAtom(atom: HTMLElement): void {
  const source = atom.getAttribute("data-math") ?? "";
  if (!katexModule) {
    loadKatex().then(() => drawAtom(atom));
    return;
  }
  if (atom.dataset.drawn === source) return;
  const r = katexModule.renderFormula(source, false);
  if ("html" in r) {
    atom.innerHTML = r.html;
    atom.classList.remove("inline-math-error");
  } else {
    // Can't be drawn: its source, quietly, until it can.
    atom.textContent = `$${source}$`;
    atom.classList.add("inline-math-error");
  }
  atom.dataset.drawn = source;
}

function drawWithin(node: Node): void {
  if (!(node instanceof HTMLElement)) return;
  if (isMathAtom(node)) drawAtom(node);
  for (const atom of node.querySelectorAll<HTMLElement>(`.${INLINE_MATH_CLASS}`)) drawAtom(atom);
}

/** Draw every formula under `root` now and as they arrive; returns the stop. */
export function drawInlineMath(root: HTMLElement): () => void {
  drawWithin(root);
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) drawWithin(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
