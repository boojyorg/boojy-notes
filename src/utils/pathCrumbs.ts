/**
 * The note's path in the chrome row: which folders to show in the room the
 * row has, and nothing about where they sit (CSS centres them; see NotePath).
 *
 * The rule (2026-09-15): the richest form that fits the band between the
 * chrome row's controls. Forms, richest first, for a note in `A / B / C`:
 *
 *     A / B / C / name
 *     … / B / C / name
 *     … / C / name
 *     … / name
 *     name                (and then the name itself truncates)
 *
 * Outer folders give way first and the nearest folder is the last to go, so
 * the name is never cut while a folder could go instead. Fit is judged
 * against the band alone, never against the room that is symmetric about the
 * pane's centre: a form that fits the band is shown, shifted off centre if it
 * must be. That is what makes the choice monotonic in the window's width —
 * a wider band never hides a folder a narrower one showed — and it is what
 * the two mockup rules of 2026-09-14 both got wrong (one dropped to the bare
 * name the moment the centre came back into play, the other capped the shift
 * and fell back to a different form past the cap).
 */

/** The parent folders of a vault-relative folder path, outermost first. */
export function parentFolders(folder: string | null | undefined): string[] {
  if (!folder) return [];
  return folder.split("/").filter((s) => s.length > 0);
}

export interface CrumbWidths {
  /** Each parent folder's rendered width, outermost first. */
  parents: number[];
  /** The separator's width, margins included. */
  sep: number;
  /** The ellipsis crumb's width. */
  ellipsis: number;
  /** The name's width (its placeholder's, when it is empty). */
  name: number;
}

export interface CrumbForm {
  /** How many of the nearest parents to show. */
  keep: number;
  /** Whether an ellipsis stands in for the parents not shown. */
  ellipsis: boolean;
  /** Whether even the name alone does not fit and must truncate. */
  truncated: boolean;
}

/** The rendered width of a form: kept parents, the ellipsis when any are dropped, the name. */
export function formWidth(w: CrumbWidths, keep: number, ellipsis: boolean): number {
  const n = w.parents.length;
  let total = w.name;
  for (let i = n - keep; i < n; i++) total += w.parents[i] + w.sep;
  if (ellipsis) total += w.ellipsis + w.sep;
  return total;
}

/**
 * The richest form whose width fits `available`. Every form from the full
 * path down to the bare name is tried in order; the bare name is the answer
 * of last resort whether or not it fits.
 */
export function pickCrumbForm(w: CrumbWidths, available: number): CrumbForm {
  const n = w.parents.length;
  for (let keep = n; keep >= 0; keep--) {
    const ellipsis = keep < n;
    if (formWidth(w, keep, ellipsis) <= available) return { keep, ellipsis, truncated: false };
  }
  return { keep: 0, ellipsis: false, truncated: w.name > available };
}
