// @ts-check
// Pure tree-building logic for the sidebar folder structure.

/** @typedef {import("../types.d.ts").SidebarNode} SidebarNode */

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
 * Sort items by a preference order array.
 * @template T
 * @param {T[]} items
 * @param {string[] | null | undefined} orderArr
 * @param {(item: T) => string} keyFn
 * @returns {T[]}
 */
export function sortByOrder(items, orderArr, keyFn) {
  if (!orderArr || orderArr.length === 0) return items;
  const orderMap = {};
  orderArr.forEach((k, i) => {
    orderMap[k] = i;
  });
  return [...items].sort((a, b) => {
    const aKey = keyFn(a),
      bKey = keyFn(b);
    const aIdx = aKey in orderMap ? orderMap[aKey] : 99999;
    const bIdx = bKey in orderMap ? orderMap[bKey] : 99999;
    return aIdx - bIdx;
  });
}

/**
 * Build a nested folder tree from a list of folder nodes.
 * @param {Array<{name: string, children?: any[], _path?: string}>} nodes
 * @param {Record<string, string[]>} folderNoteMap
 * @param {Record<string, {noteOrder?: string[], folderOrder?: string[]}>} sidebarOrder
 * @param {string} [parentPath]
 * @returns {SidebarNode[]}
 */
export function buildTree(nodes, folderNoteMap, sidebarOrder, parentPath = "") {
  return nodes.map((node) => {
    const nodePath = node._path || node.name;
    const notes = folderNoteMap[nodePath] || [];
    const sortedNotes = sortByOrder(notes, sidebarOrder[nodePath]?.noteOrder, (id) => id);
    const children = buildTree(
      (node.children || []).map((c) => ({ ...c, _path: nodePath + "/" + c.name })),
      folderNoteMap,
      sidebarOrder,
      nodePath,
    );
    const hasCustomOrder = sidebarOrder[parentPath]?.folderOrder?.length > 0;
    const sortedChildren = hasCustomOrder
      ? sortByOrder(children, sidebarOrder[parentPath].folderOrder, (c) => c.name)
      : [...children].sort((a, b) => naturalCompare(a.name, b.name));
    return {
      name: node.name,
      _path: nodePath,
      notes: sortedNotes,
      children: sortedChildren,
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

/**
 * Flatten the visible notes in exact sidebar render order.
 * Used by Shift+Click to compute selection range.
 * @param {SidebarNode[]} tree
 * @param {Record<string, boolean>} expanded
 * @param {string[]} rootNotes
 * @returns {string[]}
 */
export function flattenVisibleNotes(tree, expanded, rootNotes) {
  const result = [];
  function walk(nodes) {
    for (const folder of nodes) {
      const folderPath = folder._path || folder.name;
      if (expanded[folderPath]) {
        walk(folder.children);
        for (const nId of folder.notes) result.push(nId);
      }
    }
  }
  walk(tree);
  for (const nId of rootNotes) result.push(nId);
  return result;
}

/**
 * Filter tree by search query. Keeps folders whose name matches or
 * that contain matching descendant notes.
 * @param {SidebarNode[]} nodes
 * @param {string} searchLc
 * @param {Record<string, {title: string}>} noteData
 * @returns {SidebarNode[]}
 */
export function filterTree(nodes, searchLc, noteData) {
  if (!searchLc) return nodes;
  const lc = (s) => s.toLowerCase();
  return nodes
    .map((folder) => {
      const filteredChildren = filterTree(folder.children, searchLc, noteData);
      const filteredNotes = folder.notes.filter(
        (n) => noteData[n] && lc(noteData[n].title).includes(searchLc),
      );
      const nameMatches = lc(folder.name).includes(searchLc);
      if (nameMatches || filteredChildren.length > 0 || filteredNotes.length > 0) {
        return {
          ...folder,
          children: filteredChildren,
          notes: nameMatches ? folder.notes : filteredNotes,
        };
      }
      return null;
    })
    .filter(Boolean);
}
