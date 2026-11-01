/**
 * Formatting ends with its text. Chromium remembers the style of text a
 * deletion removed (its "typing style") and gives it to the next letters
 * typed, so deleting all of `**this is bold**` and typing on wrote
 * `**this is normal**` to the file, and ⌘B there turned the remembered bold
 * *off*. Setting the caret again where it is makes Chromium take the style
 * from the caret's own place, so after a deletion the next letters are
 * formatted by what the caret is in, and nothing else: inside a bold run
 * still bold (a partial deletion, an italic deleted inside bold), outside it
 * plain.
 *
 * Only a deletion: typing over a selection keeps the style it replaces
 * (overtyping corrects a word), and a style turned on at the caret (⌘B) is
 * never touched, since nothing is deleted after it. Desktop behaviour; the
 * phone's keyboard is not yet verified.
 */
export function forgetDeletedStyle(e: InputEvent): boolean {
  if (e.isComposing || !e.inputType?.startsWith("delete")) return false;
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed || !sel.anchorNode) return false;
  sel.collapse(sel.anchorNode, sel.anchorOffset);
  return true;
}
