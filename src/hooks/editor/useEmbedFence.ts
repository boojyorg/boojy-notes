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

/** A letter, a paste: what would type into a block picked whole. */
const types = (e: KeyboardEvent) =>
  (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) ||
  ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "v");

const plain = (e: KeyboardEvent) => !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey;

/** Ask an embed to say where it is edited (EmbedBlock's `embed-nudge`). */
const nudge = (embed: Element | null | undefined) =>
  embed?.dispatchEvent(new CustomEvent("embed-nudge"));

/**
 * An embed's copy is read-only, yet a selection in it is a selection in the
 * editor's one editable surface, and keys go to what is focused (the editor),
 * never to the embed: the embed's own handlers never hear them. So the fence
 * is the selection's: while it rests in an embed (`[data-embed]`), every key,
 * input, paste, cut and drop that would edit is cancelled on the document in
 * capture, before the editor or the browser acts, and the embed is asked to
 * say where it is edited. Arrows, ⌘C, ⌘A and Escape stay theirs.
 *
 * An embed picked whole (the only block selected): Enter opens its source,
 * a letter or a paste is answered the same way instead of typing elsewhere,
 * and Backspace and Delete stay the selection's (they remove it).
 */
export function useEmbedFence(editorRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const embedOfSelection = (): Element | null => {
      const editor = editorRef.current;
      const sel = window.getSelection();
      if (!editor || !sel?.rangeCount) return null;
      for (const n of [sel.anchorNode, sel.focusNode]) {
        const el = n && (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement);
        const embed = el?.closest("[data-embed]");
        if (embed && editor.contains(embed)) return embed;
      }
      return null;
    };
    const pickedEmbed = (): Element | null => {
      const editor = editorRef.current;
      if (!editor) return null;
      const picked = editor.querySelectorAll(':scope > [data-selected="true"]');
      if (picked.length !== 1 || picked[0].getAttribute("data-block-type") !== "embed") return null;
      return picked[0].querySelector("[data-embed]");
    };
    // A field of the embed's own (its `![[…]]`) owns its keys.
    const inField = () => {
      const a = document.activeElement;
      return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement;
    };
    const cancel = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onKey = (e: KeyboardEvent) => {
      if (inField()) return;
      const inside = embedOfSelection();
      const text = !!inside && !window.getSelection()?.isCollapsed;
      // Text selected in the copy: ⌘C is the browser's copy of that text, never
      // the editor's copy of a block picked by the press that began it.
      if (text && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
        e.stopImmediatePropagation();
        return;
      }
      // Picked whole, a caret merely resting in it: the block's keys.
      const picked = text ? null : pickedEmbed();
      if (!picked) {
        if (!inside || !edits(e)) return;
        cancel(e);
        nudge(inside);
        return;
      }
      if (e.key === "Enter" && plain(e)) {
        cancel(e);
        (picked.querySelector(":scope > .embed-open") as HTMLElement | null)?.click();
      } else if (types(e)) {
        cancel(e);
        nudge(picked);
      }
    };
    const onEdit = (e: Event) => {
      if (inField()) return;
      const inside = embedOfSelection();
      if (!inside) return;
      cancel(e);
      nudge(inside);
    };
    const KINDS = ["beforeinput", "paste", "cut", "drop"];
    document.addEventListener("keydown", onKey, true);
    for (const t of KINDS) document.addEventListener(t, onEdit, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      for (const t of KINDS) document.removeEventListener(t, onEdit, true);
    };
  }, [editorRef]);
}
