/**
 * What the destination chip says a wikilink points at (LinkTooltip): the
 * note's name, with the heading or block the link names (`Guide > Tables`),
 * and where that is, its folder or "in this note" for a link into the open
 * note (`[[#^first-block]]`, which names no note by name). A note no name
 * answers, or two, and a heading or block the note lacks, are said, the
 * chip marked `missing`: the same facts the click acts on
 * (useWikilinkHandlers).
 */
import type { LinkDescription } from "../components/LinkTooltip";
import { blockSubpath, findBlockTarget } from "./blockTarget";
import { findHeadingSection, headingSegments } from "./headingTarget";
import type { NoteData } from "../types/notes";
import { parseWikilinkTarget, wikilinkLabel, wikilinkStatus } from "./wikilinkTarget";

/** Whether the heading or block `subpath` names is in `blocks`; null when it names neither. */
function subpathFound(
  blocks: ReadonlyArray<{ type?: string; text?: string }>,
  subpath: string | null,
): { found: boolean; kind: "heading" | "block" } | null {
  // A file's page (`#page=4`) is the file's, never a heading.
  if (!subpath || /^page=/.test(subpath)) return null;
  const segments = headingSegments(subpath);
  if (segments) return { found: !!findHeadingSection(blocks, segments), kind: "heading" };
  const id = blockSubpath(subpath);
  if (id) return { found: !!findBlockTarget(blocks, id), kind: "block" };
  return null;
}

export function describeWikilink(
  target: string,
  notes: NoteData,
  activeNote: string | null,
): LinkDescription {
  const parsed = parseWikilinkTarget(target);
  const status = parsed.name
    ? wikilinkStatus(target, notes)
    : activeNote && notes[activeNote]
      ? ({ kind: "note", id: activeNote, title: "", folder: null } as const)
      : null;
  if (!status || status.kind === "missing")
    return { label: parsed.name || target, sub: "no note by this name", missing: true };
  if (status.kind === "ambiguous")
    return { label: status.name, sub: `${status.ids.length} notes share this name`, missing: true };

  const here = !parsed.name;
  const rest =
    parsed.subpath && !/^page=/.test(parsed.subpath) ? wikilinkLabel(`#${parsed.subpath}`) : "";
  const label = here ? rest || target : rest ? `${status.title} > ${rest}` : status.title;
  const where = here ? "in this note" : status.folder || "Notes";
  const sub = subpathFound(notes[status.id]?.content?.blocks ?? [], parsed.subpath);
  if (sub && !sub.found) return { label, sub: `no ${sub.kind} by this name`, missing: true };
  return { label, sub: where };
}
