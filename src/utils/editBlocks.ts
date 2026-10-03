import type { Block, NoteData } from "../types/notes";

/**
 * The updater a block edit hands to a `useHistory` action (`commitNoteData`,
 * `commitTextChange`): `edit` changes a copy of the note's blocks in place.
 * Returning `false` leaves the notes as they were (a commit that changes
 * nothing); any other return is ignored, so `(b) => b.splice(…)` is safe.
 */
export const editBlocks =
  (noteId: string, edit: (blocks: Block[]) => unknown) =>
  (prev: NoteData): NoteData => {
    const note = prev[noteId];
    if (!note) return prev;
    const blocks = [...note.content.blocks];
    if (edit(blocks) === false) return prev;
    return { ...prev, [noteId]: { ...note, content: { ...note.content, blocks } } };
  };

/** `editBlocks` for one block's fields: `patch` is merged over the block, or computed from it. */
export const patchBlock = (
  noteId: string,
  index: number,
  patch: Partial<Block> | ((block: Block) => Partial<Block>),
) =>
  editBlocks(noteId, (blocks) => {
    const block = blocks[index];
    blocks[index] = { ...block, ...(typeof patch === "function" ? patch(block) : patch) } as Block;
  });
