// Pure tree-building logic for the sidebar folder structure.

/** @typedef {import("../types/notes").SidebarNode} SidebarNode */

/**
 * Locale-aware natural comparison (e.g. "Week 2" < "Week 10").
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Build a nested folder tree from a list of folder nodes.
 *
 * Folders are always natural-alphabetical. There is no manual ordering: drag
 * changes a note's *location*, the sort preference decides *display order*.
 * `sortNotes` applies that preference to every folder's note list; omit it and
 * notes come out in raw membership order.
 *
 * @param {Array<{name: string, children?: any[], _path?: string}>} nodes
 * @param {Record<string, string[]>} folderNoteMap
 * @param {(ids: string[]) => string[]} [sortNotes]
 * @returns {SidebarNode[]}
 */
export function buildTree(nodes, folderNoteMap, sortNotes) {
  return nodes.map((node) => {
    const nodePath = node._path || node.name;
    const children = buildTree(
      (node.children || []).map((c) => ({ ...c, _path: nodePath + "/" + c.name })),
      folderNoteMap,
      sortNotes,
    );
    const notes = folderNoteMap[nodePath] || [];
    return {
      name: node.name,
      _path: nodePath,
      notes: sortNotes ? sortNotes(notes) : notes,
      children: [...children].sort((a, b) => naturalCompare(a.name, b.name)),
    };
  });
}

/**
 * Convert a flat array of folder path strings into a nested tree.
 * E.g. ["University", "University/25-26 Semester 2/COMP208"] →
 *   [{ name: "University", children: [{ name: "25-26 Semester 2", children: [{ name: "COMP208", children: [] }] }] }]
 * @param {string[]} paths
 * @returns {Array<{name: string, children: any[]}>}
 */
export function pathsToTree(paths) {
  const root = {};
  for (const p of paths) {
    const parts = p.split("/");
    let cursor = root;
    for (const part of parts) {
      if (!cursor[part]) cursor[part] = {};
      cursor = cursor[part];
    }
  }
  function toArray(obj) {
    return Object.entries(obj)
      .sort(([a], [b]) => naturalCompare(a, b))
      .map(([name, subtree]) => ({
        name,
        children: toArray(subtree),
      }));
  }
  return toArray(root);
}

/**
 * Collect all folder paths from a tree of nodes.
 * @param {Array<{name: string, children?: any[]}>} nodes
 * @param {string} [prefix]
 * @returns {string[]}
 */
export function collectPaths(nodes, prefix = "") {
  const paths = [];
  for (const n of nodes) {
    const p = prefix ? prefix + "/" + n.name : n.name;
    paths.push(p);
    paths.push(...collectPaths(n.children || [], p));
  }
  return paths;
}
