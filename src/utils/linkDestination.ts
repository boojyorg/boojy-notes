/**
 * What the link picker makes of a typed destination (2026-09-20).
 *
 * A web address is recognised with or without its scheme: `youtube.com`,
 * `bbc.co.uk/news`, `https://example.org`. The picker shows it as
 * `Link to youtube.com` and writes it with `https://` in front when it had
 * none. Anything with a space, or no dot, is a note's name.
 */
const ADDRESS_RE = /^(?:https?:\/\/\S+|(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?)$/i;

/**
 * A link's destination inside its `(…)`, as a regex source: anything but a
 * parenthesis, or a balanced pair holding none, so
 * `[Mercury](https://en.wikipedia.org/wiki/Mercury_(planet))` is one address
 * and not `…Mercury_(planet` with a stray `)` after the link. CommonMark
 * allows balanced parentheses to any depth; one level is what addresses use.
 */
export const LINK_DEST = String.raw`(?:[^()]|\([^()]*\))+`;

/** The address `text` names, with its scheme, or null when it is not one. */
export function readAddress(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t) || !ADDRESS_RE.test(t)) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** The address as a row shows it: no scheme, no `www.`. */
export function shownAddress(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "");
}
