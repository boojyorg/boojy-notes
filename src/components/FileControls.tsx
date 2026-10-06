import { type ComponentType, useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import type { FileViewState } from "../hooks/useFileView";
import { ACTUAL_SIZE, FIT_PAGE, FIT_WIDTH, sameZoom } from "../utils/fileView";
import { ChromeButton as ChromeButtonJsx } from "./EditorChrome";
import { ChevronDownIcon, MinusIcon, PageColumnIcon, PlusIcon } from "./Icons";
import Menu, { type MenuAnchor } from "./Menu";
import { Segment, SegmentGroup } from "./Segmented";
import { Tooltip, useTooltip } from "./Tooltip";

// A .jsx component: its props are untyped to TypeScript.
const ChromeButton = ChromeButtonJsx as unknown as ComponentType<Record<string, unknown>>;

/**
 * The menu under the zoom figure: the Settings-style stepper on top, whose
 * − and + leave it open so a page can be grown press by press (and the − and
 * + keys do the same), then the fits, ticked when on. The figure in the
 * middle is Actual Size.
 */
function ZoomMenu({
  view,
  anchor,
  onClose,
}: {
  view: FileViewState;
  anchor: MenuAnchor;
  onClose: () => void;
}) {
  const pdf = view.kind === "pdf";
  const choose = (z: typeof FIT_WIDTH) => () => {
    view.setZoom(z);
    onClose();
  };
  const fits = pdf
    ? [
        { label: "Fit Width", zoom: FIT_WIDTH },
        { label: "Fit Page", zoom: FIT_PAGE },
      ]
    : [{ label: "Fit", zoom: FIT_PAGE }];
  return (
    <Menu
      label="Zoom"
      idPrefix="zoom-menu"
      testId="zoom-menu"
      anchor={anchor}
      align="end"
      onClose={onClose}
      minWidth={0}
      onKey={(e) => {
        if (e.key === "-" || e.key === "_") view.zoomOut();
        else if (e.key === "+" || e.key === "=") view.zoomIn();
        else return false;
        return true;
      }}
      header={
        <div style={{ padding: "2px 2px 6px", display: "flex", justifyContent: "center" }}>
          <SegmentGroup aria-label="Zoom">
            <Segment role="menuitem" aria-label="Zoom out" onClick={view.zoomOut}>
              <MinusIcon size={14} />
            </Segment>
            <Segment
              divider
              role="menuitem"
              aria-label="Actual size"
              data-testid="zoom-figure"
              onClick={view.actualSize}
              style={{ minWidth: 62, fontVariantNumeric: "tabular-nums" }}
            >
              {`${view.percent}%`}
            </Segment>
            <Segment divider role="menuitem" aria-label="Zoom in" onClick={view.zoomIn}>
              <PlusIcon size={14} />
            </Segment>
          </SegmentGroup>
        </div>
      }
      items={[...fits, { label: "Actual Size", zoom: ACTUAL_SIZE }].map((f, i) => ({
        label: f.label,
        role: "menuitemradio" as const,
        checked: sameZoom(view.zoom, f.zoom),
        rule: i === 0,
        action: choose(f.zoom),
      }))}
    />
  );
}

/** The page field: the page in view, typed over to go to another (Enter), Escape puts it back. */
function PageField({ view }: { view: FileViewState }) {
  const { theme } = useTheme();
  const { BG, TEXT, ACCENT } = theme;
  const [draft, setDraft] = useState<string | null>(null);
  const tip = useTooltip();
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      onMouseEnter={tip.handlers.onMouseEnter}
      onMouseLeave={tip.handlers.onMouseLeave}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 13,
        color: TEXT.muted,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        ["WebkitAppRegion" as string]: "no-drag",
      }}
    >
      <input
        aria-label={`Page, of ${view.pageCount}`}
        data-testid="page-field"
        inputMode="numeric"
        value={draft ?? String(view.page)}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
        onFocus={(e) => {
          tip.handlers.onFocus(e);
          e.currentTarget.select();
        }}
        onBlur={() => {
          tip.handlers.onBlur();
          setDraft(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const n = Number(draft);
            if (draft && n > 0) view.goTo(n);
            setDraft(null);
            // Back to the pages, which take the page keys.
            (document.querySelector("[data-testid='pdf-pages']") as HTMLElement | null)?.focus({
              preventScroll: true,
            });
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(null);
            e.currentTarget.blur();
          }
        }}
        style={{
          width: `${Math.max(2, String(view.pageCount).length) + 1.2}ch`,
          height: 24,
          boxSizing: "border-box",
          border: `1px solid ${theme.button.border}`,
          borderRadius: 6,
          background: BG.editor,
          color: TEXT.primary,
          font: "inherit",
          fontSize: 13,
          textAlign: "center",
          padding: "0 2px",
          outlineColor: ACCENT.text,
        }}
      />
      <span>of {view.pageCount}</span>
      {tip.shown && (
        <Tooltip
          label="Go to page"
          anchor={ref.current}
          placement="below"
          testId="chrome-tooltip"
        />
      )}
    </span>
  );
}

/**
 * A viewed file's controls in the top row, left of ···: the page column's
 * toggle, the zoom figure with its menu, the page field. In a narrow window
 * the toggle goes (the column closes itself there); the figure and the field
 * stay. A file the app can't show has none. Their width is reported so the
 * path's band ends before them.
 */
export default function FileControls({ view }: { view: FileViewState }) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const { setControlsWidth } = view;

  // The path's band ends before these: their width, as they change (CSS pixels).
  useEffect(() => {
    if (!root) return;
    const measure = () => setControlsWidth(root.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => {
      ro.disconnect();
      setControlsWidth(0);
    };
  }, [root, setControlsWidth]);

  if (view.kind === "card") return null;
  const pdf = view.kind === "pdf";
  return (
    <div
      ref={setRoot}
      data-testid="file-controls"
      style={{ display: "flex", alignItems: "center", gap: 6 }}
    >
      {pdf && view.columnFits && (
        <ChromeButton
          onClick={view.toggleColumn}
          label={view.column ? "Hide page thumbnails" : "Show page thumbnails"}
          aria-pressed={view.column}
          on={view.column}
          data-testid="page-column-toggle"
        >
          <PageColumnIcon />
        </ChromeButton>
      )}
      <ChromeButton
        onClick={(e: React.MouseEvent<HTMLElement>) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu((m) =>
            m ? null : { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
          );
        }}
        label="Zoom"
        aria-haspopup="menu"
        aria-expanded={!!menu}
        active={!!menu}
        data-testid="zoom-button"
        style={{
          width: "auto",
          gap: 2,
          padding: "0 6px 0 8px",
          fontSize: 13,
          fontFamily: "inherit",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {view.zoomLabel}
        <ChevronDownIcon size={13} />
      </ChromeButton>
      {menu && <ZoomMenu view={view} anchor={menu} onClose={() => setMenu(null)} />}
      {pdf && view.pageCount > 0 && <PageField view={view} />}
    </div>
  );
}
