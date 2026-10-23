/**
 * Asking a maths block to open its source panel. The block that asks is not
 * the block that opens: Enter on a selected formula, the slash menu's Maths
 * and the typed `$$ ` all name a block that may not be mounted yet (a new one
 * arrives with the next render). A request for a block not yet mounted waits
 * for it, and is taken once.
 */
const openers = new Map<string, () => void>();
const pending = new Set<string>();

export function openMathSource(blockId: string): void {
  const open = openers.get(blockId);
  if (open) open();
  else pending.add(blockId);
}

/** A mounted maths block's way in; returns its removal. */
export function registerMathOpener(blockId: string, open: () => void): () => void {
  openers.set(blockId, open);
  if (pending.delete(blockId)) open();
  return () => {
    if (openers.get(blockId) === open) openers.delete(blockId);
  };
}
