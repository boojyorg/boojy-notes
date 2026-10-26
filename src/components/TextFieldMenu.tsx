import { useEffect, useState } from "react";
import { menuAnchorFor } from "../utils/contextSelection";
import { isElectron } from "../utils/platform";
import EditorContextMenu from "./EditorContextMenu";
import type { MenuAnchor } from "./Menu";

/** Input types that hold text a person types. */
const TEXT_TYPES = new Set(["text", "search", "url", "email", "tel", "number", ""]);

type TextField = HTMLInputElement | HTMLTextAreaElement;

/**
 * The text field a right-click landed in, outside the note (the editor has its
 * own menu): an input, a textarea, or an editable element such as the note's
 * name in the chrome row.
 */
function textFieldOf(target: EventTarget | null): TextField | HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest('input, textarea, [contenteditable="true"], [contenteditable=""]');
  if (!field || field.closest("[data-editor]")) return null;
  if (field instanceof HTMLTextAreaElement) return field;
  if (field instanceof HTMLInputElement)
    return TEXT_TYPES.has(field.getAttribute("type") ?? "") ? field : null;
  return field instanceof HTMLElement ? field : null;
}

const none = () => {};

/**
 * Where the menu hangs: under the field's line of text, from the start of the
 * selection (from the pointer with none), as the note's menu hangs under the
 * selected words (`menuAnchorFor`). A one-line field's text is measured with
 * its own font; a textarea's lines are not, so it hangs from the pointer.
 */
function fieldAnchor(field: TextField, x: number, y: number): MenuAnchor {
  const at = { top: y, bottom: y, left: x, right: x };
  if (!(field instanceof HTMLInputElement)) return at;
  const box = field.getBoundingClientRect();
  // Layout pixels to the viewport's: the UI scale zooms the field.
  const scale = field.offsetWidth ? box.width / field.offsetWidth : 1;
  const css = getComputedStyle(field);
  const size = Number.parseFloat(css.fontSize) || 13;
  const lineH = (Number.parseFloat(css.lineHeight) || size * 1.25) * scale;
  const top = box.top + (box.height - lineH) / 2;
  let left = x;
  const start = field.selectionStart ?? 0;
  if (start !== field.selectionEnd) {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} ${css.fontFamily}`;
      const inset =
        Number.parseFloat(css.borderLeftWidth) + Number.parseFloat(css.paddingLeft) || 0;
      const words = ctx.measureText(field.value.slice(0, start)).width;
      left = box.left + (inset + words - field.scrollLeft) * scale;
      left = Math.min(Math.max(left, box.left), box.right);
    }
  }
  return { top, bottom: top + lineH, left, right: left };
}

/**
 * Cut, Copy and Paste for every text field outside the note: Search, a
 * rename, the note's name, a Settings field. Electron shows no menu of its
 * own; the note's fields have the editor's (`EditorContextMenu`), and this is
 * the same menu, run the same way: the field keeps focus (the menu never
 * takes it) and the keys' own paths do the work. Desktop only: the phone's
 * long-press is Android's, and a browser has its own.
 */
interface Open {
  anchor: MenuAnchor;
  field: TextField | HTMLElement;
  /** An editable element's selection, put back before an item runs. */
  range: Range | null;
  canCutCopy: boolean;
  editable: boolean;
}

/**
 * Cut, Copy and Paste for every text field outside the note: Search, a
 * rename, the note's name, a Settings field. Electron shows no menu of its
 * own; the note's fields have the editor's (`EditorContextMenu`), and this is
 * the same menu, run the same way: the field keeps focus (the menu never
 * takes it) and the keys' own paths do the work. It answers first (capture),
 * so a rename's field inside a sidebar row gets this menu, never the row's.
 * Desktop only: the phone's long-press is Android's, and a browser has its own.
 */
export default function TextFieldMenu() {
  const [menu, setMenu] = useState<Open | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    const onMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const field = textFieldOf(e.target);
      if (!field) return;
      e.preventDefault();
      e.stopPropagation();
      const x = e.clientX;
      const y = e.clientY;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        setMenu({
          anchor: fieldAnchor(field, x, y),
          field,
          range: null,
          canCutCopy: field.selectionStart !== field.selectionEnd,
          editable: !field.readOnly && !field.disabled,
        });
        return;
      }
      const sel = window.getSelection();
      const range =
        sel?.rangeCount && field.contains(sel.getRangeAt(0).commonAncestorContainer)
          ? sel.getRangeAt(0).cloneRange()
          : null;
      setMenu({
        anchor: menuAnchorFor(range, x, y),
        field,
        range,
        canCutCopy: !!range && !range.collapsed,
        editable: true,
      });
    };
    document.addEventListener("contextmenu", onMenu, true);
    return () => document.removeEventListener("contextmenu", onMenu, true);
  }, []);

  if (!menu) return null;
  const { field, range, editable } = menu;
  const run = (fn: () => void) => () => {
    field.focus({ preventScroll: true });
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    fn();
    setMenu(null);
  };

  return (
    <EditorContextMenu
      anchor={menu.anchor}
      link={null}
      onReplaceWord={none}
      onAddWord={none}
      onOpenLink={none}
      onCopyLink={none}
      onEditLink={none}
      onRemoveLink={none}
      canCutCopy={menu.canCutCopy}
      canPaste={editable && !!window.electronAPI?.paste}
      onCut={run(() => document.execCommand(editable ? "cut" : "copy"))}
      onCopy={run(() => document.execCommand("copy"))}
      onPaste={run(() => window.electronAPI?.paste())}
      onClose={() => setMenu(null)}
      onTop
    />
  );
}
