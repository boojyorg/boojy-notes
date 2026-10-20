import { registerPlugin } from "@capacitor/core";

/** The app's own native plugin (android/…/SelectWordPlugin.java). */
const SelectWord = registerPlugin<{ pressAt(point: { x: number; y: number }): Promise<void> }>(
  "SelectWord",
);

/**
 * A long press on the word at (x, y), the page's CSS pixels, made by the
 * WebView as a finger's: its selection comes with handles and the system's
 * Copy menu, which a selection the page makes never gets. Rejects on a phone
 * without the plugin (an older install).
 */
export function selectWordAt(x: number, y: number): Promise<void> {
  return SelectWord.pressAt({ x, y });
}
