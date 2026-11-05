/**
 * What an embed (`![[Note]]`, `![[Note#Heading]]`, `![[#^id]]`) shows, found
 * as a click on the same link finds it: the note its name gives (none: the
 * note the embed sits in), then the heading's section or the block an ID
 * names (headingTarget, blockTarget), else the whole note less its
 * properties. A name no note has, or two, and a heading or block the note
 * lacks, are said in the words the click's toast uses.
 */
import type { Block, NoteData } from "../types/notes";
import { blockSubpath, findBlockTarget } from "./blockTarget";
import { findHeadingSection, headingSegments } from "./headingTarget";
import {
  linkTargetFor,
  missingBlockMessage,
  missingHeadingMessage,
  parseWikilinkTarget,
  wikilinkLabel,
  wikilinkStatus,
} from "./wikilinkTarget";

interface EmbedBlockLike {
  target?: string;
  heading?: string | null;
}

export type EmbedTarget =
  | { missing: string }
  | {
      missing?: undefined;
      noteId: string;
      subpath: string | null;
      blocks: Block[];
      /** The name a link inside resolves against: the source note's shortest clear target. */
      linkName: string;
      /** The link the source label follows: the note, and the section or block. */
      fullTarget: string;
      label: string;
      /** What the open arrow's chip says: where it goes, and that it goes. */
      openLabel: string;
      /** What the chip says when a key tried to edit the copy: where to edit it. */
      editLabel: string;
      /** Changes when what is shown changes, so the copy repaints. */
      version: string;
    };

/** The target as written: the parser keeps `Note#Heading` apart, and `#…` whole. */
export const writtenEmbedTarget = (b: EmbedBlockLike) =>
  b.heading ? `${b.target ?? ""}#${b.heading}` : (b.target ?? "");

/**
 * The embed fields a typed `![[…]]` makes, split as the parser splits them
 * (utils/markdown: a name before the first `#` is the target, the rest the
 * heading; none, the target is the whole), or null for a line that is not a
 * note embed: no brackets, nothing inside, or a file's (an extension).
 */
export function embedFieldsFrom(line: string): { target: string; heading: string | null } | null {
  const m = /^\s*!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*$/.exec(line);
  if (!m) return null;
  const inner = m[1].trim();
  if (!inner) return null;
  const hash = inner.indexOf("#");
  const file = hash < 0 ? inner : inner.slice(0, hash);
  if (/\.[a-z0-9]+$/i.test(file.trim()) && !/\.md$/i.test(file.trim())) return null;
  const split = /^(.+?)#(.+)$/.exec(inner);
  return split
    ? { target: split[1].trim(), heading: split[2].trim() }
    : { target: inner, heading: null };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function embedTarget(
  block: EmbedBlockLike,
  noteData: NoteData,
  hostNote: string | null,
  /** The note on screen: an embed of it says "in this note". Defaults to the host. */
  viewNote: string | null = hostNote,
): EmbedTarget {
  const written = writtenEmbedTarget(block);
  const parsed = parseWikilinkTarget(written);
  let noteId: string;
  if (!parsed.name) {
    if (!hostNote || !noteData[hostNote]) return { missing: `“${written}” not found.` };
    noteId = hostNote;
  } else {
    const status = wikilinkStatus(written, noteData);
    if (status.kind === "ambiguous")
      return { missing: `${status.ids.length} notes are named “${status.name}”.` };
    if (status.kind !== "note") return { missing: `No note named “${parsed.name}”.` };
    noteId = status.id;
  }
  const note = noteData[noteId];
  const all = (note?.content?.blocks ?? []) as Block[];
  const subpath = parsed.subpath && !/^page=/.test(parsed.subpath) ? parsed.subpath : null;
  const here = noteId === hostNote;
  const title = note?.title || "Untitled";

  let blocks: Block[];
  const segments = headingSegments(subpath);
  const id = blockSubpath(subpath);
  if (segments) {
    const s = findHeadingSection(all, segments);
    if (!s) return { missing: missingHeadingMessage(segments, here ? null : title) };
    blocks = all.slice(s.start, s.end);
  } else if (id) {
    const s = findBlockTarget(all, id);
    if (!s) return { missing: missingBlockMessage(id, here ? null : title) };
    blocks = all.slice(s.start, s.end);
  } else {
    blocks = all.filter((b) => b.type !== "frontmatter");
  }

  const linkName = linkTargetFor(noteId, noteData);
  const fullTarget = subpath ? `${linkName}#${subpath}` : linkName;
  const rest = subpath ? wikilinkLabel(`#${subpath}`) : "";
  const label = subpath ? `${title} > ${rest}` : title;
  const inView = noteId === viewNote;
  const openLabel = inView ? `Go to ${rest || title} in this note` : `Open ${label}`;
  const editLabel = inView ? `Edit it at ${rest || title}, in this note` : `Edit in ${title}`;
  const version = hash(JSON.stringify(blocks));
  return { noteId, subpath, blocks, linkName, fullTarget, label, openLabel, editLabel, version };
}

/**
 * The target a link element names, read where it sits: inside an embed, a
 * link with no note name (`[[#Callouts]]`) is the embedded note's, as it is
 * in its own note.
 */
export function linkTargetIn(el: Element): string {
  const target = el.getAttribute("data-target") || "";
  const source = el.closest("[data-embed-source]")?.getAttribute("data-embed-source");
  if (!source || el.classList.contains("embed-source")) return target;
  return parseWikilinkTarget(target).name ? target : `${source}${target}`;
}
