import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { isElectronMac } from "../utils/platform";
import { panelTransition } from "../tokens/motion";
import { pickCrumbForm } from "../utils/pathCrumbs";
import { crumbScope } from "../utils/pathTree";
import { cssZoom } from "../utils/domHelpers";
import {
  CHROME_TOP,
  CHROME_BTN,
  CHROME_PATH_RIGHT_INSET,
  ChromeButton,
  chromePathInset,
} from "./EditorChrome";
import PathTreeMenu from "./PathTreeMenu";
import { SCROLLBAR_W } from "../constants/layout";
import { FolderIcon } from "./Icons";

/*
 * The note's path, centred in the editor's chrome row (2026-09-15).
 *
 * `University / Archive / Todd's Note`: the parent folders and then the name,
 * which is the same editable file label it was when it sat in the column, at
 * interface size (14px; the name medium, the folders regular) and in the
 * theme's primary ink, with the folders one step quieter and the slashes muted. A root note shows its
 * name alone; there is no `Notes /` in front of it, and no control of its own.
 *
 * Each folder crumb, and the `…` that stands for hidden ones, is a button
 * (2026-09-16): it opens PathTreeMenu under itself, the sidebar's tree drawn
 * small and scoped to that folder's parent, with the path down to the open
 * note expanded (`crumbScope`). The `…` opens the root the same way. The name
 * is not part of that: a single click on it still renames the file. Browsing
 * changes nothing here; only opening a note does, and then the path is the
 * new note's.
 *
 * The path always carries one clickable location segment. A root note has no
 * folder to click, so a small folder glyph stands in the crumb's slot before
 * its name (`note-path-root`, muted at rest as the Notes row's glyphs are)
 * and opens the root's contents with nothing expanded. Visible at rest, not
 * hover-revealed: with the sidebar hidden it is the one way to browse from
 * the row, and a control you must hover to find is not one (the Notes row's
 * own lesson, 2026-09-12). Still no `Notes /` label.
 *
 * Where it sits is CSS, and only what it shows is JavaScript:
 *
 *   The band is the chrome row's full height and the pane's full width,
 *   sticky at the top of the scroller so the note scrolls under it (it paints
 *   the editor's ground for that reason; at rest it is invisible). Its side
 *   padding keeps `PATH_AIR` clear of the controls: the whole left group,
 *   whichever state the sidebar is in, and the ··· on the right.
 *
 *   On macOS the row is what the window is dragged by, and the draggable part
 *   is a strip that lies strictly between the two control groups (the row's
 *   padding edges), never the row itself (2026-09-16). Chromium collects
 *   `app-region` rectangles in DOM order and applies them in that order, a
 *   later `drag` unioning back over an earlier `no-drag`; the chrome buttons
 *   are rendered before the editor, so a drag rectangle spanning the whole
 *   row put a window-move view over every one of them: the cursor never
 *   changed and the first press moved the window instead. A drag rectangle
 *   that overlaps no control cannot be overridden into one. The path itself
 *   sits inside the strip and opts out, as it must: it comes after the strip.
 *
 *   Inside it two spacers share the room. Equal spacers would centre the path
 *   in the band, which is off the pane's centre by half the difference
 *   between the two paddings (the left group is the wider one). So the
 *   spacer on the narrower side starts with exactly that difference as its
 *   basis and the two then grow alike, which puts the path on the pane's
 *   centre whenever it fits there; when it does not, that basis is the first
 *   thing to shrink (a far larger shrink factor than the path's), so the path
 *   slides toward the band's centre by the least it must and never over a
 *   control. One rule, no cap, no second position to jump to.
 *
 *   The pane's centre and the paddings both move when the sidebar is toggled;
 *   the padding and the basis transition on the panel's clock, as the
 *   history pair does, so the path glides with the row rather than snapping.
 *
 *   What to show is the richest form that fits the band (pathCrumbs.ts): the
 *   outer folders go first, the nearest folder last, the name is cut only
 *   once no folder is left. Fit is measured, never estimated: an invisible
 *   twin of every crumb is laid out beside the path in the same font, and a
 *   ResizeObserver on the band re-reads it as the band's width changes. The
 *   twin and the band are read with the same API, so the UI scale cancels.
 */

const SEP_MX = 6;
/** The shrink factor that makes the bias spacer give way before the path does. */
const BIAS_SHRINK = 1000;

/** The path's font: interface size, regular weight, no letter spacing. */
export const PATH_FONT = { fontSize: 14, fontWeight: 400, lineHeight: "20px" };
/** The name alone is medium (2026-09-17, Tyr: it makes the note's name the
 *  obvious thing in the row): the row stands in for a title bar, whose title
 *  is the heavier item, and the mobile label already sits at 500. Folders
 *  stay regular in secondary ink. 500 is a real cut in any Inter and in the
 *  system font; 450 would be a guess about the reader's font. The twin's
 *  name spans carry it so the fit is measured with the heavier glyphs. */
export const NAME_WEIGHT = 500;
/** The root glyph is a chrome button like the row's others (judged live 2026-09-16:
 *  an 18px glyph in the 32px box, same hover), so its 7px of box either side of
 *  the glyph is most of its air before the name; the gap adds a touch more. */
const ROOT_GLYPH_GAP = 2;
const ROOT_GLYPH_W = CHROME_BTN + ROOT_GLYPH_GAP;

/**
 * Measure the band and the twin and pick the form. Runs on mount, whenever
 * the crumbs change, and on every resize of the band (a window resize, the
 * sidebar's slide frame by frame, a drag of the divider).
 */
function useCrumbFit(bandRef, twinRef, parents, name) {
  const [fit, setFit] = useState({
    form: { keep: parents.length, ellipsis: false, truncated: false },
    placeholderWidth: 0,
  });

  useLayoutEffect(() => {
    const band = bandRef.current;
    const twin = twinRef.current;
    if (!band || !twin) return;
    const measure = () => {
      const spans = twin.children;
      const w = (i) => spans[i].getBoundingClientRect().width;
      const n = parents.length;
      const zoom = cssZoom(band);
      // A root note's glyph sits in front of the name and takes its room; a
      // style value, so scaled up to the measured pixels it is compared with.
      const glyphW = n === 0 ? ROOT_GLYPH_W * zoom : 0;
      const widths = {
        parents: Array.from({ length: n }, (_, i) => w(i)),
        sep: w(n),
        ellipsis: w(n + 1),
        name: w(n + 2) + glyphW,
      };
      const available = band.getBoundingClientRect().width;
      const form = pickCrumbForm(widths, available);
      // The empty field is as wide as its placeholder, so `Untitled` is
      // centred like a name. Measured under the UI scale, written as a style:
      // divided by the zoom, as every measured distance is (domHelpers). The
      // stylesheet applies it only while the field is empty on screen, so it
      // is measured whatever the name is: a Backspace that empties the field
      // must not wait 300 ms for the title to commit before the pill has its
      // width (the placeholder was clipped to a sliver until then).
      const placeholderWidth = Math.ceil(w(n + 3) / zoom);
      setFit((prev) =>
        prev.form.keep === form.keep &&
        prev.form.ellipsis === form.ellipsis &&
        prev.form.truncated === form.truncated &&
        prev.placeholderWidth === placeholderWidth
          ? prev
          : { form, placeholderWidth },
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // A resize is measured after layout and before paint; the new form must
    // be in the DOM before that paint, or the old one is squeezed for a frame
    // (the name cut, the folders still there). flushSync does that; inside
    // the layout effect above the state update is already synchronous.
    const ro = new ResizeObserver(() => flushSync(measure));
    ro.observe(band);
    return () => ro.disconnect();
    // The twin's children are re-measured whenever the crumbs' text changes.
  }, [parents, name, bandRef, twinRef]);

  return fit;
}

/**
 * @param {object} props
 * @param {string[]} props.parents parent folders, outermost first
 * @param {string} props.name the note's title as state holds it (for measurement)
 * @param {boolean} props.collapsed whether the sidebar is hidden
 * @param {boolean} props.fullScreen macOS full screen (no traffic lights)
 * @param {string} props.bg the editor's ground, painted so the note scrolls under the row
 * @param {string | null} [props.activeNote] the open note's id, marked in the popup
 * @param {(id: string) => void} [props.onOpenNote] opens a note chosen in the popup
 * @param {(e: import("react").PointerEvent<HTMLElement>) => void} [props.onRowPointerDown]
 *   the sidebar's press-and-hold drag, so the popup's rows can be dragged onto its folders
 * @param {import("react").ReactNode} props.children the title field
 */
export default function NotePath({
  parents,
  name,
  collapsed,
  fullScreen,
  bg,
  activeNote = null,
  onOpenNote,
  onRowPointerDown,
  children,
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const bandRef = useRef(null);
  const twinRef = useRef(null);
  const { form, placeholderWidth } = useCrumbFit(bandRef, twinRef, parents, name);

  // The folder popup: which crumb opened it (its index in `parents`, -1 for
  // the ellipsis, and the element itself), what it shows, and where it hangs.
  // The open crumb's click closes it; another crumb's switches to that folder.
  const [menu, setMenu] = useState(null);
  const openMenu = useCallback(
    (index, el) => {
      setMenu((prev) => {
        if (prev?.index === index) return null;
        const r = el.getBoundingClientRect();
        return {
          index,
          opener: el,
          ...crumbScope(parents, index),
          anchor: { top: r.top, bottom: r.bottom, left: r.left, right: r.right },
        };
      });
    },
    [parents],
  );
  const closeMenu = useCallback(() => setMenu(null), []);
  // While the popup is open the window's drag regions stand down (GlobalStyles:
  // `html.popup-open [data-drag-region]`), because a press on a drag region
  // goes to the window-move layer and never reaches the page, so a click on
  // the empty top row could not close the popup (found live 2026-09-16). The
  // first press closes; the next drags.
  useEffect(() => {
    document.documentElement.classList.toggle("popup-open", menu !== null);
    return () => document.documentElement.classList.remove("popup-open");
  }, [menu]);

  const padLeft = chromePathInset(collapsed, fullScreen);
  const padRight = CHROME_PATH_RIGHT_INSET;
  // The band sits inside the scroller, whose scrollbar lane is always kept at
  // its right, so its right padding is the inset less the lane: the band ends
  // where it always did on screen, and the bias below, measured from the
  // window's edges, keeps the path on the pane's centre.
  const bandPadRight = padRight - SCROLLBAR_W;
  // The pane's centre sits left of the band's centre by half of this when the
  // left group is the wider (it always is on the desktop); a positive value
  // is the right spacer's head start, a negative one the left's.
  const bias = padLeft - padRight;

  const shown = parents.slice(parents.length - form.keep);
  const sep = (key) => (
    <span
      key={key}
      aria-hidden="true"
      style={{ color: TEXT.muted, margin: `0 ${SEP_MX}px`, flexShrink: 0 }}
    >
      /
    </span>
  );
  // A crumb is a button in the crumb's own ink: no box, no underline, the
  // label lifts to primary on hover and while its popup is open.
  const crumbStyle = (open) => ({
    color: open ? TEXT.primary : TEXT.secondary,
    flexShrink: 0,
    whiteSpace: "nowrap",
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    font: "inherit",
    lineHeight: "inherit",
    cursor: "pointer",
    borderRadius: 4,
    transition: "color 0.12s",
  });
  const lift = (e) => {
    e.currentTarget.style.color = TEXT.primary;
  };
  const rest = (open) => (e) => {
    e.currentTarget.style.color = open ? TEXT.primary : TEXT.secondary;
  };
  // The root glyph: the crumb slot's stand-in when there is no folder, one of
  // the row's own controls (ChromeButton: 32px box, 18px navigation glyph,
  // the same hover), held in its hover state while its popup is open.
  const rootOpen = menu?.index === -1;
  const rootGlyph = (
    <ChromeButton
      data-testid="note-path-root"
      label="Browse notes"
      aria-haspopup="dialog"
      aria-expanded={rootOpen}
      active={rootOpen}
      onClick={(e) => openMenu(-1, e.currentTarget)}
      style={{ flexShrink: 0, marginRight: ROOT_GLYPH_GAP }}
    >
      <FolderIcon size={18} />
    </ChromeButton>
  );

  const crumb = (index, label, testid, ariaLabel) => {
    const open = menu?.index === index;
    return (
      <button
        key={testid + index}
        type="button"
        data-testid={testid}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => openMenu(index, e.currentTarget)}
        onMouseEnter={lift}
        onMouseLeave={rest(open)}
        style={crumbStyle(open)}
      >
        {label}
      </button>
    );
  };
  const spacer = (basis) => ({
    flexGrow: 1,
    flexShrink: basis > 0 ? BIAS_SHRINK : 0,
    flexBasis: basis > 0 ? basis : 0,
    minWidth: 0,
    transition: panelTransition("flex-basis"),
  });

  return (
    <div
      data-testid="note-path-row"
      className="panel-motion"
      style={{
        position: "sticky",
        top: 0,
        zIndex: Z.PATH_ROW,
        flexShrink: 0,
        height: CHROME_TOP + CHROME_BTN,
        boxSizing: "border-box",
        paddingTop: CHROME_TOP,
        paddingLeft: padLeft,
        paddingRight: bandPadRight,
        background: bg,
        transition: panelTransition("padding-left"),
      }}
    >
      {/* The drag strip: the row's height, between the paddings, so it never
          lies under a control (see the header comment). The path, which
          opts out, comes after it. */}
      {isElectronMac && (
        <div
          aria-hidden="true"
          data-testid="note-path-drag"
          data-drag-region=""
          className="panel-motion"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: padLeft,
            right: bandPadRight,
            WebkitAppRegion: "drag",
            transition: panelTransition("left"),
          }}
        />
      )}
      <div
        ref={bandRef}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          height: CHROME_BTN,
          minWidth: 0,
        }}
      >
        <div style={spacer(-bias)} />
        <div
          data-testid="note-path"
          style={{
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            maxWidth: "100%",
            flex: form.truncated ? "1 1 0px" : "0 1 auto",
            ...PATH_FONT,
            whiteSpace: "nowrap",
            WebkitAppRegion: "no-drag",
          }}
        >
          {form.ellipsis && crumb(-1, "…", "note-path-ellipsis", "Hidden folders")}
          {form.ellipsis && sep("sep-ellipsis")}
          {shown.map((folder, i) => {
            const at = parents.length - form.keep + i;
            return [crumb(at, folder, "note-path-folder", undefined), sep(`sep-${at}`)];
          })}
          {parents.length === 0 && rootGlyph}
          <span
            style={{
              display: "flex",
              minWidth: 0,
              maxWidth: "100%",
              flex: form.truncated ? "1 1 0px" : "0 1 auto",
              "--title-placeholder-width": `${placeholderWidth}px`,
            }}
          >
            {children}
          </span>
        </div>
        <div style={spacer(bias)} />
        {menu && (
          <PathTreeMenu
            anchor={menu.anchor}
            scope={menu.scope}
            initialExpanded={menu.expanded}
            activeNote={activeNote}
            opener={menu.opener}
            onOpen={(id) => onOpenNote?.(id)}
            onClose={closeMenu}
            onRowPointerDown={onRowPointerDown}
          />
        )}
        {/* The twin: every crumb at its full width, never shown, only measured. */}
        <div
          ref={twinRef}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 0,
            overflow: "hidden",
            visibility: "hidden",
            pointerEvents: "none",
            display: "flex",
            ...PATH_FONT,
            whiteSpace: "nowrap",
          }}
        >
          {parents.map((folder, i) => (
            <span key={parents.slice(0, i + 1).join("/")}>{folder}</span>
          ))}
          {/* Padding, not margin: a rect excludes margins, and the live
              separator's margins are part of what it takes up. */}
          <span style={{ padding: `0 ${SEP_MX}px` }}>/</span>
          <span>…</span>
          <span style={{ fontWeight: NAME_WEIGHT }}>{name || "Untitled"}</span>
          <span style={{ fontWeight: NAME_WEIGHT }}>Untitled</span>
        </div>
      </div>
    </div>
  );
}
