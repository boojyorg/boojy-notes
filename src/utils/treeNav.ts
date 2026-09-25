// The sidebar tree as the keyboard and a screen reader meet it: the rows a
// person can see, in order, each with its level and its place among its
// siblings (WAI-ARIA's tree pattern). The Sidebar renders the same order.

export interface TreeFolder {
  name: string;
  _path?: string;
  children: TreeFolder[];
  notes: string[];
}

export interface TreeRow {
  /** `f:<path>` or `n:<id>`: one namespace for folders and notes. */
  key: string;
  kind: "folder" | "note";
  /** The folder's path or the note's id. */
  id: string;
  /** 1-based, as `aria-level`. */
  level: number;
  posinset: number;
  setsize: number;
  parentKey: string | null;
  expanded?: boolean;
  label: string;
}

export const folderKey = (path: string) => `f:${path}`;
export const noteKey = (id: string) => `n:${id}`;

/**
 * The visible rows, depth first: a folder's subfolders, then its notes, then
 * the next sibling; a closed folder's contents are not rows. A note that
 * `noteLabel` answers `null` for (missing, a draft) is not a row either.
 */
export function visibleTreeRows(
  folders: TreeFolder[],
  rootNotes: string[],
  expanded: Record<string, boolean>,
  noteLabel: (id: string) => string | null,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (
    subfolders: TreeFolder[],
    notes: string[],
    level: number,
    parentKey: string | null,
  ) => {
    const shown = notes.filter((id) => noteLabel(id) !== null);
    const setsize = subfolders.length + shown.length;
    let pos = 0;
    for (const f of subfolders) {
      const path = f._path || f.name;
      const key = folderKey(path);
      const open = !!expanded[path];
      pos += 1;
      rows.push({
        key,
        kind: "folder",
        id: path,
        level,
        posinset: pos,
        setsize,
        parentKey,
        expanded: open,
        label: f.name,
      });
      if (open) walk(f.children, f.notes, level + 1, key);
    }
    for (const id of shown) {
      pos += 1;
      rows.push({
        key: noteKey(id),
        kind: "note",
        id,
        level,
        posinset: pos,
        setsize,
        parentKey,
        label: noteLabel(id) ?? "",
      });
    }
  };
  walk(folders, rootNotes, 1, null);
  return rows;
}

export type TreeMove = { focus: string } | { expand: string } | { collapse: string } | null;

/**
 * What a navigation key does from `current`: move focus, or open or close a
 * folder. Enter, Space and the actions are the rows' own; this is movement.
 * A printable character jumps to the next row whose label starts with it.
 */
export function treeMove(rows: TreeRow[], current: string, key: string): TreeMove {
  const i = rows.findIndex((r) => r.key === current);
  if (i < 0) return rows.length ? { focus: rows[0].key } : null;
  const row = rows[i];
  switch (key) {
    case "ArrowDown":
      return i < rows.length - 1 ? { focus: rows[i + 1].key } : null;
    case "ArrowUp":
      return i > 0 ? { focus: rows[i - 1].key } : null;
    case "Home":
      return { focus: rows[0].key };
    case "End":
      return { focus: rows[rows.length - 1].key };
    case "ArrowRight":
      if (row.kind !== "folder") return null;
      if (!row.expanded) return { expand: row.key };
      // An open folder's first child is the next row, if it is its child.
      return rows[i + 1]?.parentKey === row.key ? { focus: rows[i + 1].key } : null;
    case "ArrowLeft":
      if (row.kind === "folder" && row.expanded) return { collapse: row.key };
      return row.parentKey ? { focus: row.parentKey } : null;
  }
  if (key.length === 1 && key.trim()) {
    const ch = key.toLocaleLowerCase();
    for (let step = 1; step <= rows.length; step++) {
      const r = rows[(i + step) % rows.length];
      if (r.label.toLocaleLowerCase().startsWith(ch)) return { focus: r.key };
    }
  }
  return null;
}
