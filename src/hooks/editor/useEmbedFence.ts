import { type RefObject, useEffect } from "react";

/** Whether this key would edit text where the selection is. */
const edits = (e: KeyboardEvent) =>
  (e.key.length === 1 && !e.metaKey && !e.ctrlKey) ||
  e.key === "Enter" ||
  e.key === "Backspace" ||
  e.key === "Delete" ||
  e.key === "Tab" ||
  ((e.metaKey || e.ctrlKey) &&
    ["v", "x", "z", "y", "b", "i", "e", "k"].includes(e.key.toLowerCase()));

/**
 * An embed's copy is read-only, yet a selection in it is a selection in the
 * editor's one editable surface, and keys go to what is focused (the editor),
 * never to the embed: the embed's own handlers never hear them. So the fence
 * is the selection's: while it rests in an embed (`[data-embed]`), every key,
 * input, paste, cut and drop that would edit is cancelled on the document in
 * capture, before the editor or the browser acts. Arrows, ⌘C, ⌘A and Escape
 * stay theirs.
 */
export function useEmbedFence(editorRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const inEmbed = () => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel?.rangeCount) return false;
      const ends = [sel.anchorNode, sel.focusNode];
      return ends.some((n) => {
        const el = n && (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);
        const embed = el?.closest("[data-embed]");
        return !!embed && editor.contains(embed);
      });
    };
    const cancel = (e: Event) => {
      if (!inEmbed()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if (edits(e)) cancel(e);
    };
    document.addEventListener("keydown", onKey, true);
    for (const t of ["beforeinput", "paste", "cut", "drop"])
      document.addEventListener(t, cancel, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      for (const t of ["beforeinput", "paste", "cut", "drop"])
        document.removeEventListener(t, cancel, true);
    };
  }, [editorRef]);
}
