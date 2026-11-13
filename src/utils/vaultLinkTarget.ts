/**
 * What a Markdown link's destination names inside the vault.
 *
 * `[text](Folder/Note.md#Heading)` is the link other Markdown apps write for
 * a note, as `[[Folder/Note#Heading]]` is Obsidian's. A destination with a
 * scheme (`https:`, `mailto:`) or a host (`//example.com`) is an address and
 * names nothing here.
 *
 * The answer is the targets to try, in order, in the form a wikilink's target
 * takes (`wikilinkTarget.ts` and `fileForTarget` read them): the path taken
 * from the folder of the note the link sits in, then the path as written from
 * the vault's root. Percent-escapes are decoded (`My%20Note.md`), a link's
 * title is not part of its address, and a path that climbs out of the vault
 * is not tried.
 */
export function vaultLinkTargets(dest: string, fromFolder: string | null): string[] {
  let address = dest.trim();
  if (address.startsWith("<") && address.endsWith(">")) address = address.slice(1, -1);
  else address = address.replace(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/, "");
  if (!address || /^[a-z][a-z0-9+.-]*:/i.test(address) || address.startsWith("//")) return [];

  const hash = address.indexOf("#");
  const path = decode(hash === -1 ? address : address.slice(0, hash));
  const subpath = hash === -1 ? "" : `#${decode(address.slice(hash + 1))}`;
  // `#Heading` alone names a heading of the note the link sits in.
  if (!path) return subpath ? [subpath] : [];

  const fromRoot = normalise(path.replace(/^\/+/, ""));
  const fromNote = path.startsWith("/") ? null : normalise(`${fromFolder ?? ""}/${path}`);
  const paths = [fromNote, fromRoot].filter((p): p is string => !!p);
  return [...new Set(paths)].map((p) => `${p}${subpath}`);
}

function decode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** A `/`-separated path with `.` and `..` resolved; null when it climbs out of the vault. */
function normalise(path: string): string | null {
  const out: string[] = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment !== "..") out.push(segment);
    else if (out.length) out.pop();
    else return null;
  }
  return out.length ? out.join("/") : null;
}
