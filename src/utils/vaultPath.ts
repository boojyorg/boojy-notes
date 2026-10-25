/**
 * Vault-relative paths: `/`-separated, no leading slash, the root as null
 * where a folder is meant. The one place that splits them.
 */

/** The last segment: a file's or folder's own name. */
export const baseName = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1);

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

/** Whether `path` is `folder` or lies inside it. */
export const withinFolder = (path: string, folder: string) =>
  path === folder || path.startsWith(`${folder}/`);

/** Renames paths for a folder moved from `from` to `to`: it and everything under it follow. */
export const remapFolderPath = (from: string, to: string) => (path: string) =>
  withinFolder(path, from) ? to + path.slice(from.length) : path;
