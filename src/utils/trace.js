// Renderer half of the diagnostic trace (see electron/trace.js). A no-op
// unless the main process was started with BOOJY_TRACE. Lines go over IPC and
// are stamped by main, so they interleave with watcher and write events.
const api = typeof window !== "undefined" ? window.electronAPI : undefined;

export const traceEnabled = !!api?.traceEnabled;

export function trace(...parts) {
  if (!traceEnabled) return;
  api.trace(parts.map(String).join(" "));
}

const blockOf = (node) => {
  if (!node) return null;
  const el = node.nodeType === 1 ? node : node.parentElement;
  return el?.closest?.("[data-block-id]") ?? null;
};

const describeBlock = (el) => {
  if (!el) return "none";
  const all = Array.from(document.querySelectorAll("[data-block-id]"));
  return `#${all.indexOf(el)}/${all.length} ${el.getAttribute("data-block-id")}`;
};

/**
 * Document-level probes: where the caret is (logged when it moves to another
 * block or element), every input the editor receives, and window focus.
 */
export function installTraceProbes() {
  if (!traceEnabled) return;
  let last = null;
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    const el = sel?.rangeCount ? blockOf(sel.anchorNode) : null;
    const active = document.activeElement;
    const where = el
      ? describeBlock(el)
      : `${active?.tagName ?? "none"} ${active?.getAttribute?.("data-testid") ?? active?.getAttribute?.("aria-label") ?? ""}`;
    if (where === last) return;
    last = where;
    trace("caret →", where, "offset", sel?.anchorOffset ?? -1);
  });
  document.addEventListener(
    "beforeinput",
    (e) => {
      trace(
        "input",
        e.inputType,
        JSON.stringify(e.data ?? ""),
        "in",
        describeBlock(blockOf(e.target)),
      );
    },
    true,
  );
  window.addEventListener("blur", () => trace("window blur"));
  window.addEventListener("focus", () => trace("window focus"));
}
