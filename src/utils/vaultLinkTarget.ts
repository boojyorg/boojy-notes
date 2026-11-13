/**
 * What a Markdown link's destination names inside the vault.
 *
 * `[text](Folder/Note.md#Heading)` is the link other Markdown apps write for
 * a note, as `[[Folder/Note#Heading]]` is Obsidian's. A destination with a
 * scheme (`https:`, `mailto:`) or a host (`//example.com`) is an address and
 * names nothing here: null.
 *
 * Otherwise the answer is the paths to try, in order, in the form a
 * wikilink's target takes (`parseWikilinkTarget` reads them): the path taken
 * from the folder of the note the link sits in, then the path as written from
 * the vault's root. Percent-escapes are decoded (`My%20Note.md`). A path that
 * climbs out of the vault is not tried, so a link that only does that names
 * nothing: an empty list, which is a missing path and not an address. A
 * destination may hold spaces, so one that ends like a link's title
 * (`Note.md "A title"`, `Notes (2024)`) is tried whole first and then without it.
 */
export function vaultLinkTargets(dest: string, fromFolder: string | null): string[] | null {
  let address = dest.trim();
  if (address.startsWith("<") && address.endsWith(">")) address = address.slice(1, -1);
  // A scheme is followed by its address at once; `Re: plan.md` is a name.
  if (!address || /^[a-z][a-z0-9+.-]+:(?=\S)/i.test(address) || address.startsWith("//")) {
    return null;
  }
  const untitled = address.replace(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/, "");
  const targets = [address, untitled].flatMap((a) => pathsOf(a, fromFolder));
  return [...new Set(targets)];
}

function pathsOf(address: string, fromFolder: string | null): string[] {
  const hash = address.indexOf("#");
  const path = decode(hash === -1 ? address : address.slice(0, hash));
  const subpath = hash === -1 ? "" : `#${decode(address.slice(hash + 1))}`;
  // `#Heading` alone names a heading of the note the link sits in.
  if (!path) return subpath ? [subpath] : [];
  const fromRoot = normalise(path.replace(/^\/+/, ""));
  const fromNote = path.startsWith("/") ? null : normalise(`${fromFolder ?? ""}/${path}`);
  return [fromNote, fromRoot].filter((p): p is string => !!p).map((p) => `${p}${subpath}`);
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
