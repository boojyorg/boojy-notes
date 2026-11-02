/**
 * Asking a block to open something of its own: a maths block its source, a
 * note's properties their Add property picker. The one who asks is not the
 * block that opens: a command often names a block not mounted yet (a new one
 * arrives with the next render). A request for a block not yet mounted waits
 * for it, and is taken once.
 */
type Opener = (what?: string) => void;
const openers = new Map<string, Opener>();
const pending = new Map<string, string | undefined>();

export function openBlock(blockId: string, what?: string): void {
  const open = openers.get(blockId);
  if (open) open(what);
  else pending.set(blockId, what);
}

/** A mounted block's way in; returns its removal. */
export function registerBlockOpener(blockId: string, open: Opener): () => void {
  openers.set(blockId, open);
  if (pending.has(blockId)) {
    const what = pending.get(blockId);
    pending.delete(blockId);
    open(what);
  }
  return () => {
    if (openers.get(blockId) === open) openers.delete(blockId);
  };
}
