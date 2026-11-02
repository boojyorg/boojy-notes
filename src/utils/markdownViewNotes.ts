import { NOTE_ID_LIST_MAX, readNoteIds, withNoteId, writeNoteIds } from "./noteIdLists";

/**
 * The notes left in the Markdown view (SourceView). Each note keeps its own
 * view, across note switches and restarts (`noteIdLists`).
 */
export const MARKDOWN_VIEW_KEY = "boojy-markdown-view-notes";
export const MARKDOWN_VIEW_MAX = NOTE_ID_LIST_MAX;

export const readMarkdownViewNotes = (): string[] => readNoteIds(MARKDOWN_VIEW_KEY);
export const withMarkdownView = withNoteId;
export const writeMarkdownViewNotes = (ids: string[]): void => writeNoteIds(MARKDOWN_VIEW_KEY, ids);
