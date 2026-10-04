import { type ComponentType, useState } from "react";
import { ChromeButton as ChromeButtonJsx } from "./EditorChrome";
import { CloseIcon, RestoreIcon, TrashIcon } from "./Icons";
import Menu, { type MenuAnchor } from "./Menu";

// A .jsx component: its props are untyped to TypeScript.
const ChromeButton = ChromeButtonJsx as unknown as ComponentType<Record<string, unknown>>;

/**
 * A deleted note on screen (Recently Deleted's preview): one lit square in
 * the `</>` slot, the bin on the mode's tint, and its menu is what can be done
 * with the note. Restore puts it back and opens it, Delete permanently asks
 * first, Close goes back to the note that was open. A menu in the corner, not
 * a box in the middle: the note it is about stays readable.
 */
export default function DeletedNoteButton({
  onRestore,
  onPurge,
  onClose,
}: {
  onRestore: () => void;
  onPurge: () => void;
  onClose: () => void;
}) {
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; keyboard: boolean } | null>(null);
  const hide = () => setMenu(null);
  return (
    <>
      <ChromeButton
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({
            anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
            keyboard: e.detail === 0,
          });
        }}
        label="Deleted note"
        lit
        active={!!menu}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        data-testid="deleted-note-button"
      >
        <TrashIcon />
      </ChromeButton>
      {menu && (
        <Menu
          label="Deleted note"
          idPrefix="deleted-note-item"
          testId="deleted-note-menu"
          anchor={menu.anchor}
          align="end"
          gapY={4}
          minWidth={200}
          initialActive={menu.keyboard ? 0 : -1}
          onClose={hide}
          items={[
            {
              label: "Restore note",
              icon: <RestoreIcon />,
              action: () => {
                hide();
                onRestore();
              },
            },
            {
              label: "Delete permanently",
              icon: <TrashIcon />,
              action: () => {
                hide();
                onPurge();
              },
            },
            {
              label: "Close",
              icon: <CloseIcon size={16} />,
              rule: true,
              action: () => {
                hide();
                onClose();
              },
            },
          ]}
        />
      )}
    </>
  );
}
