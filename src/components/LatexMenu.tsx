import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import type { LatexCompletion } from "../hooks/useLatexCompletion";
import { katexNow, loadKatex } from "../utils/inlineMath";
import { MENU_PAD, MENU_RADIUS, MENU_ROW_RADIUS } from "../constants/layout";
import { Z } from "../constants/zIndex";
import { fromTouch } from "../utils/touch";

const MONO = "'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

/**
 * The `\` menu's rows under a formula's source: the symbol drawn, the command,
 * a plain word muted. Inside the source's panel (so a press on a row is a
 * press in the panel, which keeps it open) and never focused: the field keeps
 * the caret and the phone's keyboard. Below the panel, or above it when the
 * window's foot is too close; its height is capped and it scrolls.
 */
export default function LatexMenu({ completion }: { completion: LatexCompletion }) {
  const { theme } = useTheme();
  const { offer, active, setActive, choose } = completion;
  const menuRef = useRef<HTMLDivElement>(null);
  const [katex, setKatex] = useState(katexNow);
  const [above, setAbove] = useState(false);

  useEffect(() => {
    if (!katex) loadKatex().then(setKatex);
  }, [katex]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: placed again when the rows change
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const host = menu.parentElement?.getBoundingClientRect();
    const room = window.visualViewport?.height ?? window.innerHeight;
    setAbove(
      !!host && host.bottom + menu.offsetHeight + 8 > room && host.top > menu.offsetHeight + 8,
    );
  }, [offer?.rows]);

  // The highlighted row stays in view as the arrows move.
  useEffect(() => {
    menuRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!offer) return null;

  return (
    <div
      ref={menuRef}
      className="motion-pop"
      role="listbox"
      aria-label="LaTeX commands"
      style={{
        position: "absolute",
        left: 0,
        ...(above ? { bottom: "calc(100% + 4px)" } : { top: "calc(100% + 4px)" }),
        zIndex: Z.WIKILINK_MENU,
        minWidth: 240,
        maxHeight: 260,
        overflowY: "auto",
        padding: MENU_PAD,
        background: theme.BG.elevated,
        border: `1px solid ${theme.BG.divider}`,
        borderRadius: MENU_RADIUS,
        boxShadow: theme.modalShadow,
      }}
    >
      {offer.rows.map((row, i) => {
        const drawn = katex?.renderFormula(row.sample, false);
        return (
          <div
            key={row.command}
            role="option"
            aria-selected={i === active}
            // The field keeps its caret, its selection and the phone's keyboard.
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(i)}
            onMouseEnter={(e) => {
              if (!fromTouch(e)) setActive(i);
            }}
            style={{
              display: "grid",
              gridTemplateColumns: "56px auto 1fr",
              alignItems: "center",
              gap: 10,
              padding: "5px 10px",
              borderRadius: MENU_ROW_RADIUS,
              cursor: "pointer",
              background: i === active ? theme.BG.hover : "transparent",
              transition: "background var(--motion-fast)",
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: theme.TEXT.primary, overflow: "hidden", whiteSpace: "nowrap" }}
              // biome-ignore lint/security/noDangerouslySetInnerHtml: KaTeX's own markup from the app's fixed list
              dangerouslySetInnerHTML={{ __html: drawn && "html" in drawn ? drawn.html : "" }}
            />
            <span style={{ font: `12.5px ${MONO}`, color: theme.TEXT.primary }}>{row.command}</span>
            <span style={{ fontSize: 12.5, color: theme.TEXT.muted, textAlign: "right" }}>
              {row.words[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
