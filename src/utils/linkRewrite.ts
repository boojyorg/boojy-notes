/**
 * Links follow a rename or a move.
 *
 * One rule: **every link keeps meaning the note it meant.** Given the notes
 * before a change of names or folders and the notes after it, each link is
 * read in both. One that named a note before and would name another, several
 * or none after is rewritten to name that note again; every other link, and
 * every other byte, is left as written. So the one rule covers a rename, a
 * move, a folder's rename, a relative link inside a note that moved, and a
 * bare `[[Plan]]` that a new namesake would have made ambiguous.
 *
 * Read as the click reads them (`wikilinkTarget.ts`, `vaultLinkTarget.ts`):
 * `[[Note]]`, `[[Folder/Note#Heading|alias]]`, an embed's `![[Note]]`, and a
 * Markdown link whose destination is a path. Never inside a code span, a
 * formula or a comment, which are literal, nor in a code or maths block. A
 * link to a file is not a note's and is left alone.
 *
 * Pure: nothing here reads the disk or the DOM. The caller decides when the
 * names have settled and commits what this returns.
 */
import type { Block, Note, NoteData } from "../types/notes";
import { findCodeSpans } from "./codeSpans";
import { literalRuns } from "./footnotes";
import { LINK_DEST } from "./linkDestination";
import { type VaultLinkForm, vaultLinkForms, vaultPathsOf } from "./vaultLinkTarget";
import { vaultNotes } from "./vaultNotes";
import { linkTargetFor, parseWikilinkTarget, wikilinkKey } from "./wikilinkTarget";

// ── What the notes answer to ────────────────────────────────────────────────

/** The notes as links find them: by title, and by the one place each is at. */
interface World {
  notes: NoteData;
  /** A title, lowercased → every note called that. */
  byTitle: Map<string, string[]>;
  /** `folder/title` (the title alone at the root), lowercased → the notes there. */
  byPlace: Map<string, string[]>;
}

const placeOf = (note: { title?: string; folder?: string | null }) => {
  const title = (note.title || "").trim();
  return note.folder ? `${note.folder}/${title}` : title;
};

function worldOf(noteData: NoteData): World {
  const notes = vaultNotes(noteData);
  const byTitle = new Map<string, string[]>();
  const byPlace = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, id: string) => {
    const ids = map.get(key);
    if (ids) ids.push(id);
    else map.set(key, [id]);
  };
  for (const [id, note] of Object.entries(notes)) {
    const title = (note.title || "").trim().toLowerCase();
    if (note._draft || !title) continue;
    add(byTitle, title, id);
    add(byPlace, placeOf(note).toLowerCase(), id);
  }
  return { notes, byTitle, byPlace };
}

const only = (ids: string[] | undefined) => (ids?.length === 1 ? ids[0] : null);

/** The note a wikilink's target names: the one of that title, or the one at that path. */
function wikiNote(target: string, world: World): string | null {
  const parsed = parseWikilinkTarget(target);
  const key = wikilinkKey(parsed);
  if (!key) return null;
  return only((parsed.folder ? world.byPlace : world.byTitle).get(key));
}

const noteAt = (path: string, world: World) =>
  only(world.byPlace.get(path.replace(/\.md$/i, "").toLowerCase()));

/** How a Markdown link's path found its note: from the note's folder, from the root, or by name. */
type Reach = "note" | "root" | "name";
interface PathHit {
  id: string;
  form: VaultLinkForm;
  reach: Reach;
  /** Written `<…>`, as the reading of the destination found it. */
  bracketed: boolean;
}

/** The note a Markdown link's destination names, read from `fromFolder`, as a click reads it. */
function pathNote(dest: string, fromFolder: string | null, world: World): PathHit | null {
  const read = vaultLinkForms(dest);
  if (!read) return null;
  for (const form of read.forms) {
    // `#Heading` alone is the note the link sits in, whatever it is called.
    if (!form.path) return null;
    const { fromNote, fromRoot } = vaultPathsOf(form.path, fromFolder);
    const near = fromNote ? noteAt(fromNote, world) : null;
    if (near) return { id: near, form, reach: "note", bracketed: read.bracketed };
    const far = fromRoot ? noteAt(fromRoot, world) : null;
    if (far) return { id: far, form, reach: "root", bracketed: read.bracketed };
  }
  for (const form of read.forms) {
    const { fromRoot } = vaultPathsOf(form.path, null);
    if (!fromRoot || fromRoot.includes("/")) continue;
    const named = wikiNote(fromRoot, world);
    if (named) return { id: named, form, reach: "name", bracketed: read.bracketed };
  }
  return null;
}

// ── Finding the links in a run of text ──────────────────────────────────────

const WIKILINK_RE = /\[\[([^\]|\n]+)(\|[^\]\n]*)?\]\]/g;
const MD_LINK_RE = new RegExp(String.raw`\[[^\]\n]*\]\((${LINK_DEST})\)`, "g");
/** Inline maths by the renderer's rule (`inlineFormatting.js`): its text is TeX, never a link. */
const MATH_RE = /(?<![\\$])\$(?=[^\s$])(?:[^$\n\\]|\\[^\n])+?(?<=\S)\$(?![$\d])/g;

interface Span {
  start: number;
  end: number;
}

/** A link in a text: where its target or destination sits, and how to read it. */
type Found = Span & ({ kind: "wiki"; target: string } | { kind: "path"; dest: string });

/** Whether the character at `at` is escaped by the backslashes before it. */
function isEscaped(text: string, at: number): boolean {
  let slashes = 0;
  for (let i = at - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

/** Every note link in `text`, in order, none of them inside literal text. */
function findLinks(text: string): Found[] {
  if (!text.includes("[[") && !text.includes("](")) return [];
  const literal: Span[] = [...findCodeSpans(text), ...literalRuns(text)];
  for (const m of text.matchAll(MATH_RE)) {
    literal.push({ start: m.index, end: m.index + m[0].length });
  }
  const free = (start: number, end: number, among: Span[]) =>
    !among.some((s) => start < s.end && end > s.start);

  const found: Found[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const end = m.index + m[0].length;
    if (isEscaped(text, m.index) || !free(m.index, end, literal)) continue;
    // The span is the target alone: the `[[`, an alias and the `]]` stay.
    found.push({ kind: "wiki", start: m.index + 2, end: m.index + 2 + m[1].length, target: m[1] });
  }
  const wikis = found.map((f) => ({ start: f.start - 2, end: f.end }));
  for (const m of text.matchAll(MD_LINK_RE)) {
    const end = m.index + m[0].length;
    if (isEscaped(text, m.index) || !free(m.index, end, literal) || !free(m.index, end, wikis)) {
      continue;
    }
    // The span is the destination alone: the text and the parentheses stay.
    found.push({ kind: "path", start: end - 1 - m[1].length, end: end - 1, dest: m[1] });
  }
  return found.sort((a, b) => a.start - b.start);
}

// ── Writing a link that names the note again ────────────────────────────────

/**
 * Whether `link`, written out, is found again as one link of that kind
 * holding exactly `value`. A name can hold what a link's own syntax is made
 * of (`Notes [2024]`, a `|`, an unclosed parenthesis), and written into one it
 * would be read as something else, or as no link at all.
 */
function readsAs(link: string, kind: Found["kind"], value: string): boolean {
  const found = findLinks(link);
  if (found.length !== 1 || found[0].kind !== kind) return false;
  const one = found[0];
  return (one.kind === "wiki" ? one.target : one.dest) === value;
}

/** A wikilink target for `id` as it now is, its `#heading` kept as written. */
function wikiTargetFor(target: string, id: string, after: World): string {
  const hash = target.indexOf("#");
  return `${linkTargetFor(id, after.notes)}${hash === -1 ? "" : target.slice(hash)}`;
}

/** `to` as a path from the folder `from`: `../` for each folder left. */
function relativePath(from: string | null, to: string): string {
  const base = from ? from.split("/") : [];
  const dest = to.split("/");
  let same = 0;
  while (same < base.length && same < dest.length - 1 && base[same] === dest[same]) same++;
  return [...base.slice(same).map(() => ".."), ...dest.slice(same)].join("/");
}

/**
 * A path as a destination holds it. A `#` would start a heading and a
 * parenthesis may end the link, so those are always escaped; a space is
 * escaped only where the link it replaces escaped its own.
 */
function writePath(path: string, escaped: boolean, bracketed: boolean): string {
  if (bracketed) return path.replace(/>/g, "%3E");
  const safe = path
    .replace(/%(?=[0-9a-f]{2})/gi, "%25")
    .replace(/#/g, "%23")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
  return escaped ? encodeURI(safe).replace(/%25(?=[0-9a-f]{2})/gi, "%") : safe;
}

/** A destination for `hit.id` as it now is, in the style the link was written in. */
function destFor(hit: PathHit, fromFolder: string | null, after: World): string {
  const { form, reach, bracketed } = hit;
  const note = after.notes[hit.id];
  const place = placeOf(note);
  let path: string;
  if (reach === "name") path = (note.title || "").trim();
  else if (reach === "root") path = `${form.path.startsWith("/") ? "/" : ""}${place}`;
  else {
    const rel = relativePath(fromFolder, place);
    path = form.path.startsWith("./") && !rel.startsWith("../") ? `./${rel}` : rel;
  }
  if (/\.md$/i.test(form.path)) path += ".md";
  const written = writePath(path, form.rawPath !== form.path, bracketed) + form.tail;
  return bracketed ? `<${written}>` : written;
}

/**
 * `text` with each link that would stop meaning its note made to mean it
 * again. `fromBefore` and `fromAfter` are the folders of the note the text is
 * in, which a relative path is read from.
 */
function followInText(
  text: string,
  fromBefore: string | null,
  fromAfter: string | null,
  before: World,
  after: World,
  count: { links: number },
): string {
  const links = findLinks(text);
  if (links.length === 0) return text;
  let out = "";
  let at = 0;
  for (const link of links) {
    let next: string | null = null;
    if (link.kind === "wiki") {
      const id = wikiNote(link.target, before);
      if (id && after.notes[id] && wikiNote(link.target, after) !== id) {
        const target = wikiTargetFor(link.target, id, after);
        // Written only if it reads back as that note: never a guess.
        if (readsAs(`[[${target}]]`, "wiki", target) && wikiNote(target, after) === id) {
          next = target;
        }
      }
    } else {
      const hit = pathNote(link.dest, fromBefore, before);
      if (hit && after.notes[hit.id] && pathNote(link.dest, fromAfter, after)?.id !== hit.id) {
        let dest = destFor(hit, fromAfter, after);
        if (pathNote(dest, fromAfter, after)?.id !== hit.id) {
          // A name another note now shares: its one place, from the root.
          dest = destFor({ ...hit, reach: "root" }, fromAfter, after);
        }
        if (
          readsAs(`[x](${dest})`, "path", dest) &&
          pathNote(dest, fromAfter, after)?.id === hit.id
        ) {
          next = dest;
        }
      }
    }
    if (next === null || next === text.slice(link.start, link.end)) continue;
    out += text.slice(at, link.start) + next;
    at = link.end;
    count.links++;
  }
  return at === 0 ? text : out + text.slice(at);
}

// ── A note's blocks ─────────────────────────────────────────────────────────

/** `block` with `follow` run over each text it holds that can hold a link; itself when none changed. */
function followInBlock(block: Block, follow: (text: string) => string): Block {
  switch (block.type) {
    case "code":
    case "math":
    case "image":
    case "file":
    case "spacer":
    case "frontmatter":
      return block;
    case "embed": {
      // An embed block is one link: its note, then the heading or block shown.
      const subpath = block.heading ? `#${block.heading}` : "";
      const target = `${block.target ?? ""}${subpath}`;
      const next = follow(`[[${target}]]`).slice(2, -2);
      if (next === target) return block;
      return { ...block, target: subpath ? next.slice(0, -subpath.length) : next };
    }
    case "table": {
      let changed = false;
      const rows = block.rows?.map((row) =>
        row.map((cell) => {
          const next = follow(cell);
          if (next !== cell) changed = true;
          return next;
        }),
      );
      return changed ? { ...block, rows } : block;
    }
    case "callout": {
      const text = follow(block.text ?? "");
      const title = follow(block.title ?? "");
      if (text === (block.text ?? "") && title === (block.title ?? "")) return block;
      return { ...block, text, ...(block.title === undefined ? null : { title }) };
    }
    default: {
      const text = follow(block.text ?? "");
      return text === (block.text ?? "") ? block : { ...block, text };
    }
  }
}

export interface LinksFollowed {
  /** Each note whose links changed, as it should now be held; only these. */
  notes: Record<string, Note>;
  /** How many links were rewritten, over all of them. */
  links: number;
  /** How many in each of `notes`. */
  perNote: Record<string, number>;
  /** Notes that could not be read for links: online only, or not text. */
  skipped: number;
}

/**
 * What must change so that every link in `after` names the note it named in
 * `before`. The two hold the same notes with the same text; only names and
 * folders differ.
 */
export function linksFollow(beforeData: NoteData, afterData: NoteData): LinksFollowed {
  const before = worldOf(beforeData);
  const after = worldOf(afterData);
  const result: LinksFollowed = { notes: {}, links: 0, perNote: {}, skipped: 0 };
  for (const [id, note] of Object.entries(after.notes)) {
    const was = before.notes[id];
    if (!was || note._draft) continue;
    if (note.offloaded || note.unreadable) {
      result.skipped++;
      continue;
    }
    const blocks = note.content?.blocks;
    if (!blocks?.length) continue;
    const follow = (text: string) =>
      followInText(text, was.folder ?? null, note.folder ?? null, before, after, result);
    let changed = false;
    const linksBefore = result.links;
    const next = blocks.map((block) => {
      const b = followInBlock(block, follow);
      if (b !== block) changed = true;
      return b;
    });
    if (changed) {
      result.notes[id] = { ...note, content: { ...note.content, blocks: next } };
      result.perNote[id] = result.links - linksBefore;
    }
  }
  return result;
}
