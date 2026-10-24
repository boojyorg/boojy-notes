import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useExitGhost } from "../hooks/useExitGhost";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";
import { CloseIcon } from "./Icons";
import { fromTouch } from "../utils/touch";

/** The title row's height; the content keeps clear of it top and bottom. */
export const LIGHTBOX_HEADER = 56;
/** The room either side of the content. */
export const LIGHTBOX_SIDE = 40;

interface LightboxProps {
  /** The dialog's accessible name. */
  label: string;
  /** Shown centred at the top; none for no title. */
  name?: string;
  onClose: () => void;
  /** What is viewed; a click on it doesn't close the view. */
  children: ReactNode;
}

/**
 * Something viewed full size (Obsidian's view): a dark room whatever the
 * theme, a name centred at the top, a close button at the right, the content
 * centred in what is left. Escape, the close button or a click anywhere but
 * the content closes it. The arrow keys close it too, as they always have, so
 * a key meant for the note never lands behind it.
 */
export default function Lightbox({ label, name, onClose, children }: LightboxProps) {
  const { theme } = useTheme();
  const { scrim, ink, hover } = theme.lightbox;
  const containerRef = useRef<HTMLDivElement>(null);
  const [closeHot, setCloseHot] = useState(false);
  // Focus rests on the view itself, as a menu's does, so a view opened with the
  // pointer shows no ring on its close button; Tab still reaches it.
  useFocusTrap(containerRef as RefObject<HTMLElement>, true, "container");
  useExitGhost(containerRef, true);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown"
      ) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      className="motion-fade"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onClick={onClose}
      style={{
        outline: "none",
        position: "fixed",
        inset: 0,
        background: scrim,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        zIndex: Z.LIGHTBOX,
      }}
    >
      <div
        style={{
          position: "relative",
          flexShrink: 0,
          width: "100%",
          height: LIGHTBOX_HEADER,
          boxSizing: "border-box",
          padding: "0 64px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {name && (
          <span
            data-testid="lightbox-name"
            style={{
              color: ink,
              fontSize: 14,
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {name}
          </span>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onMouseEnter={(e) => {
            if (fromTouch(e)) return;
            setCloseHot(true);
          }}
          onMouseLeave={() => setCloseHot(false)}
          style={{
            position: "absolute",
            right: 12,
            top: 12,
            width: 32,
            height: 32,
            padding: 0,
            border: "none",
            borderRadius: 8,
            background: closeHot ? hover : "transparent",
            color: ink,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CloseIcon />
        </button>
      </div>
      <div
        className="lightbox-stage"
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          boxSizing: "border-box",
          padding: `0 ${LIGHTBOX_SIDE}px ${LIGHTBOX_HEADER}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
