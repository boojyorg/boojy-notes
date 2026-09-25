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
  /** `f:<path>`, `n:<id>`, `o:<path>` (a file that is not a note) or `a:` (the attachment store). */
  key: string;
  kind: "folder" | "note" | "file" | "attachments";
  /** The folder's path, the note's id, the file's vault-relative path, or `attachments`. */
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
export const fileKey = (path: string) => `o:${path}`;
export const ATTACHMENTS_KEY = "a:";
/** The attachment store's open state lives in `expanded` under this path, which no folder can take. */
export const ATTACHMENTS_PATH = "attachments";

/** Besides notes: the files a folder shows (`""` is the root), and the attachment store's. */
export interface TreeFiles {
  inFolder?: (folderPath: string) => string[];
  attachments?: string[] | null;
  fileLabel?: (path: string) => string;
  attachmentLabel?: (path: string) => string;
}

/**
 * The visible rows, depth first: a folder's subfolders, then its notes, then
 * its other files, then the next sibling; a closed folder's contents are not
 * rows. A note that `noteLabel` answers `null` for (missing, a draft) is not a
 * row either. The attachment store, when shown, is the root's last row.
 */
export function visibleTreeRows(
  folders: TreeFolder[],
  rootNotes: string[],
  expanded: Record<string, boolean>,
  noteLabel: (id: string) => string | null,
  files: TreeFiles = {},
): TreeRow[] {
  const rows: TreeRow[] = [];
  const fileLabel = files.fileLabel ?? ((p: string) => p.slice(p.lastIndexOf("/") + 1));
  const store = files.attachments ?? null;
  const walk = (
    subfolders: TreeFolder[],
    notes: string[],
    level: number,
    parentKey: string | null,
    folderPath: string,
  ) => {
    const shown = notes.filter((id) => noteLabel(id) !== null);
    const others = files.inFolder?.(folderPath) ?? [];
    const withStore = folderPath === "" && store !== null;
    const setsize = subfolders.length + shown.length + others.length + (withStore ? 1 : 0);
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
      if (open) walk(f.children, f.notes, level + 1, key, path);
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
    for (const path of others) {
      pos += 1;
      rows.push({
        key: fileKey(path),
        kind: "file",
        id: path,
        level,
        posinset: pos,
        setsize,
        parentKey,
        label: fileLabel(path),
      });
    }
    if (withStore) {
      const open = !!expanded[ATTACHMENTS_PATH];
      pos += 1;
      rows.push({
        key: ATTACHMENTS_KEY,
        kind: "attachments",
        id: ATTACHMENTS_PATH,
        level,
        posinset: pos,
        setsize,
        parentKey,
        expanded: open,
        label: "Attachments",
      });
      if (open) {
        const label = files.attachmentLabel ?? fileLabel;
        store.forEach((path, i) => {
          rows.push({
            key: fileKey(path),
            kind: "file",
            id: path,
            level: level + 1,
            posinset: i + 1,
            setsize: store.length,
            parentKey: ATTACHMENTS_KEY,
            label: label(path),
          });
        });
      }
    }
  };
  walk(folders, rootNotes, 1, null, "");
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
      if (row.kind !== "folder" && row.kind !== "attachments") return null;
      if (!row.expanded) return { expand: row.key };
      // An open folder's first child is the next row, if it is its child.
      return rows[i + 1]?.parentKey === row.key ? { focus: rows[i + 1].key } : null;
    case "ArrowLeft":
      if ((row.kind === "folder" || row.kind === "attachments") && row.expanded)
        return { collapse: row.key };
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
