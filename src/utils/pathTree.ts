/**
 * The path's folder popup: which part of the tree a crumb opens, what starts
 * expanded, and the rows on screen in order (2026-09-16).
 *
 * The rule: clicking a folder crumb shows that folder's *parent's* contents,
 * the clicked folder expanded, and every folder under it on the way to the
 * open note expanded too, so the note's row is in view with a check beside
 * it. A top-level folder therefore opens the root's contents, and the `…`
 * that stands for hidden folders opens the root with the whole path expanded.
 * Nothing here is a second tree: the popup reads the sidebar's own
 * `folderTree` and root list and walks them; only the expansion state is its
 * own, and it starts fresh each time the popup opens.
 */
import type { SidebarNode } from "../types/notes";

export interface TreeScope {
  /** The folders shown at the popup's top level, in the tree's own order. */
  folders: SidebarNode[];
  /** The notes shown after them, in the sort preference's order. */
  notes: string[];
}

/** The folder node at a vault-relative `/` path, or null. */
export function findFolder(tree: SidebarNode[], path: string): SidebarNode | null {
  for (const node of tree) {
    if (node._path === path) return node;
    if (path.startsWith(`${node._path}/`)) return findFolder(node.children, path);
  }
  return null;
}

/** The contents of `scope` (`""` is the root): its subfolders and its notes. */
export function scopeContents(tree: SidebarNode[], rootNotes: string[], scope: string): TreeScope {
  if (!scope) return { folders: tree, notes: rootNotes };
  const node = findFolder(tree, scope);
  return node ? { folders: node.children, notes: node.notes } : { folders: [], notes: [] };
}

/**
 * What a crumb opens. `index` is the clicked folder's position in `parents`
 * (outermost first), or -1 for the ellipsis. The scope is the clicked
 * folder's parent; the expansion is the clicked folder and every folder
 * below it on the path, so the open note's row is reachable at once.
 */
export function crumbScope(
  parents: string[],
  index: number,
): { scope: string; expanded: string[] } {
  const prefixes = parents.map((_, i) => parents.slice(0, i + 1).join("/"));
  if (index < 0) return { scope: "", expanded: prefixes };
  return { scope: index === 0 ? "" : prefixes[index - 1], expanded: prefixes.slice(index) };
}

export type TreeRow =
  | {
      kind: "folder";
      key: string;
      depth: number;
      path: string;
      name: string;
      open: boolean;
      hasChildren: boolean;
    }
  | { kind: "note"; key: string; depth: number; id: string };

/**
 * The rows on screen, top to bottom: each folder, then, when it is open, its
 * subfolders and notes indented one level; the scope's own notes last. The
 * same order the sidebar draws, and the order the arrow keys walk.
 */
export function visibleRows(contents: TreeScope, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (folders: SidebarNode[], notes: string[], depth: number) => {
    for (const folder of folders) {
      const open = expanded.has(folder._path);
      rows.push({
        kind: "folder",
        key: `folder:${folder._path}`,
        depth,
        path: folder._path,
        name: folder.name,
        open,
        hasChildren: folder.children.length > 0 || folder.notes.length > 0,
      });
      if (open) walk(folder.children, folder.notes, depth + 1);
    }
    for (const id of notes) rows.push({ kind: "note", key: `note:${id}`, depth, id });
  };
  walk(contents.folders, contents.notes, 0);
  return rows;
}

/** The index of the folder row that holds row `i`, or -1 at the top level. */
export function parentRowIndex(rows: TreeRow[], i: number): number {
  const depth = rows[i]?.depth ?? 0;
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].kind === "folder" && rows[j].depth === depth - 1) return j;
  }
  return -1;
}
