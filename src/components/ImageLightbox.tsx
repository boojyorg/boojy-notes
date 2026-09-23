import { type RefObject, useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";
import { atScale } from "../utils/uiScale";
import { CloseIcon } from "./Icons";

interface ImageLightboxProps {
  src: string;
  alt?: string;
  /** The file's name, shown above the picture; none for inline data. */
  name?: string;
  onClose: () => void;
}

/** The title row's height; the picture keeps clear of it top and bottom. */
const HEADER = 56;

/**
 * An image at full size (2026-09-23, Obsidian's view): a dark room whatever
 * the theme, the file's name centred at the top, a close button at the right,
 * the picture fitted inside the window and never enlarged. Escape, the close
 * button or a click anywhere but the picture closes it. The arrow keys close
 * it too, as they always have, so a key meant for the note never lands behind it.
 */
export default function ImageLightbox({ src, alt, name, onClose }: ImageLightboxProps) {
  const { theme } = useTheme() as {
    theme: { lightbox: { scrim: string; ink: string; hover: string } };
  };
  const { scrim, ink, hover } = theme.lightbox;
  const containerRef = useRef<HTMLDivElement>(null);
  const [closeHot, setCloseHot] = useState(false);
  // Focus rests on the view itself, as a menu's does, so a view opened with the
  // pointer shows no ring on its close button; Tab still reaches it.
  useFocusTrap(containerRef as RefObject<HTMLElement>, !!src, "container");

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

  if (!src) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={name ? `Image: ${name}` : "Image"}
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
        animation: "lightbox-fade-in 0.15s ease",
      }}
    >
      <style>{`
        @keyframes lightbox-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: "relative",
          flexShrink: 0,
          width: "100%",
          height: HEADER,
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
          onMouseEnter={() => setCloseHot(true)}
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
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          boxSizing: "border-box",
          padding: `0 40px ${HEADER}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={src}
          alt={alt || ""}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: atScale(`100vh - ${HEADER * 2}px`),
            objectFit: "contain",
            borderRadius: 4,
          }}
        />
      </div>
    </div>
  );
}
