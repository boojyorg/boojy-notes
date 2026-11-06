import { openBlock } from "./blockOpen";

/** Longest a fold's slide takes (the small clock's enter, with room). */
const SLIDE_MS = 600;

/**
 * Opens the folded callout holding `node`, if one does, so what is found in
 * it can be shown; resolves once it has opened (its slide ended, or at once
 * without one), so a scroll lands where the text finally sits. Anything else
 * resolves at once.
 */
export function revealFolded(node: Node | null | undefined): Promise<void> {
  const el = node?.nodeType === 1 ? (node as Element) : node?.parentElement;
  const fold = el?.closest?.(".callout-fold[data-folded]");
  const id = fold?.closest("[data-block-id]")?.getAttribute("data-block-id");
  if (!fold || !id) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      fold.removeEventListener("transitionend", onEnd);
      window.clearTimeout(timer);
      resolve();
    };
    const onEnd = (e: Event) => {
      if (e.target === fold) finish();
    };
    fold.addEventListener("transitionend", onEnd);
    const timer = window.setTimeout(finish, SLIDE_MS);
    openBlock(id, "unfold");
  });
}
