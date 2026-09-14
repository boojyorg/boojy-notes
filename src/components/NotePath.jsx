import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "../hooks/useTheme";
import { Z } from "../constants/zIndex";
import { isElectronMac } from "../utils/platform";
import { panelTransition } from "../tokens/motion";
import { pickCrumbForm } from "../utils/pathCrumbs";
import { cssZoom } from "../utils/domHelpers";
import { CHROME_TOP, CHROME_BTN, CHROME_PATH_RIGHT_INSET, chromePathInset } from "./EditorChrome";

/*
 * The note's path, centred in the editor's chrome row (2026-09-15).
 *
 * `University / Archive / Todd's Note`: the parent folders and then the name,
 * which is the same editable file label it was when it sat in the column, at
 * interface size (14px, regular weight) and in the theme's primary ink, with
 * the folders one step quieter and the slashes muted. A root note shows its
 * name alone; there is no `Notes /` in front of it. Nothing here looks
 * clickable: folder navigation from the row is a separate decision.
 *
 * Where it sits is CSS, and only what it shows is JavaScript:
 *
 *   The band is the chrome row's full height and the pane's full width,
 *   sticky at the top of the scroller so the note scrolls under it (it paints
 *   the editor's ground for that reason; at rest it is invisible). Its side
 *   padding keeps `PATH_AIR` clear of the controls: the whole left group,
 *   whichever state the sidebar is in, and the ··· on the right.
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
      const widths = {
        parents: Array.from({ length: n }, (_, i) => w(i)),
        sep: w(n),
        ellipsis: w(n + 1),
        name: w(n + 2),
      };
      const available = band.getBoundingClientRect().width;
      const form = pickCrumbForm(widths, available);
      // The empty field is as wide as its placeholder, so `Untitled` is
      // centred like a name. Measured under the UI scale, written as a style:
      // divided by the zoom, as every measured distance is (domHelpers).
      const placeholderWidth = name ? 0 : Math.ceil(widths.name / cssZoom(band));
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
 * @param {import("react").ReactNode} props.children the title field
 */
export default function NotePath({ parents, name, collapsed, fullScreen, bg, children }) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const bandRef = useRef(null);
  const twinRef = useRef(null);
  const { form, placeholderWidth } = useCrumbFit(bandRef, twinRef, parents, name);

  const padLeft = chromePathInset(collapsed, fullScreen);
  const padRight = CHROME_PATH_RIGHT_INSET;
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
  const crumbStyle = { color: TEXT.secondary, flexShrink: 0, whiteSpace: "nowrap" };
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
        paddingRight: padRight,
        background: bg,
        transition: panelTransition("padding-left"),
        // With no title bar the chrome row is what the window is dragged by;
        // the path itself opts out so a click on the name still edits it.
        WebkitAppRegion: isElectronMac ? "drag" : undefined,
      }}
    >
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
          {form.ellipsis && (
            <span data-testid="note-path-ellipsis" style={crumbStyle}>
              …
            </span>
          )}
          {form.ellipsis && sep("sep-ellipsis")}
          {shown.map((folder, i) => {
            const at = parents.length - form.keep + i;
            return [
              <span key={`folder-${at}`} style={crumbStyle} data-testid="note-path-folder">
                {folder}
              </span>,
              sep(`sep-${at}`),
            ];
          })}
          <span
            style={{
              display: "flex",
              minWidth: name ? 0 : placeholderWidth,
              maxWidth: "100%",
              flex: form.truncated ? "1 1 0px" : "0 1 auto",
            }}
          >
            {children}
          </span>
        </div>
        <div style={spacer(bias)} />
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
          <span>{name || "Untitled"}</span>
        </div>
      </div>
    </div>
  );
}
