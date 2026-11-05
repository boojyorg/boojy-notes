import { useNoteData } from "../../context/NoteDataContext";
import { useTheme } from "../../hooks/useTheme";
import { embedTarget } from "../../utils/embedTarget";
import ReadOnlyBlocks from "../ReadOnlyBlocks";
import { EmbedOpenRightIcon, EmbedOpenUpRightIcon } from "../Icons";
import { Tooltip, useTooltip } from "../Tooltip";
import { useRef } from "react";

/**
 * `![[Note]]`, `![[Note#Heading]]`, `![[#^id]]`: what the target names, drawn
 * by the editor's own renderer, read-only (ReadOnlyBlocks), whole, set apart
 * by a neutral line, from the vault's live note data so it follows edits to
 * its note. The source's name, under it on hover, is a link to it. A link
 * inside reads as it does in its own note (`data-embed-source`), never in
 * this one. A note that embeds itself, at any depth, is said, not drawn.
 *
 * The copy sits inside the editor's one editable surface, so it is fenced:
 * not editable, and every key, input, paste, cut and drop that would edit is
 * stopped before the editor sees it. Copy is the browser's: the selection's
 * text and HTML, never the editor's whole-block copy.
 */
function EmbedBlock(props) {
  const { noteData } = useNoteData();
  return <EmbedView {...props} noteData={noteData} />;
}

const MAX_DEPTH = 3;

function EmbedView({
  block,
  noteData,
  noteTitleSet,
  accentColor,
  hostNote,
  viewNote = hostNote,
  ancestors = [],
  depth = 0,
}) {
  const { theme } = useTheme();
  const openTip = useTooltip();
  const openRef = useRef(null);
  const { TEXT } = theme;
  const quiet = (text) => (
    <div data-embed-missing style={{ color: TEXT.muted, fontSize: 14, padding: "4px 0" }}>
      {text}
    </div>
  );

  const found = embedTarget(block, noteData, hostNote, viewNote);
  if (found.missing) return quiet(found.missing);
  const key = `${found.noteId}#${found.subpath ?? ""}`;
  if (ancestors.includes(key) || depth >= MAX_DEPTH)
    return quiet("This embeds itself, so it isn't shown again.");

  // Runs of ordinary blocks are drawn read-only; an embed among them is drawn
  // here, so it knows the chain it sits in.
  const runs = [];
  for (const b of found.blocks) {
    const last = runs[runs.length - 1];
    if (b.type === "embed") runs.push({ embed: b });
    else if (last?.blocks) last.blocks.push(b);
    else runs.push({ blocks: [b] });
  }
  const own = (e) => e.currentTarget.contains(e.target);
  const stop = (e) => {
    if (!own(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const edits = (e) =>
    (e.key.length === 1 && !e.metaKey && !e.ctrlKey) ||
    e.key === "Enter" ||
    e.key === "Backspace" ||
    e.key === "Delete" ||
    ((e.metaKey || e.ctrlKey) && (e.key === "v" || e.key === "x"));

  return (
    <div
      className="embed"
      data-embed
      data-embed-source={found.linkName}
      contentEditable={false}
      suppressContentEditableWarning
      onKeyDownCapture={(e) => {
        if (own(e) && edits(e)) stop(e);
      }}
      onBeforeInputCapture={stop}
      onPasteCapture={stop}
      onCutCapture={stop}
      onDropCapture={stop}
      // The browser's copy of what is selected, never the editor's block copy.
      onCopy={(e) => {
        if (own(e)) e.stopPropagation();
      }}
      // Its text selects and copies: the whole-block root it sits in turns selection off.
      // The look (line, ground or frame) is GlobalStyles', by `html[data-embed-look]`.
      style={{ userSelect: "text" }}
    >
      {/* Its source, one press away: the arrow in its own strip on the right,
          muted at rest, its chip saying where it goes. EditorArea follows it. */}
      <button
        ref={openRef}
        type="button"
        tabIndex={-1}
        className="embed-open"
        aria-label={found.openLabel}
        data-target={found.fullTarget}
        {...openTip.handlers}
        onMouseDown={(e) => {
          e.preventDefault();
          openTip.handlers.onMouseDown();
        }}
      >
        <span className="embed-open-up-right">
          <EmbedOpenUpRightIcon size={16} />
        </span>
        <span className="embed-open-right">
          <EmbedOpenRightIcon size={16} />
        </span>
      </button>
      {openTip.shown && <Tooltip label={found.openLabel} anchor={openRef.current} />}
      {runs.map((run, i) =>
        run.embed ? (
          <EmbedView
            key={run.embed.id}
            block={run.embed}
            noteData={noteData}
            noteTitleSet={noteTitleSet}
            accentColor={accentColor}
            hostNote={found.noteId}
            viewNote={viewNote}
            ancestors={[...ancestors, key]}
            depth={depth + 1}
          />
        ) : (
          <ReadOnlyBlocks
            // Remounted when the source changes: a block paints only on a signal.
            key={`${i}:${found.version}`}
            noteId={found.noteId}
            blocks={run.blocks}
            noteTitleSet={noteTitleSet}
            accentColor={accentColor}
            idPrefix={`embed:${block.id}:${depth}:`}
          />
        ),
      )}
    </div>
  );
}

export { EmbedView };
export default EmbedBlock;
