import type { Block, NoteData } from "../types/notes";
import { type PropType, readProperties } from "./properties";
import { vaultNotes } from "./vaultNotes";

/**
 * The type chosen for a property's name on this device: what an empty value
 * shows as, and what Add property offers for the name, since a file can't
 * say the type of a value it doesn't hold. A preference of this window
 * (localStorage), never written into the vault; a value, once written, says
 * its own type and wins.
 */
export const PROPERTY_TYPES_KEY = "boojy-property-types";
const TYPES: readonly string[] = ["text", "list", "number", "checkbox", "date", "datetime"];

export function readPropertyTypes(): Record<string, PropType> {
  try {
    const raw = JSON.parse(localStorage.getItem(PROPERTY_TYPES_KEY) || "null");
    if (!raw || typeof raw !== "object") return {};
    return Object.fromEntries(
      Object.entries(raw).filter(([, t]) => typeof t === "string" && TYPES.includes(t)),
    ) as Record<string, PropType>;
  } catch {
    return {};
  }
}

export function rememberPropertyType(name: string, type: PropType): Record<string, PropType> {
  const next = { ...readPropertyTypes(), [name]: type };
  try {
    localStorage.setItem(PROPERTY_TYPES_KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the choice lasts this session */
  }
  return next;
}

/** A name other notes' properties use: the type they write it as (most often), and how many. */
export interface VaultName {
  name: string;
  /** null when every note leaves it empty (the file can't say). */
  type: PropType | null;
  count: number;
}

/**
 * The names other notes' properties use, most used first, then A–Z, each with
 * the type most of them write: what Add property finds by name. Read from the
 * notes' frontmatter as it reads, never from the note being edited. `tags`,
 * `aliases` and `cssclasses` are never offered here.
 */
export function namesInOtherNotes(
  noteData: NoteData | null | undefined,
  exceptNoteId: string,
): VaultName[] {
  const seen = new Map<string, { count: number; types: Map<PropType, number> }>();
  for (const [id, note] of Object.entries(vaultNotes(noteData ?? {}))) {
    if (id === exceptNoteId) continue;
    const first = (note?.content?.blocks as Block[] | undefined)?.[0];
    if (first?.type !== "frontmatter") continue;
    const read = readProperties(first.text ?? "");
    if (!read.ok) continue;
    for (const p of read.props) {
      if (p.fixed) continue;
      const entry = seen.get(p.key) ?? { count: 0, types: new Map() };
      entry.count += 1;
      const type = p.list ? "list" : p.editable ? p.type : null;
      if (type) entry.types.set(type, (entry.types.get(type) ?? 0) + 1);
      seen.set(p.key, entry);
    }
  }
  return [...seen]
    .map(([name, { count, types }]) => ({
      name,
      count,
      // The type most of them write; a tie goes to the order types are offered in.
      type:
        [...types].sort(
          (a, b) => b[1] - a[1] || TYPES.indexOf(a[0]) - TYPES.indexOf(b[0]),
        )[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
