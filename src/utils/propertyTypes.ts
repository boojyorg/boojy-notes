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

/**
 * The names other notes' properties use, most used first, then A–Z: what Add
 * property offers. Read from the notes' frontmatter as it reads (cached by
 * text), never from the note being edited. `tags`, `aliases` and
 * `cssclasses` are never offered here.
 */
export function namesInOtherNotes(
  noteData: NoteData | null | undefined,
  exceptNoteId: string,
): string[] {
  const counts = new Map<string, number>();
  for (const [id, note] of Object.entries(vaultNotes(noteData ?? {}))) {
    if (id === exceptNoteId) continue;
    const first = (note?.content?.blocks as Block[] | undefined)?.[0];
    if (first?.type !== "frontmatter") continue;
    const read = readProperties(first.text ?? "");
    if (!read.ok) continue;
    for (const p of read.props) {
      if (p.fixed) continue;
      counts.set(p.key, (counts.get(p.key) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([k]) => k);
}
