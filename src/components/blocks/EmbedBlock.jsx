import { useEffect, useRef, useState } from "react";
import { useNoteData } from "../../context/NoteDataContext";
import { useTheme } from "../../hooks/useTheme";
import { embedFieldsFrom, embedTarget, writtenEmbedTarget } from "../../utils/embedTarget";
import { BAND_REACH, bandFill } from "../../utils/selectionBand";
import { EmbedOpenIcon } from "../Icons";
import ReadOnlyBlocks from "../ReadOnlyBlocks";
import { Tooltip, useTooltip } from "../Tooltip";

/**
 * `![[Note]]`, `![[Note#Heading]]`, `![[#^id]]`: what the target names, drawn
 * by the editor's own renderer, read-only (ReadOnlyBlocks), whole, set apart
 * by a neutral line, from the vault's live note data so it follows edits to
 * its note. An arrow in its own strip on the right, always shown and muted,
 * opens the source; its chip says where. A link inside reads as it does in
 * its own note (`data-embed-source`). A note that embeds itself, at any
 * depth, is said, not drawn.
 *
 * A whole block (`isSelectableBlock`): a click that selects no text picks it,
 * and its `![[…]]` opens underneath as a field, as a formula's source does.
 * Its copy edits nothing (useEmbedFence); a key that would is answered by the
 * arrow's chip saying where to edit (`embed-nudge`), never silence.
 */
function EmbedBlock(props) {
  const { noteData } = useNoteData();
  return <EmbedView {...props} noteData={noteData} />;
}

const MAX_DEPTH = 3;
const NUDGE_MS = 2500;

function EmbedView({
  block,
  noteData,
  noteTitleSet,
  accentColor,
  hostNote,
  viewNote = hostNote,
  ancestors = [],
  depth = 0,
  isSelected = false,
  onSelect,
  onUpdate,
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const openTip = useTooltip();
  const openRef = useRef(null);
  const embedRef = useRef(null);
  const [nudged, setNudged] = useState(false);

  // A key that would edit the copy: the chip says where to edit, at once.
  useEffect(() => {
    const el = embedRef.current;
    if (!el) return;
    let timer = 0;
    const onNudge = () => {
      setNudged(true);
      clearTimeout(timer);
      timer = window.setTimeout(() => setNudged(false), NUDGE_MS);
    };
    el.addEventListener("embed-nudge", onNudge);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("embed-nudge", onNudge);
    };
  });

  const found = embedTarget(block, noteData, hostNote, viewNote);
  const key = found.missing ? null : `${found.noteId}#${found.subpath ?? ""}`;
  const loops = key != null && (ancestors.includes(key) || depth >= MAX_DEPTH);

  let body;
  if (found.missing || loops) {
    body = (
      <div data-embed-missing style={{ color: TEXT.muted, fontSize: 14, padding: "4px 0" }}>
        {found.missing ?? "This embeds itself, so it isn't shown again."}
      </div>
    );
  } else {
    // Runs of ordinary blocks are drawn read-only; an embed among them is
    // drawn here, so it knows the chain it sits in.
    const runs = [];
    for (const b of found.blocks) {
      const last = runs[runs.length - 1];
      if (b.type === "embed") runs.push({ embed: b });
      else if (last?.blocks) last.blocks.push(b);
      else runs.push({ blocks: [b] });
    }
    const tip = nudged ? found.editLabel : found.openLabel;
    body = (
      <div
        ref={embedRef}
        className="embed"
        data-embed
        data-embed-source={found.linkName}
        contentEditable={false}
        suppressContentEditableWarning
        // Its text selects and copies: the whole-block root it sits in turns selection off.
        style={{ userSelect: "text" }}
        // The browser's copy of what is selected, never the editor's block copy.
        onCopy={(e) => {
          if (e.currentTarget.contains(e.target)) e.stopPropagation();
        }}
      >
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
        {/* Its source, one press away: the arrow in its own strip on the right,
            always shown, its chip saying where it goes. EditorArea follows it. */}
        <button
          ref={openRef}
          type="button"
          tabIndex={-1}
          className={nudged ? "embed-open is-nudged" : "embed-open"}
          aria-label={found.openLabel}
          data-target={found.fullTarget}
          {...openTip.handlers}
          onMouseDown={(e) => {
            e.preventDefault();
            openTip.handlers.onMouseDown();
          }}
        >
          <EmbedOpenIcon size={16} />
        </button>
        {(openTip.shown || nudged) && <Tooltip label={tip} anchor={openRef.current} />}
      </div>
    );
  }

  if (depth > 0) return body;

  // The note's own block: picked by a click that selects no text, its source
  // underneath while picked.
  return (
    <div
      data-selection-surface
      onMouseUp={(e) => {
        if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.closest?.(".embed-open, .wikilink, a, input")) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        onSelect?.();
      }}
      style={{
        margin: `0 -${BAND_REACH}px`,
        padding: `2px ${BAND_REACH}px`,
        borderRadius: 4,
        background: isSelected ? bandFill(accentColor, theme.name) : "transparent",
      }}
    >
      {body}
      {isSelected && <EmbedSourceField block={block} onUpdate={onUpdate} />}
    </div>
  );
}

/**
 * The embed's `![[…]]`, editable while it is picked: Enter or leaving saves it
 * in one step, Escape puts it back. Only another note embed is taken; a line
 * that reads otherwise (a picture, a file, no brackets) goes back as it was.
 */
function EmbedSourceField({ block, onUpdate }) {
  const { theme } = useTheme();
  const written = `![[${writtenEmbedTarget(block)}]]`;
  const [draft, setDraft] = useState(written);
  const ref = useRef(null);
  useEffect(() => setDraft(written), [written]);
  // The editor's own beforeinput seam sits on its root: this field's edits are its own.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const own = (e) => e.stopPropagation();
    el.addEventListener("beforeinput", own);
    return () => el.removeEventListener("beforeinput", own);
  }, []);
  const save = () => {
    const fields = embedFieldsFrom(draft);
    if (!fields || draft.trim() === written) {
      setDraft(written);
      return;
    }
    onUpdate?.(fields);
  };
  return (
    <input
      ref={ref}
      className="embed-source-field"
      aria-label="Embed's link"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      // Its input is its own: reaching the editor's, it read as typing in the
      // block and left an empty undo step before the next ⌘Z's.
      onInput={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          // Leaving saves (onBlur): saved here too, it was two undo steps.
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(written);
          e.currentTarget.blur();
        }
      }}
      onBlur={save}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        display: "block",
        width: "100%",
        marginTop: 6,
        padding: "4px 6px",
        border: `1px solid ${theme.BG.divider}`,
        borderRadius: 6,
        background: theme.BG.editor,
        color: theme.TEXT.secondary,
        font: "13px ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    />
  );
}

export { EmbedView };
export default EmbedBlock;
