import { useEffect, useRef } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { Z } from "../constants/zIndex";

export default function ImageLightbox({ src, alt, onClose }) {
  const containerRef = useRef(null);
  useFocusTrap(containerRef, !!src);

  useEffect(() => {
    const handleKey = (e) => {
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
      aria-label="Image lightbox"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: Z.LIGHTBOX,
        animation: "lightbox-fade-in 0.15s ease",
        cursor: "zoom-out",
      }}
    >
      <style>{`
        @keyframes lightbox-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <img
        src={src}
        alt={alt || ""}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          objectFit: "contain",
          borderRadius: 4,
          cursor: "default",
        }}
      />
    </div>
  );
}
