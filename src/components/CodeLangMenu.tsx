import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useMenuPosition } from "../hooks/useMenuPosition";
import { Z } from "../constants/zIndex";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { cssZoom } from "../utils/domHelpers";
import { CheckIcon } from "./Icons";

/**
 * A code block's language menu, opened from the label at its bottom-right
 * corner (2026-09-19, replacing a bespoke dropdown of bare buttons with a
 * typed `✓`, no roles and no keyboard).
 *
 * It is the Sort menu's grammar and nothing else: `menuitemradio` rows in the
 * menu surface, the chosen one marked with a Lucide check in the mark colour,
 * arrows and Enter and Escape on the document. Two things are its own. The
 * labels are flush, with no glyph column: Lucide ships no language marks, and
 * a second icon set of brand logos beside a line set is what makes a UI read
 * as assembled (`Icons.jsx`). And **a letter jumps to a language**, because
 * nine rows is where reading the list beats scanning it; the menu takes focus
 * (`useFocusTrap`) so the letters never reach the code field under it.
 *
 * The list is Plain, then alphabetical: one editorial exception, because Plain
 * is the absence of a language, and a mechanical rule for every language added
 * after it.
 *
 * It portals to `body`, as the table's cell menu and the callout picker do.
 * Rendered where it is opened, it lives inside the editor's contentEditable,
 * and the editor's caret rescue only stands aside for focus that has left the
 * editor (`useMouseHandlers`): the menu took focus and the rescue pulled it
 * straight back a frame later, so the first letter typed went nowhere.
 *
 * **Its keys are its own element's, not the document's**, the one place it
 * departs from SortMenu. A portal moves the DOM but not the React tree, so a
 * key pressed in this menu still bubbles to the editor's `onKeyDown` — which
 * claimed Enter for a new block before any document listener ran, leaving the
 * menu's own to find the event already consumed. Handling it on the menu and
 * stopping it there is what keeps the editor out of it.
 */

export interface CodeLangItem {
  value: string;
  label: string;
}

interface CodeLangMenuProps {
  /** Anchor rect of the language label (viewport coordinates). */
  anchor: { top: number; bottom: number; left: number; right: number };
  languages: CodeLangItem[];
  /** The block's current language value. */
  lang: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}

/** How long a type-ahead buffer lives after the last letter. */
export const TYPE_AHEAD_MS = 700;

/**
 * The item a type-ahead buffer names: the first label starting with it, or,
 * for a repeated single letter, the next label starting with that letter
 * (pressing `s` twice walks SQL → …, as a native menu does).
 */
export function typeAheadIndex(labels: string[], buffer: string, from: number): number {
  const query = buffer.toLowerCase();
  const repeated = buffer.length > 1 && [...buffer].every((c) => c === buffer[0]);
  const needle = repeated ? buffer[0].toLowerCase() : query;
  const start = repeated || buffer.length === 1 ? from + 1 : 0;
  for (let i = 0; i < labels.length; i++) {
    const at = (start + i + labels.length) % labels.length;
    if (labels[at].toLowerCase().startsWith(needle)) return at;
  }
  return -1;
}

const hBg = (el: HTMLElement, c: string) => {
  el.style.background = c;
};

export default function CodeLangMenu({
  anchor,
  languages,
  lang,
  onSelect,
  onClose,
}: CodeLangMenuProps) {
  const { theme } = useTheme() as {
    theme: Record<string, Record<string, string>> & { modalShadow: string };
  };
  const { BG, TEXT, ACCENT } = theme;
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // The pending type-ahead: the letters and the timer that forgets them.
  const typed = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: "",
    timer: null,
  });
  useFocusTrap(menuRef as RefObject<HTMLElement>, true, "container");

  // The label sits at the block's right edge, so the menu's right edge meets
  // it (`align: "end"`); positionMenu flips and clamps on overflow.
  const menuAnchor = useMemo(
    () => ({ top: anchor.top, bottom: anchor.bottom, left: anchor.left, right: anchor.right }),
    [anchor],
  );
  const pos = useMenuPosition(menuRef, true, menuAnchor, { gapY: 4, align: "end" }) as {
    top: number;
    left: number;
  } | null;
  // The UI scale is CSS zoom on <html>: every measured rect arrives multiplied
  // by it and a top/left on this fixed element is multiplied again, so the
  // placement is divided by the zoom before it becomes a style (ContextMenu,
  // PathTreeMenu and the grip do the same).
  const zoom = cssZoom(document.documentElement);

  const choose = useCallback(
    (value: string) => {
      onSelect(value);
      onClose();
    },
    [onSelect, onClose],
  );

  /** Whether the menu takes this key; the caller stops the ones it does. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.defaultPrevented) return false;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) =>
          i === -1 && step === -1
            ? languages.length - 1
            : (i + step + languages.length) % languages.length,
        );
        return true;
      }
      if (e.key === "Home" || e.key === "End") {
        setActiveIndex(e.key === "Home" ? 0 : languages.length - 1);
        return true;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (activeIndex >= 0) choose(languages[activeIndex].value);
        return true;
      }
      if (e.key === "Escape") {
        onClose();
        return true;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // A letter names a language. The buffer is the run of letters typed
        // inside TYPE_AHEAD_MS; a repeated letter walks its matches instead.
        if (typed.current.timer) clearTimeout(typed.current.timer);
        typed.current.buffer += e.key;
        typed.current.timer = setTimeout(() => {
          typed.current.buffer = "";
          typed.current.timer = null;
        }, TYPE_AHEAD_MS);
        setActiveIndex((i) => {
          const next = typeAheadIndex(
            languages.map((l) => l.label),
            typed.current.buffer,
            i,
          );
          return next === -1 ? i : next;
        });
        return true;
      }
      return false;
    },
    [activeIndex, languages, choose, onClose],
  );

  useEffect(() => {
    const pending = typed.current;
    return () => {
      if (pending.timer) clearTimeout(pending.timer);
    };
  }, []);

  return createPortal(
    <>
      <div
        onMouseDown={onClose}
        style={{ position: "fixed", inset: 0, zIndex: Z.CONTEXT_BACKDROP }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Code language"
        aria-activedescendant={activeIndex >= 0 ? `code-lang-item-${activeIndex}` : undefined}
        tabIndex={-1}
        data-testid="code-lang-menu"
        onKeyDown={(e) => {
          if (!handleKeyDown(e)) return;
          e.preventDefault();
          // Stops the React tree, which a portal does not leave: without this
          // the editor under it would act on the same key.
          e.stopPropagation();
        }}
        style={{
          outline: "none",
          position: "fixed",
          top: (pos?.top ?? anchor.bottom + 4) / zoom,
          left: (pos?.left ?? anchor.left) / zoom,
          zIndex: Z.CONTEXT_MENU,
          background: BG.elevated,
          border: `1px solid ${BG.divider}`,
          borderRadius: MENU_RADIUS,
          padding: MENU_PAD,
          minWidth: 200,
          boxShadow: theme.modalShadow,
          animation: "fadeIn 0.1s ease",
        }}
      >
        {languages.map((item, index) => {
          const checked = item.value === lang;
          return (
            <button
              key={item.value || "plain"}
              type="button"
              id={`code-lang-item-${index}`}
              role="menuitemradio"
              aria-checked={checked}
              // The press must not move focus out of the menu before the
              // choice lands, as the label's own press does not.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(item.value)}
              onMouseEnter={(e) => {
                setActiveIndex(index);
                hBg(e.currentTarget, BG.hover);
              }}
              onMouseLeave={(e) => hBg(e.currentTarget, "transparent")}
              style={{
                width: "100%",
                background: index === activeIndex ? BG.hover : "none",
                border: "none",
                borderRadius: MENU_ROW_RADIUS,
                padding: "7px 10px",
                cursor: "pointer",
                color: TEXT.primary,
                fontSize: 12.5,
                fontFamily: "inherit",
                textAlign: "left",
                transition: "background 0.12s",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ flex: 1 }}>{item.label}</span>
              {/* The chosen language's mark: a check in the mark colour, the
                  accent's role as a marker rather than a surface. */}
              {checked && (
                <span
                  aria-hidden="true"
                  data-testid="code-lang-check"
                  style={{ display: "flex", flexShrink: 0, color: ACCENT.primary }}
                >
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
