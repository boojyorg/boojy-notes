import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNoteData } from "../../context/NoteDataContext";
import { useTheme } from "../../hooks/useTheme";
import {
  embedFieldsFrom,
  embedLinkProblem,
  embedTarget,
  writtenEmbedTarget,
} from "../../utils/embedTarget";
import { BAND_REACH, bandFill } from "../../utils/selectionBand";
import { registerBlockOpener } from "../../utils/blockOpen";
import { isMac } from "../../utils/platform";
import { fontStack } from "../../tokens/typography";
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
  selectedAlone = false,
  onSelect,
  onUpdate,
}) {
  const { theme } = useTheme();
  const { TEXT } = theme;
  const openTip = useTooltip();
  const openRef = useRef(null);
  const embedRef = useRef(null);
  const [nudged, setNudged] = useState(false);
  // The link being edited (picked, its field open): drawn as typed while it
  // names something real, saved once when the edit ends.
  const [draft, setDraft] = useState(null);
  // Its panel is open or shut apart from the pick, as a formula's source is:
  // a click opens it, finishing shuts it and the embed stays picked.
  // `focusGen` counts the asks (Edit link) that put the caret in the link.
  const [open, setOpen] = useState(false);
  const [focusGen, setFocusGen] = useState(0);
  const shut = () => {
    setOpen(false);
    setFocusGen(0);
  };
  useEffect(() => {
    if (selectedAlone) return;
    setDraft(null);
    setOpen(false);
    setFocusGen(0);
  }, [selectedAlone]);
  // The block menu's Edit link (blockOpen). An embed drawn inside one is not
  // the note's block.
  useLayoutEffect(() => {
    if (depth > 0) return undefined;
    return registerBlockOpener(block.id, () => {
      setOpen(true);
      setFocusGen((g) => g + 1);
    });
  }, [block.id, depth]);

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

  const typed = draft == null ? null : embedFieldsFrom(`![[${draft}]]`);
  const trial = typed ? embedTarget({ ...block, ...typed }, noteData, hostNote, viewNote) : null;
  // A draft that names nothing real keeps the last good drawing (the last one
  // typed this edit, else the saved one), its reason said.
  const lastGood = useRef(null);
  if (draft == null) lastGood.current = null;
  else if (trial && !trial.missing) lastGood.current = typed;
  const reason = draft == null ? null : !typed ? embedLinkProblem(draft) : (trial?.missing ?? null);
  // Every field the copy's blocks draw is read-only (a code block's textarea,
  // a cell's or a callout body's own editing host): the fence stops keys,
  // and this stops what no key event announces (an input method's text).
  useEffect(() => {
    const el = embedRef.current;
    if (!el) return;
    for (const f of el.querySelectorAll("textarea, input:not(.embed-link-field)"))
      f.readOnly = true;
    for (const f of el.querySelectorAll('[contenteditable="true"]'))
      f.setAttribute("contenteditable", "false");
  });
  const found =
    trial && !trial.missing
      ? trial
      : embedTarget(
          lastGood.current ? { ...block, ...lastGood.current } : block,
          noteData,
          hostNote,
          viewNote,
        );
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
          // The code block's tool button: one size and hover for a note's tools.
          className={nudged ? "code-tool embed-open is-nudged" : "code-tool embed-open"}
          aria-label={found.openLabel}
          data-target={found.fullTarget}
          {...openTip.handlers}
          onMouseDown={(e) => {
            e.preventDefault();
            openTip.handlers.onMouseDown();
          }}
        >
          <EmbedOpenIcon />
        </button>
        {(openTip.shown || nudged) && <Tooltip label={tip} anchor={openRef.current} />}
      </div>
    );
  }

  if (depth > 0) return body;

  // The note's own block: picked by a click that selects no text, which opens
  // its link underneath.
  return (
    <div
      data-selection-surface
      onMouseUp={(e) => {
        if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.closest?.(".embed-open, .wikilink, a, input")) return;
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
        onSelect?.();
        setOpen(true);
      }}
      style={{
        // The link's panel hangs from here.
        position: "relative",
        margin: `0 -${BAND_REACH}px`,
        padding: `2px ${BAND_REACH}px`,
        borderRadius: 4,
        background: isSelected ? bandFill(accentColor, theme.name) : "transparent",
      }}
    >
      {body}
      {/* The link is this embed's alone: picked with other blocks, just the band. */}
      {selectedAlone && open && (
        <EmbedLinkEditor
          block={block}
          draft={draft}
          setDraft={setDraft}
          reason={reason}
          onSave={onUpdate}
          onShut={shut}
          focusGen={focusGen}
        />
      )}
    </div>
  );
}

/**
 * A picked embed's link, `![[…]]`, in a panel underneath that floats over the
 * text below, as a formula's source does (MathBlock). The embed is drawn as
 * typed while the link names something real (EmbedView); the edit is saved
 * once, in one step, on Enter, Done or leaving; Escape puts it back. Enter,
 * Done and Escape shut the panel and hand the keys to the editor, the embed
 * still picked. A press anywhere else on the panel puts the caret in the link.
 */
function EmbedLinkEditor({ block, draft, setDraft, reason, onSave, onShut, focusGen }) {
  const { theme } = useTheme();
  const written = writtenEmbedTarget(block);
  const ref = useRef(null);
  const doneRef = useRef(null);
  const doneTip = useTooltip();
  const editing = draft != null;
  // The editor's own beforeinput seam sits on its root: this field's edits are its own.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const own = (e) => e.stopPropagation();
    el.addEventListener("beforeinput", own);
    return () => el.removeEventListener("beforeinput", own);
  });
  const finish = (keep) => {
    const fields = keep && draft != null ? embedFieldsFrom(`![[${draft}]]`) : null;
    setDraft(null);
    if (fields && draft.trim() !== written) onSave?.(fields);
  };
  // Edit link: the caret in the link, at its end.
  useEffect(() => {
    const el = ref.current;
    if (!focusGen || !el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusGen]);
  // Enter, Done, Escape: the editor takes the keys back, so the field's blur
  // ends the edit (kept, or put back), and the panel shuts.
  const keepOnBlur = useRef(true);
  const end = (keep) => {
    // A link these fields can't hold stays open, its reason said, never saved
    // without what it can't keep: Enter and Done alike.
    if (keep && draft != null && embedLinkProblem(draft)) return;
    const el = ref.current;
    if (el && document.activeElement === el) {
      keepOnBlur.current = keep;
      el.closest("[data-editor]")?.focus({ preventScroll: true });
      keepOnBlur.current = true;
    } else finish(keep);
    onShut();
  };
  const field = (
    <input
      ref={ref}
      className="embed-link-field"
      aria-label="Embed's link"
      value={editing ? draft : written}
      spellCheck={false}
      autoComplete="off"
      onFocus={() => {
        if (!editing) setDraft(written);
      }}
      onChange={(e) => setDraft(e.target.value)}
      // Its input is its own: reaching the editor's, it read as typing in the
      // block and left an empty undo step before the next ⌘Z's.
      onInput={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          end(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          end(false);
        }
      }}
      // A press away keeps the edit and leaves the panel be.
      onBlur={() => finish(keepOnBlur.current)}
      onMouseUp={(e) => e.stopPropagation()}
    />
  );
  const said = reason && (
    <div className="embed-link-reason" style={{ color: theme.TEXT.muted }}>
      {reason}
    </div>
  );

  return (
    <div
      className="embed-edit motion-pop motion-from-top"
      // The field is only as wide as its text: a press anywhere else on the
      // panel (its brackets, its padding) puts the caret in it, at the end.
      onMouseDown={(e) => {
        if (e.target === ref.current) return;
        e.preventDefault();
        const el = ref.current;
        if (!el) return;
        el.focus();
        const end = el.value.length;
        el.setSelectionRange(end, end);
      }}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        background: theme.BG.elevated,
        border: `1px solid ${theme.BG.divider}`,
        boxShadow: theme.modalShadow,
      }}
    >
      <span className="embed-link-mark" style={{ color: theme.TEXT.muted }}>
        ![[
      </span>
      {field}
      <span className="embed-link-mark" style={{ color: theme.TEXT.muted }}>
        ]]
      </span>
      {/* As a formula's source has: shown while there is an edit to finish. */}
      {editing && (
        <button
          ref={doneRef}
          type="button"
          className="settings-button math-done"
          aria-keyshortcuts="Enter"
          {...doneTip.handlers}
          onMouseDown={(e) => {
            // The field keeps focus until Done has acted, and the panel's
            // press-to-focus leaves it alone.
            e.preventDefault();
            e.stopPropagation();
            doneTip.handlers.onMouseDown();
          }}
          onClick={() => end(true)}
          style={{
            flex: "none",
            alignSelf: "center",
            height: 28,
            // Its 28px fit the panel's one line: no taller when editing starts.
            margin: "-4px -8px -4px auto",
            padding: "0 10px",
            borderRadius: 8,
            border: `1px solid ${theme.button.border}`,
            background: theme.button.bg,
            color: theme.TEXT.primary,
            fontSize: 12.5,
            fontWeight: 500,
            fontFamily: fontStack,
            cursor: "pointer",
          }}
        >
          Done
        </button>
      )}
      {editing && doneTip.shown && (
        <Tooltip label="Done" shortcut={isMac ? "↵" : "Enter"} anchor={doneRef.current} />
      )}
      {said}
    </div>
  );
}

export { EmbedView };
export default EmbedBlock;
