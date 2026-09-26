import { type ComponentType, useMemo } from "react";
import { listLayout } from "../utils/listStructure";
import EditableBlock from "./EditableBlock";

type Block = { id: string; type: string; text?: string; [key: string]: unknown };

interface Props {
  /** The version's own id: a new one remounts every block, which paints it. */
  versionId: string;
  noteId: string;
  blocks: Block[];
  noteTitleSet: unknown;
  accentColor: string;
  /** A key that would edit: the past is read-only, and says how to edit. */
  onTypeIntoPast: () => void;
}

const noop = () => {};
// A .jsx component: its props are untyped to TypeScript.
const ReadOnlyBlock = EditableBlock as unknown as ComponentType<Record<string, unknown>>;

/**
 * A version of the note, shown in the note's own place with the note's own
 * blocks, read-only. The blocks paint their text from the ref they are
 * handed, never from the render, so they are handed one that holds the
 * version and nothing else: the note's state, its history and its file are
 * never touched. Every handler that would edit is a no-op, and every key,
 * paste, cut or drop that would edit is stopped before a field sees it.
 * Selecting and copying still work.
 */
export default function PastVersionView({
  versionId,
  noteId,
  blocks,
  noteTitleSet,
  accentColor,
  onTypeIntoPast,
}: Props) {
  const noteDataRef = useMemo(
    () => ({ current: { [noteId]: { id: noteId, content: { blocks } } } }),
    [noteId, blocks],
  );
  const positions = listLayout(blocks);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      key={versionId}
      data-past-version
      role="region"
      aria-label="Earlier version, read-only"
      aria-readonly="true"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the version can be focused to select and copy from it
      tabIndex={0}
      onKeyDownCapture={(e) => {
        const edits =
          (e.key.length === 1 && !e.metaKey && !e.ctrlKey) ||
          e.key === "Enter" ||
          e.key === "Backspace" ||
          e.key === "Delete" ||
          (e.metaKey && (e.key === "v" || e.key === "x" || e.key === "z"));
        if (!edits) return;
        stop(e);
        onTypeIntoPast();
      }}
      onBeforeInputCapture={stop}
      onPasteCapture={stop}
      onCutCapture={stop}
      onDropCapture={stop}
      style={{ outline: "none" }}
    >
      {blocks.map((block, i) => (
        <ReadOnlyBlock
          key={`${versionId}-${block.id}`}
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
          onUpdateLang={noop}
          onUpdateCallout={noop}
          onUpdateCalloutTitle={noop}
          onUpdateTableCell={noop}
          onUpdateTableRows={noop}
          noteTitleSet={noteTitleSet}
          onBlockNav={noop}
          isBlockSelected={false}
          onBlockSelect={noop}
          onImageLightbox={noop}
          onImageCopyImage={noop}
          onUpdateBlockProperty={noop}
          onFileOpen={noop}
          onFileShowInFolder={noop}
          noteDataRef={noteDataRef}
          onNavigateToNote={noop}
        />
      ))}
    </div>
  );
}
