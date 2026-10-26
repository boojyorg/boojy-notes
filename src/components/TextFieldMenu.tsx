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
      setMenu({
        anchor: { top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX },
        field,
      });
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
