import { useEffect, useState } from "react";
import { isElectron } from "../utils/platform";
import EditorContextMenu from "./EditorContextMenu";
import type { MenuAnchor } from "./Menu";

/** Input types that hold text a person types. */
const TEXT_TYPES = new Set(["text", "search", "url", "email", "tel", "number", ""]);

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** The text field a right-click landed in, outside the note (the editor has its own menu). */
function textFieldOf(target: EventTarget | null): TextField | null {
  if (!(target instanceof Element)) return null;
  const field = target.closest("input, textarea");
  if (!field || field.closest("[data-editor]")) return null;
  if (field instanceof HTMLTextAreaElement) return field;
  if (field instanceof HTMLInputElement && TEXT_TYPES.has(field.getAttribute("type") ?? ""))
    return field;
  return null;
}

const none = () => {};

/**
 * Where the menu hangs: under the field's line of text, from the start of the
 * selection (from the pointer with none), as the note's menu hangs under the
 * selected words (`menuAnchorFor`). A one-line field's text is measured with
 * its own font; a textarea's lines are not, so it hangs from the pointer.
 */
function anchorFor(field: TextField, x: number, y: number): MenuAnchor {
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
export default function TextFieldMenu() {
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; field: TextField } | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    const onMenu = (e: MouseEvent) => {
      // A surface with its own menu has answered already.
      if (e.defaultPrevented) return;
      const field = textFieldOf(e.target);
      if (!field) return;
      e.preventDefault();
      setMenu({ anchor: anchorFor(field, e.clientX, e.clientY), field });
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);

  if (!menu) return null;
  const { field } = menu;
  const run = (fn: () => void) => () => {
    field.focus({ preventScroll: true });
    fn();
    setMenu(null);
  };
  const editable = !field.readOnly && !field.disabled;
  const selected = field.selectionStart !== field.selectionEnd;

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
      canCutCopy={selected}
      canPaste={editable && !!window.electronAPI?.paste}
      onCut={run(() => document.execCommand(editable ? "cut" : "copy"))}
      onCopy={run(() => document.execCommand("copy"))}
      onPaste={run(() => window.electronAPI?.paste())}
      onClose={() => setMenu(null)}
      onTop
    />
  );
}
