import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { getAPI } from "../services/apiProvider";
import { WINDOW_STRIP_H } from "../constants/layout";
import { panelTransition } from "../tokens/motion";

interface WindowStripProps {
  sidebarVisible: boolean;
  sidebarWidth: number;
}

/**
 * Windows and Linux: the strip across the window's top. The window has no
 * title bar of its own (electron/main.js), so this row holds what one would:
 * the application menu's names at the left, each opening the real menu under
 * it (`popup-menu`, electron/appMenu.ts), and room at the right where the
 * system draws its window buttons (the title bar overlay). No title text.
 * Below it, the app's own row is the Mac's.
 *
 * Each column keeps its colour to the window's top: the sidebar's grey runs
 * under the menu's names while the sidebar shows and slides away with it,
 * and the rest is the note's ground, as the window buttons' is. The strip is
 * where the window is dragged from; the names are not. Alt alone opens the
 * first menu, as a Windows menu bar does.
 */
export default function WindowStrip({ sidebarVisible, sidebarWidth }: WindowStripProps) {
  const { theme } = useTheme() as { theme: Record<string, Record<string, string>> };
  const { BG, TEXT } = theme;
  const api = getAPI() as Window["electronAPI"] | null;
  const [labels, setLabels] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    let live = true;
    api?.menuLabels?.().then((l) => live && setLabels(l));
    const off = api?.onMenuClosed?.(() => setOpen(null));
    return () => {
      live = false;
      off?.();
    };
  }, [api]);

  // The window buttons take the note's ground and the primary ink.
  useEffect(() => {
    api?.setTitleBarOverlay?.({ color: BG.editor, symbolColor: TEXT.primary });
  }, [api, BG.editor, TEXT.primary]);

  const popup = (label: string) => {
    const el = refs.current.get(label);
    if (!el || !api?.popupMenu) return;
    const r = el.getBoundingClientRect();
    setOpen(label);
    api.popupMenu(label, r.left, r.bottom);
  };

  // Alt pressed and let go on its own opens the first menu.
  const altAlone = useRef(false);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  const popupRef = useRef(popup);
  popupRef.current = popup;
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      altAlone.current = e.key === "Alt" && !e.repeat;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Alt" && altAlone.current && labelsRef.current[0]) {
        e.preventDefault();
        popupRef.current(labelsRef.current[0]);
      }
      altAlone.current = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
    };
  }, []);

  return (
    <div
      data-testid="window-strip"
      data-drag-region
      style={
        {
          position: "relative",
          height: WINDOW_STRIP_H,
          flexShrink: 0,
          background: BG.editor,
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="panel-motion"
        style={{
          position: "absolute",
          inset: "0 auto 0 0",
          width: sidebarVisible ? sidebarWidth : 0,
          background: BG.standard,
          transition: panelTransition("width"),
        }}
      />
      <div
        role="menubar"
        aria-label="Application menu"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: "100%",
          paddingLeft: 6,
          gap: 1,
          width: "fit-content",
        }}
      >
        {labels.map((label) => (
          <button
            key={label}
            ref={(el) => {
              if (el) refs.current.set(label, el);
              else refs.current.delete(label);
            }}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => popup(label)}
            onMouseEnter={() => setHover(label)}
            onMouseLeave={() => setHover((h) => (h === label ? null : h))}
            style={
              {
                WebkitAppRegion: "no-drag",
                height: 24,
                padding: "0 8px",
                border: "none",
                borderRadius: 6,
                background: open === label || hover === label ? BG.hover : "transparent",
                color: TEXT.primary,
                font: "inherit",
                fontSize: 13,
                cursor: "default",
              } as React.CSSProperties
            }
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
