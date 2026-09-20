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
export function parentRowIndex(
  rows: readonly { kind: string; depth: number }[],
  i: number,
): number {
  const depth = rows[i]?.depth ?? 0;
  for (let j = i - 1; j >= 0; j--) {
    if (rows[j].kind === "folder" && rows[j].depth === depth - 1) return j;
  }
  return -1;
}

// ── The Move to… picker ──────────────────────────────────────────────────

/**
 * A row of the Move to… picker (2026-09-20): the same popup drawn as a
 * destination chooser. Folders only, the root as the first row (`path` null,
 * named `Notes`, always open, since the root is a folder), and a folder that
 * cannot take the thing being moved — the folder itself, or anything inside
 * it — drawn `disabled` rather than left out, so the tree keeps its shape and
 * the reader sees why. Notes never count as children here: a folder with
 * notes and no subfolders has nothing to expand into.
 */
export interface PickRow {
  kind: "folder";
  key: string;
  depth: number;
  /** A vault-relative `/` path, or null for the root. */
  path: string | null;
  name: string;
  open: boolean;
  hasChildren: boolean;
  disabled: boolean;
}

/** The parent folder's path, or null at the root. */
export function parentFolder(path: string): string | null {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? null : path.slice(0, slash);
}

/** Every folder above `path`, outermost first (`a/b/c` → `a`, `a/b`); none for null. */
export function ancestorFolders(path: string | null): string[] {
  if (!path) return [];
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * The one folder a set of things share, `null` for the root, or `undefined`
 * when they are spread over more than one — the picker then ticks nothing.
 */
export function sharedFolder(
  folders: readonly (string | null | undefined)[],
): string | null | undefined {
  if (folders.length === 0) return undefined;
  const first = folders[0] ?? null;
  for (const f of folders) if ((f ?? null) !== first) return undefined;
  return first;
}

/** Whether `path` is `folder` or lies inside it. */
export const withinFolder = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`);

/**
 * The picker's rows, top to bottom: the root, then every folder, its
 * subfolders under it while it is open. `excluded` is the folder being moved,
 * which can go nowhere inside itself; it and its subtree are disabled and
 * never expand.
 */
export function pickerRows(
  tree: SidebarNode[],
  expanded: ReadonlySet<string>,
  excluded: string | null = null,
): PickRow[] {
  const rows: PickRow[] = [
    {
      kind: "folder",
      key: "folder:",
      depth: 0,
      path: null,
      name: "Notes",
      open: true,
      hasChildren: tree.length > 0,
      disabled: false,
    },
  ];
  const walk = (folders: SidebarNode[], depth: number) => {
    for (const folder of folders) {
      const disabled = excluded !== null && withinFolder(folder._path, excluded);
      const hasChildren = folder.children.length > 0 && !disabled;
      const open = hasChildren && expanded.has(folder._path);
      rows.push({
        kind: "folder",
        key: `folder:${folder._path}`,
        depth,
        path: folder._path,
        name: folder.name,
        open,
        hasChildren,
        disabled,
      });
      if (open) walk(folder.children, depth + 1);
    }
  };
  walk(tree, 1);
  return rows;
}
