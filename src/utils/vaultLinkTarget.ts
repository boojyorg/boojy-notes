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
  const read = vaultLinkForms(dest);
  if (!read) return null;
  const targets = read.forms.flatMap((form) => {
    if (!form.path) return form.subpath ? [form.subpath] : [];
    const { fromNote, fromRoot } = vaultPathsOf(form.path, fromFolder);
    return [fromNote, fromRoot].filter((p): p is string => !!p).map((p) => `${p}${form.subpath}`);
  });
  return [...new Set(targets)];
}

/** One reading of a destination: its path, and everything written after it. */
export interface VaultLinkForm {
  /** The path as written, percent-escapes and all. */
  rawPath: string;
  /** The path decoded. Empty for `#Heading` alone. */
  path: string;
  /** The heading, block or page decoded, with its `#`; "" for none. */
  subpath: string;
  /** What follows the path as written: its `#…` and, in the untitled reading, its title. */
  tail: string;
}

/**
 * The readings of a destination that is not an address (null for one that
 * is): whole first, then without what looks like a title. `bracketed` says it
 * was written `<…>`.
 */
export function vaultLinkForms(
  dest: string,
): { forms: VaultLinkForm[]; bracketed: boolean } | null {
  let address = dest.trim();
  const bracketed = address.startsWith("<") && address.endsWith(">");
  if (bracketed) address = address.slice(1, -1);
  // A scheme is followed by its address at once; `Re: plan.md` is a name.
  if (!address || /^[a-z][a-z0-9+.-]+:(?=\S)/i.test(address) || address.startsWith("//")) {
    return null;
  }
  const title = address.match(/\s+(?:"[^"]*"|'[^']*'|\([^)]*\))$/)?.[0] ?? "";
  const form = (text: string, after: string): VaultLinkForm => {
    const hash = text.indexOf("#");
    const rawPath = hash === -1 ? text : text.slice(0, hash);
    const rawSub = hash === -1 ? "" : text.slice(hash);
    return {
      rawPath,
      path: decode(rawPath),
      subpath: rawSub ? `#${decode(rawSub.slice(1))}` : "",
      tail: `${rawSub}${after}`,
    };
  };
  const forms = [form(address, "")];
  if (title) forms.push(form(address.slice(0, -title.length), title));
  return { forms, bracketed };
}

/** Where a decoded path points: from the folder of the note it sits in, and from the vault's root. */
export function vaultPathsOf(
  path: string,
  fromFolder: string | null,
): { fromNote: string | null; fromRoot: string | null } {
  return {
    fromNote: path.startsWith("/") ? null : normalise(`${fromFolder ?? ""}/${path}`),
    fromRoot: normalise(path.replace(/^\/+/, "")),
  };
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
