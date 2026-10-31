/**
 * Where you were in a note, for Back and Forward to return to
 * (`useNoteHistory`): the block at the top of the view and how far down the
 * pane its top stood, and the caret, only if it was on screen. Blocks by id,
 * never pixels from the top: an edit made while away (here or by another app,
 * which keeps unchanged blocks' ids) moves pixels, not ids.
 */

export interface NotePlace {
  /** At the very top: restored as the top, whatever is first now. */
  atTop: boolean;
  /**
   * The block at the top of the view, with its neighbours as fallbacks; `top`
   * in CSS pixels, so a change of Interface size between visits still lands.
   */
  anchor: { id: string; before: string | null; after: string | null; top: number } | null;
  /** The caret, if it was on screen and collapsed; a selection is never kept. */
  caret: { id: string; offset: number } | null;
}

/**
 * The block to scroll back to and how far down the pane its top goes: the
 * anchor if it survives, else its nearest surviving neighbour (the one after
 * first: it moved up into the anchor's place), else nothing, and the note
 * opens at its top.
 */
export function resolveAnchor(
  place: NotePlace,
  ids: ReadonlySet<string>,
): { id: string; top: number } | null {
  const a = place.anchor;
  if (place.atTop || !a) return null;
  for (const id of [a.id, a.after, a.before]) if (id && ids.has(id)) return { id, top: a.top };
  return null;
}

/** The caret to put back: only in a block that still exists. */
export function resolveCaret(
  place: NotePlace,
  ids: ReadonlySet<string>,
): { id: string; offset: number } | null {
  return place.caret && ids.has(place.caret.id) ? place.caret : null;
}

interface Block {
  id: string;
}

/**
 * The place as the page shows it now. `caretIn` reads the caret: the block id
 * and offset it rests in and its own line's rect (`caretRect`: a tall block can
 * show while the caret's line is scrolled away), or null for none, a
 * selection, or one outside the note. Rects are viewport pixels; `zoom` (the
 * UI scale, `cssZoom`) turns them into the CSS pixels scrollTop counts. Null
 * with no block on screen (an empty or unmounted note).
 */
export function capturePlace(
  blocks: readonly Block[],
  refs: Record<string, Element | null | undefined>,
  scroller: Element,
  caretIn: () => { id: string; offset: number; line: DOMRect } | null,
  zoom = 1,
): NotePlace | null {
  const pane = scroller.getBoundingClientRect();
  let anchor: NotePlace["anchor"] = null;
  for (let i = 0; i < blocks.length; i++) {
    const r = refs[blocks[i].id]?.getBoundingClientRect();
    if (r && r.bottom > pane.top) {
      anchor = {
        id: blocks[i].id,
        before: blocks[i - 1]?.id ?? null,
        after: blocks[i + 1]?.id ?? null,
        top: (r.top - pane.top) / zoom,
      };
      break;
    }
  }
  if (!anchor) return null;
  const c = caretIn();
  const showing = c && c.line.bottom > pane.top && c.line.top < pane.bottom;
  const caret = showing ? { id: c.id, offset: c.offset } : null;
  return { atTop: scroller.scrollTop <= 0, anchor, caret };
}
