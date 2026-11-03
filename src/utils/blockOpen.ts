/**
 * Asking a block to open something of its own: a maths block its source, a
 * note's properties their Add property picker. The one who asks is not the
 * block that opens: a command often names a block not mounted yet (a new one
 * arrives with the next render). A request for a block not yet mounted waits
 * for it, and is taken once.
 */
/** What to open, and where it was asked from (the block the caret goes back to). */
export interface OpenRequest {
  what?: string;
  from?: string;
}
type Opener = (request: OpenRequest) => void;
const openers = new Map<string, Opener>();
const pending = new Map<string, OpenRequest>();

export function openBlock(blockId: string, what?: string, from?: string): void {
  const request = { what, from };
  const open = openers.get(blockId);
  if (open) open(request);
  else pending.set(blockId, request);
}

/** A mounted block's way in; returns its removal. */
export function registerBlockOpener(blockId: string, open: Opener): () => void {
  openers.set(blockId, open);
  const request = pending.get(blockId);
  if (request) {
    pending.delete(blockId);
    open(request);
  }
  return () => {
    if (openers.get(blockId) === open) openers.delete(blockId);
  };
}
