// Which file in the vault an embed names: the desktop's main process and the
// phone both ask `pickAttachment`, so the two always pick the same copy.

/**
 * The vault path an embed's address spells, or null for one that names no
 * file in the vault: a web address, `//host/…`, inline data. The `#subpath`
 * (`slides.pdf#page=3`, `shot.png#interface`) is not part of the file's
 * name, and a Windows `\` separates folders. A Markdown address (`markdown`:
 * `![](…)`, never `![[…]]`) is a URL, so its `<…>` and percent-escapes
 * (`pic%20six.png`) are read as Obsidian reads them; a wikilink's `%` is
 * part of the name.
 */
export function attachmentRef(src: string | null | undefined, markdown = false): string | null {
  let ref = (src ?? "").trim();
  if (markdown && ref.startsWith("<") && ref.endsWith(">")) ref = ref.slice(1, -1).trim();
  if (!ref || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(ref)) return null;
  const hash = ref.indexOf("#");
  if (hash !== -1) ref = ref.slice(0, hash);
  if (markdown) {
    try {
      ref = decodeURIComponent(ref);
    } catch {
      // A lone `%` is part of the name.
    }
  }
  ref = ref.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  return ref || null;
}

/** `rel` read from `folder` (`../img/x.png` from `Notes`), or null when it climbs out of the vault. */
export function joinVault(folder: string | null | undefined, rel: string): string | null {
  const out: string[] = [];
  for (const seg of [...(folder ? folder.split("/") : []), ...rel.split("/")]) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return out.length ? out.join("/") : null;
}

const byShortestThenName = (a: string, b: string) =>
  a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

/**
 * The vault path of the file an embed names, in Obsidian's order (checked
 * against Obsidian itself, `attachment-resolution.spec.ts`):
 *
 * 1. the path as written, from the vault's top; a `./` or `../` path from
 *    the note's folder instead;
 * 2. the same path in the note's own folder;
 * 3. any file whose path ends with it (a bare name: any file of that name),
 *    the shortest path first. Obsidian breaks a tie by its own file order,
 *    which nothing can reproduce; here A–Z, so every device agrees.
 *
 * `exists` answers for one vault path; `named` lists every vault path whose
 * last segment is that name, lowercased.
 */
export function pickAttachment(
  ref: string,
  noteFolder: string | null | undefined,
  exists: (rel: string) => boolean,
  named: (lowerName: string) => string[],
): string | null {
  let wanted = ref;
  if (/^\.\.?\//.test(ref)) {
    const fromNote = joinVault(noteFolder, ref);
    if (fromNote && exists(fromNote)) return fromNote;
    // Not there: the rest of the path is matched like any other.
    wanted = ref.replace(/^(\.\.?\/)+/, "");
    if (!wanted) return null;
  } else {
    if (exists(ref)) return ref;
    const beside = noteFolder ? joinVault(noteFolder, ref) : null;
    if (beside && exists(beside)) return beside;
  }
  const lower = wanted.toLowerCase();
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  const matches = named(name).filter((p) => {
    const l = p.toLowerCase();
    return l === lower || l.endsWith(`/${lower}`);
  });
  return matches.sort(byShortestThenName)[0] ?? null;
}
