import { useRef, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { MissingAttachmentIcon, MoreHorizontalIcon, RevealIcon, TrashIcon } from "../Icons";
import ImageMenu, { type MenuAnchor } from "./ImageMenu";

type Theme = { BG: Record<string, string>; TEXT: Record<string, string> };

interface Props {
  /** What the note links to (`photo.png`, `Reading/report.pdf`), shown as its last segment. */
  src: string;
  image?: boolean;
  /** Desktop only, and never for a web address: pick the file and copy it in. */
  onFind?: () => void;
  onRemove: () => void;
}

/** A file the vault could hold (desktop only): never a web address or a pasted data URL. */
export const findable = (src: string | null | undefined): src is string =>
  !!src && !!window.electronAPI?.findAttachment && !/^[a-z][a-z0-9+.-]*:/i.test(src);

const rectOf = (el: Element): MenuAnchor => {
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
};

/**
 * An attachment the note links to that is not in the vault: the card keeps
 * the place and shape a file card has, and only its words change. The link
 * in the file is untouched. A click finds the file (Find it…), the ··· or a
 * right-click offers Find it… and Remove. Remove takes the block out, as
 * Delete does elsewhere, and is undoable, so it is not in the danger ink.
 */
export default function MissingAttachment({ src, image = false, onFind, onRemove }: Props) {
  const { theme } = useTheme() as { theme: Theme };
  const { BG, TEXT } = theme;
  const [menu, setMenu] = useState<{ anchor: MenuAnchor; fromBar: boolean } | null>(null);
  const [hovered, setHovered] = useState(false);
  const moreRef = useRef<HTMLSpanElement>(null);
  const name = src.split("/").pop() || src || "Attachment";

  const entries = [
    ...(onFind ? [{ label: "Find it…", icon: <RevealIcon />, action: onFind }] : []),
    { label: "Remove", icon: <TrashIcon />, action: onRemove, rule: !!onFind },
  ];

  return (
    <>
      <div
        data-testid="missing-attachment"
        role={onFind ? "button" : undefined}
        aria-label={`${name}, not found${onFind ? ". Find it" : ""}`}
        contentEditable={false}
        onClick={onFind}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const p = { top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX };
          setMenu({ anchor: p, fromBar: false });
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px 10px 14px",
          borderRadius: 8,
          border: `1px solid ${BG.divider}`,
          background: hovered && onFind ? BG.surface : BG.elevated,
          cursor: onFind ? "pointer" : "default",
          transition: "background 0.15s",
          userSelect: "none",
          color: TEXT.muted,
        }}
      >
        <MissingAttachmentIcon image={image} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: TEXT.secondary,
            fontSize: 13,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </span>
        <span style={{ fontSize: 12, flexShrink: 0 }}>Not found</span>
        <span
          ref={moreRef}
          role="button"
          tabIndex={-1}
          aria-label="Attachment options"
          onClick={(e) => {
            e.stopPropagation();
            if (moreRef.current) setMenu({ anchor: rectOf(moreRef.current), fromBar: true });
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 6,
            flexShrink: 0,
            color: TEXT.secondary,
          }}
        >
          <MoreHorizontalIcon size={16} />
        </span>
      </div>
      {menu && (
        <ImageMenu
          anchor={menu.anchor}
          fromBar={menu.fromBar}
          entries={entries}
          label="Attachment options"
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
