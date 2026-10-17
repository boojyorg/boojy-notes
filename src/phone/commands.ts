/**
 * The phone's stand-in for the desktop's menu bar: a control sends a command
 * id and the shell runs it as the key runs it (`useAppKeyboard`'s
 * `onMenuCommand`, the one path the menu bar's items take). The bar above the
 * keyboard does nothing itself.
 */
type Listener = (id: string) => void;

const listeners = new Set<Listener>();

/** The phone API's `onMenuCommand`: answers its unsubscribe. */
export function onCommand(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sendCommand(id: string): void {
  for (const listener of listeners) listener(id);
}
