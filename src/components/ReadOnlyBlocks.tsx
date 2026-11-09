import { type ComponentType, useMemo } from "react";
import { listLayout } from "../utils/listStructure";
import EditableBlock from "./EditableBlock";
import type { Block } from "../types/notes";

interface Props {
  noteId: string;
  blocks: Block[];
  noteTitleSet: unknown;
  accentColor: string;
  /**
   * Put before every block's id: an embed's copy of a note's blocks must never
   * share an id with the blocks the editor owns, or code that asks which
   * block a node is in would take the copy for the note's own.
   */
  idPrefix?: string;
}

const noop = () => {};

/**
 * A note's blocks drawn by the editor's own renderer, read-only: a past
 * version (PastVersionView) and an embed (EmbedBlock) look exactly as the
 * note does. The blocks paint their text from the ref they are handed, never
 * from the render, so they are handed one that holds these blocks and
 * nothing else: no note's state, history or file is touched. Every handler
 * that would edit is a no-op, and `readOnly` takes away the controls that
 * would offer one (a type or language picker, Delete); the caller stops the
 * keys and input that would.
 */
export default function ReadOnlyBlocks({
  noteId,
  blocks,
  noteTitleSet,
  accentColor,
  idPrefix = "",
}: Props) {
  const shown = useMemo(
    () => (idPrefix ? blocks.map((b) => ({ ...b, id: `${idPrefix}${b.id}` })) : blocks),
    [blocks, idPrefix],
  );
  const noteDataRef = useMemo(
    () => ({ current: { [noteId]: { id: noteId, content: { blocks: shown } } } }),
    [noteId, shown],
  );
  const positions = listLayout(shown);
  // Read at render, never at import: EditableBlock draws an embed, an embed
  // draws these, so at import time the cycle has not finished loading it.
  // A .jsx component: its props are untyped to TypeScript.
  const ReadOnlyBlock = EditableBlock as unknown as ComponentType<Record<string, unknown>>;
  return (
    <>
      {shown.map((block, i) => (
        <ReadOnlyBlock
          key={block.id}
          block={block}
          blockIndex={i}
          noteId={noteId}
          onCheckToggle={noop}
          onDeleteBlock={noop}
          registerRef={noop}
          syncGen={0}
          accentColor={accentColor}
          numberedIndex={block.type === "numbered" ? positions[i]?.number : undefined}
          onUpdateText={noop}
          onUpdateCalloutTitle={noop}
          onUpdateTableCell={noop}
          onUpdateTableRows={noop}
          noteTitleSet={noteTitleSet}
          onBlockNav={noop}
          isBlockSelected={false}
          onBlockSelect={noop}
          onImageCopyImage={noop}
          onUpdateBlockProperty={noop}
          onFileOpen={noop}
          onFileOpenDefault={noop}
          onFileShowInFolder={noop}
          noteDataRef={noteDataRef}
          onNavigateToNote={noop}
          readOnly
        />
      ))}
    </>
  );
}
