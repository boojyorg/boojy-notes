// Pure tree-building logic for the sidebar folder structure.

/**
 * Sort items by a preference order array.
 */
export function sortByOrder(items, orderArr, keyFn) {
  if (!orderArr || orderArr.length === 0) return items;
  const orderMap = {};
  orderArr.forEach((k, i) => { orderMap[k] = i; });
  return [...items].sort((a, b) => {
    const aKey = keyFn(a), bKey = keyFn(b);
    const aIdx = aKey in orderMap ? orderMap[aKey] : 99999;
    const bIdx = bKey in orderMap ? orderMap[bKey] : 99999;
    return aIdx - bIdx;
  });
}

/**
 * Build a nested folder tree from a list of folder nodes.
 */
export function buildTree(nodes, folderNoteMap, sidebarOrder, parentPath = "") {
  return nodes.map(node => {
    const nodePath = node._path || node.name;
    const notes = folderNoteMap[nodePath] || [];
    const sortedNotes = sortByOrder(notes, sidebarOrder[nodePath]?.noteOrder, id => id);
    const children = buildTree(
      (node.children || []).map(c => ({ ...c, _path: nodePath + "/" + c.name })),
      folderNoteMap, sidebarOrder, nodePath
    );
    const sortedChildren = sortByOrder(children, sidebarOrder[parentPath]?.folderOrder, c => c.name);
    return {
      name: node.name,
      _path: nodePath,
      notes: sortedNotes,
      children: sortedChildren,
    };
  });
}

/**
 * Collect all folder paths from a tree of nodes.
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
 * Filter tree by search query. Keeps folders whose name matches or
 * that contain matching descendant notes.
 */
export function filterTree(nodes, searchLc, noteData) {
  if (!searchLc) return nodes;
  const lc = (s) => s.toLowerCase();
  return nodes.map(folder => {
    const filteredChildren = filterTree(folder.children, searchLc, noteData);
    const filteredNotes = folder.notes.filter(n => noteData[n] && lc(noteData[n].title).includes(searchLc));
    const nameMatches = lc(folder.name).includes(searchLc);
    if (nameMatches || filteredChildren.length > 0 || filteredNotes.length > 0) {
      return { ...folder, children: filteredChildren, notes: nameMatches ? folder.notes : filteredNotes };
    }
    return null;
  }).filter(Boolean);
}
