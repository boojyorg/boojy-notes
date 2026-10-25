/**
 * The notes left in the Markdown view (SourceView). Each note keeps its own
 * view, across note switches and restarts: a preference of this window
 * (localStorage), never written into the vault. Ids are unique across vaults
 * and survive rename and move, so one list serves every vault; the newest
 * are kept, so ids of notes long gone fall off the end.
 */
export const MARKDOWN_VIEW_KEY = "boojy-markdown-view-notes";
export const MARKDOWN_VIEW_MAX = 200;

export function readMarkdownViewNotes(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MARKDOWN_VIEW_KEY) || "null");
    return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** `ids` with `noteId` in the Markdown view (newest last) or out of it. */
export function withMarkdownView(ids: string[], noteId: string, on: boolean): string[] {
  const rest = ids.filter((id) => id !== noteId);
  return on ? [...rest, noteId].slice(-MARKDOWN_VIEW_MAX) : rest;
}

export function writeMarkdownViewNotes(ids: string[]): void {
  try {
    localStorage.setItem(MARKDOWN_VIEW_KEY, JSON.stringify(ids));
  } catch {
    /* storage full or blocked: the view lasts this session */
  }
}
