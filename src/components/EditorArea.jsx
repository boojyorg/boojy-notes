import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo, memo } from "react";
import { useTheme } from "../hooks/useTheme";
import { EMPTY_FORMATS } from "../hooks/useInlineFormatting";
import {
  ACTION_ROW_H,
  COLUMN_HEAD_GAP,
  FIRST_LINE_BELOW_ROW,
  LABEL_PAD_X,
  ROW_LABEL_LINE_HEIGHT,
  ROW_LABEL_SIZE,
  SCROLLBAR_W,
} from "../constants/layout";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { useEditorContext } from "../context/EditorContext";
import { getAPI } from "../services/apiProvider";
import { SIDEBAR_HANDLE_W } from "./EditorChrome";
import NotePath, { NAME_WEIGHT, PATH_FONT } from "./NotePath";
import { parentFolders } from "../utils/pathCrumbs";
import EditableBlock from "./EditableBlock";
import OffloadedNoteView from "./OffloadedNoteView";
import PastVersionView from "./PastVersionView";
import UnreadableNoteView from "./UnreadableNoteView";
import { useRhythm } from "../tokens/rhythm";
import BlockErrorBoundary from "./BlockErrorBoundary";
import BlockDragHandle, { HANDLE_GAP } from "./BlockDragHandle";
import { gutterBlockAt } from "../utils/gutterSelect";
import FloatingToolbar from "./FloatingToolbar";
import LinkTooltip from "./LinkTooltip";
import EditorContextMenu from "./EditorContextMenu";
import { menuAnchorFor, pointInRange, spellableWord, wordRangeAt } from "../utils/contextSelection";
import {
  getBlockFromNode,
  placeCaret,
  caretLength,
  isEditableBlock,
  isSelectableBlock,
  hasOwnField,
  focusOwnedField,
  focusTitleEnd,
  titleFieldText,
  getCaretOffset,
  caretLandingAfter,
  caretLandingBefore,
  isBlockJump,
  revealCaret,
  revealInNote,
} from "../utils/domHelpers";
import { haveEditorBlockRenderChanges } from "../utils/editorBlockRenderChanges";
import { baselineFromTop, baselineInRow } from "../utils/typeBaseline";
import { listLayout } from "../utils/listStructure";
import { useLinkHoverTooltip } from "../hooks/editor/useLinkHoverTooltip";
import { useSpellingMarks } from "../hooks/editor/useSpellingMarks";
import FindBar from "./FindBar";
import SourceView from "./SourceView";
import { blocksToMarkdown } from "../utils/markdown";
import { settleTypedSpaces } from "../utils/inlineFormatting";
import { blockOffsetFor, sourceOffsetFor } from "../utils/sourceView";
import { ramp } from "../utils/fluidLength";
import { wikilinkStatus } from "../utils/wikilinkTarget";
import { isAligned } from "../utils/tableAlign";
import { panelTransition } from "../tokens/motion";
import { atScale } from "../utils/uiScale";
import { selectedIds, selectionRange, stepHead, subtreeEnd } from "../utils/blockRun";
import { LIST_TYPES } from "../utils/crossBlockEdit";
import BlockMenu from "./BlockMenu";
import { BAND_REACH, bandFill } from "../utils/selectionBand";
import { wholeBlocksCopy } from "../utils/clipboardCopy";

/*
 * The note name is a FILE LABEL, not the document's heading.
 *
 * It reads at label rank so it can never compete with a real Markdown H1 in
 * the body. A note whose file is `boojy-notes-design-demo-v1.2.md` and whose
 * first block is `# Notes Demo v1.2` shows both, and they read as
 * file-then-document rather than as two titles. The filename and the H1 stay
 * independent: editing the heading never renames the file.
 *
 * It sits in the chrome row, centred on the pane behind its folder path
 * (NotePath).
 */
/**
 * The column's own top padding on the desktop, under the chrome row.
 *
 * **The note's first line and the sidebar's New note row share a baseline.**
 * The two columns start level — the sidebar's header and the path band are the
 * same height — so the row's label is the line the note's first line is set on:
 * the air above the row, plus the label's baseline inside it, less the note
 * body's own baseline inside its first line.
 *
 * The padding is one number for every note, whatever block opens it. A heading
 * does not push its first line down to make room for itself; it reaches *up*
 * from this baseline, through a lift it works out from its own type
 * (`EditableBlock`). So the line you read first never moves — not between
 * notes, and not when `# ` turns the first paragraph into a heading.
 *
 * Not tops, not centres: a baseline is the line the eye reads two words as
 * sharing.
 */
const columnTop = (rhythm) =>
  COLUMN_HEAD_GAP +
  baselineInRow(ACTION_ROW_H, ROW_LABEL_SIZE, ROW_LABEL_LINE_HEIGHT) -
  baselineFromTop(rhythm.bodySize, rhythm.lineHeight) +
  FIRST_LINE_BELOW_ROW;

/*
 * The writing column is fluid, because the window is.
 *
 * Width should change how much room the prose has, never what the app is. A
 * line is at most `rhythm.measure` ems long, so it holds the same number of
 * characters at every body size and interface size; the column is that plus
 * its gutters, with the sidebar or without (so hiding it never re-wraps the
 * text), centred in the pane under the note's centred name. The spare room
 * is its margins, spent first as the window narrows.
 * Then the gutters ramp down, bottoming out at 560px of editor width; below
 * that the column only gets narrower. The centring is a computed margin, not
 * `auto`, so it eases with the sidebar's slide. The gutter floor is the drag grip's: 20px plus
 * its 8px gap live in the left padding, and the right side matches it. The
 * sidebar stays in the layout at every width and yields before the note does
 * (`EDITOR_FLOOR_W`), so at the 545px window minimum the editor has 316px
 * beside the narrowest sidebar and 545px alone: prose keeps reading either
 * way, and one click on the toggle gives the room back.
 *
 * Driven by viewport math rather than container queries on purpose:
 * `container-type` applies layout containment, which would make the editor
 * scroller a containing block for its `position: fixed` descendants (the slash
 * menu, the floating toolbar, the link popovers) and quietly re-anchor them.
 */
/** Side gutters: COL_PAD_MIN at COL_PAD_FROM of editor width, MAX at _TO. */
const COL_PAD_MIN = 28;
const COL_PAD_MAX = 56;
const COL_PAD_FROM = 560;
const COL_PAD_TO = 800;

/** The nearest block that holds a caret, walking from `from` by `step`; -1 when none. */
function nearestTextIndex(blocks, from, step) {
  let i = from;
  while (i >= 0 && i < blocks.length && !isEditableBlock(blocks[i])) i += step;
  return i >= 0 && i < blocks.length ? i : -1;
}

const EditorArea = memo(
  function EditorArea({
    // Read by the memo comparator below, not by the body.
    textOnlyEditForEditor: _textOnlyEditForEditor,
    // The current value of the sync generation, passed as a plain prop so the
    // memo comparator can see it change (the ref itself never changes identity).
    syncGen: _syncGen,
    note,
    activeNote,
    editorFadeIn,
    onWikilinkClick,
    onTagClick,
    toolbarState,
    noteTitleSet,
    // The link picker's routes in (useLinkPicker): edit or fix a link, drop
    // one to its words, and say what a link points at for the chip.
    onEditLink,
    onRemoveLink,
    describeLink,
    // The whole-block selection (utils/blockRun): anchor and head block ids.
    blockSelection,
    setBlockSelection,
    lightbox: _lightbox,
    setLightbox,
    openNote: openNoteProp,
    // The sidebar's press-and-hold drag, for the rows of the path's popup.
    onPathRowPointerDown,
    onEditorClick,
    onTitleBlur,
    // Edit → Find… and Find and Replace…: the menu opens the bar through this.
    openFindRef,
    // Show Markdown / Show Formatted, from the menus, ⌘/ and the lit `</>`.
    switchViewRef,
    // Edit → Duplicate reaches the editor's ⌘D through this.
    blockActionsRef,
    // Version History: a version on screen instead of the note, read-only.
    pastVersion,
    onTypeIntoPast,
    // Recently Deleted: a deleted note on screen in the note's place, read-only.
    deletedNote,
    onTypeIntoDeleted,
    // The app's toasts: Add to dictionary's, with its Undo.
    showToast,
    // A note whose text a sync service keeps online: shown downloading, never empty.
    offloaded,
    // A note whose file cannot be opened as text: said so, never shown empty.
    unreadable,
  }) {
    const rhythm = useRhythm();
    const {
      editorRef,
      editorScrollRef,
      titleRef,
      blockRefs,
      noteDataRef,
      focusBlockId,
      focusCursorPos,
      forceRender,
      handleEditorKeyDown,
      handleEditorInput,
      handleEditorPaste,
      handleEditorCopy,
      handleEditorCut,
      handleEditorBeforeInput,
      startHandleDrag,
      handleEditorMouseDown,
      handleEditorMouseUp,
      handleEditorFocus,
      handleEditorDragOver,
      handleEditorDragLeave,
      handleEditorDrop,
      commitTextChange,
      syncGeneration,
      flipCheck,
      deleteBlock,
      registerBlockRef,
      insertBlockAfter,
      updateBlockText,
      updateCodeLang,
      updateCallout,
      updateCalloutTitle,
      updateTableCell,
      updateTableRows,
      updateBlockProperty,
      detectActiveFormats,
      applyFormat,
      deleteBlockRange,
      duplicateBlockRange,
      indentBlockRange,
      setBlockKind,
    } = useEditorContext();
    const { theme } = useTheme();
    const { TEXT, BG } = theme;
    // The run the selection covers, children included; null once its blocks
    // have left the note, so a stale selection neither hides the caret nor
    // takes a key.
    const selectedRun = useMemo(
      () => selectionRange(note?.content?.blocks || [], blockSelection),
      [note?.content?.blocks, blockSelection],
    );
    const selectedBlockId = selectedRun ? blockSelection.anchor : null;
    const setSelectedBlockId = useCallback(
      (id) => setBlockSelection(id ? { anchor: id, head: id } : null),
      [setBlockSelection],
    );
    const {
      accentColor,
      editorBg,
      sidebarVisible,
      sidebarWidth,
      fullScreen,
      sourceView,
      setSourceView,
    } = useLayout();

    // Find bar state
    const [findBarOpen, setFindBarOpen] = useState(false);
    const [findBarReplace, setFindBarReplace] = useState(false);
    // Edit → Find ▸: Find… opens the bar as it was last left (unlike Cmd+F it
    // never closes it, since a menu item says what it does); Replace… opens it
    // with Replace showing; Find Next and Previous step through an open bar,
    // and open a closed one.
    const findStepRef = useRef(null);
    if (openFindRef) {
      openFindRef.current = (mode) => {
        // The Markdown view is a plain field with no find of its own yet.
        if (sourceView) return;
        if (mode === "replace") {
          setFindBarReplace(true);
          findStepRef.current?.replace();
        }
        if ((mode === "next" || mode === "prev") && findBarOpen && findStepRef.current) {
          findStepRef.current[mode]();
          return;
        }
        setFindBarOpen(true);
      };
    }

    const editorContainerRef = useRef(null);
    // Note column (padding + measure) — the drag handle positions against it.
    const columnRef = useRef(null);

    // The guard against Chromium editing across block roots listens to the
    // native `beforeinput`, the one event that says which roots an edit is
    // about to touch; React's onBeforeInput is synthesised from other events
    // and carries neither the input type nor the target range. The editor
    // element remounts with the note (the column is keyed on it), so the
    // listener follows it.
    const hasNote = !!note;
    // A note opens at its top. The scroller is not keyed by the note (only
    // the column inside it is), so the previous note's scroll would carry
    // over. A layout effect, so a search jump's own scroll (150 ms
    // later) still wins.
    useLayoutEffect(() => {
      if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
    }, [activeNote, editorScrollRef]);

    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      el.addEventListener("beforeinput", handleEditorBeforeInput);
      return () => el.removeEventListener("beforeinput", handleEditorBeforeInput);
      // `sourceView`: the editor element is a new one on the way back from the Markdown view.
    }, [activeNote, hasNote, editorRef, handleEditorBeforeInput, sourceView]);

    // The spelling underline is the app's (useSpellingMarks), so Chromium's
    // own is off in the editor wherever the app can check. On Windows it is
    // Chromium's (electron/spelling.ts).
    const { spelling } = useSettings();
    const ownSpelling = !!getAPI()?.checkParagraphs;
    const spellingMarks = useSpellingMarks(
      editorRef,
      !!spelling?.enabled,
      `${activeNote}:${hasNote}:${sourceView}`,
    );
    const spellingLanguages = spelling?.languages.join(",");
    const { recheck: recheckSpelling } = spellingMarks;
    // The languages changed: every answer is stale.
    const languagesSeen = useRef(spellingLanguages);
    useEffect(() => {
      if (languagesSeen.current === spellingLanguages) return;
      languagesSeen.current = spellingLanguages;
      recheckSpelling();
    }, [spellingLanguages, recheckSpelling]);
    // A dictionary that loaded after the note was checked: so is every answer.
    useEffect(() => getAPI()?.onSpellingReady?.(recheckSpelling), [recheckSpelling]);

    // ── The Markdown view's switch ──
    // Both ways, the caret crosses in the block it was in (on the same
    // character where the block's text is written as it is shown) and that
    // block keeps its height in the pane, so the page does not move. Read on
    // the way out, while the view being left is still on screen; applied on
    // the way in, once the other has painted.
    const sourceApiRef = useRef(null);
    const sourceEntryRef = useRef(null);
    const formattedEntryRef = useRef(null);
    if (switchViewRef) {
      switchViewRef.current = () => {
        const blocks = noteDataRef.current?.[activeNote]?.content?.blocks;
        const scroller = editorScrollRef.current;
        if (blocks && scroller) {
          const text = blocksToMarkdown(blocks);
          if (sourceView) {
            const place = sourceApiRef.current?.capture();
            const at = place && blockOffsetFor(text, blocks, place.offset);
            formattedEntryRef.current = at ? { ...at, top: place.top, atTop: place.atTop } : null;
          } else {
            const at = formattedPlace(blocks, blockRefs.current, editorRef.current, scroller);
            sourceEntryRef.current = at
              ? {
                  offset: sourceOffsetFor(text, blocks, at.index, at.offset),
                  top: at.top,
                  atTop: scroller.scrollTop <= 0,
                }
              : null;
          }
        }
        setSourceView(!sourceView);
      };
    }
    // Back in the formatted view: the caret into its block, the block at its height.
    // biome-ignore lint/correctness/useExhaustiveDependencies: fires on the switch alone; everything else is read through refs
    useLayoutEffect(() => {
      const entry = formattedEntryRef.current;
      formattedEntryRef.current = null;
      if (sourceView || !entry) return;
      const block = noteDataRef.current?.[activeNote]?.content?.blocks?.[entry.index];
      const el = block && blockRefs.current[block.id];
      const scroller = editorScrollRef.current;
      if (!el || !scroller) return;
      if (isEditableBlock(block)) placeCaret(el, entry.offset);
      // A note that was at its top stays there, its caret's block brought into
      // view only if it is below the fold; a scrolled one keeps the block at
      // the height its line stood.
      if (entry.atTop) {
        scroller.scrollTop = 0;
        el.scrollIntoView?.({ block: "nearest" });
      } else {
        scroller.scrollTop +=
          el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - entry.top;
      }
    }, [sourceView]);

    const onNavigateToNote = useCallback(
      (target, create) => {
        if (create && onWikilinkClick) {
          onWikilinkClick(target);
        } else if (openNoteProp) {
          openNoteProp(target);
        }
      },
      [onWikilinkClick, openNoteProp],
    );

    const activeFormats = useMemo(
      () => (toolbarState ? detectActiveFormats() : EMPTY_FORMATS),
      [toolbarState],
    );

    // The destination chip: what the link under the pointer, or the caret,
    // points at, after a rest.
    const {
      tooltip: linkTooltip,
      onMouseMove: handleEditorMouseMove,
      onMouseLeave: handleEditorMouseLeave,
    } = useLinkHoverTooltip(editorContainerRef, describeLink);

    // Block navigation out of a block that owns its fields (Escape / the
    // arrows at the edges of a code block, a callout or a table cell). A text
    // neighbour takes the caret at its near end; a table neighbour takes the
    // caret in its near row (the arrows walk the grid); a divider or image is
    // selected as a whole, never given a caret (its root is in the ref map for
    // the gutter grip, not for the caret).
    const handleBlockNav = useCallback(
      (blockIndex, direction) => {
        const blocks = noteDataRef.current?.[activeNote]?.content?.blocks;
        if (!blocks) return;
        const targetIndex = direction === "prev" ? blockIndex - 1 : blockIndex + 1;
        if (targetIndex < 0) {
          // Focus title
          if (titleRef.current) titleRef.current.focus();
          return;
        }
        if (targetIndex >= blocks.length) return;
        const target = blocks[targetIndex];
        if (hasOwnField(target)) {
          // A table, a code block or a callout: its own field takes focus, at
          // the edge the caret arrived from.
          focusOwnedField(editorRef.current, target.id, direction === "prev" ? "end" : "start");
          return;
        }
        if (isSelectableBlock(target)) {
          setSelectedBlockId(target.id);
          return;
        }
        const el = blockRefs.current[target.id];
        if (el) {
          placeCaret(el, direction === "prev" ? caretLength(el) : 0);
        } else {
          focusOwnedField(editorRef.current, target.id, direction === "prev" ? "end" : "start");
        }
      },
      [activeNote, noteDataRef, blockRefs, editorRef, titleRef, setSelectedBlockId],
    );

    // Whole-block selection: a divider, an image or a table (isSelectableBlock)
    // A press on a picture that moves on drags its block, as the grip does.
    // Through a ref: useBlockDrag hands a fresh function every render, and the
    // blocks are memoised on their props.
    const startHandleDragRef = useRef(startHandleDrag);
    startHandleDragRef.current = startHandleDrag;
    const imageDragPress = useCallback(
      (blockId, e) => startHandleDragRef.current?.(blockId, e),
      [],
    );

    const handleBlockSelect = useCallback(
      (blockId) => {
        setSelectedBlockId(blockId);
      },
      [setSelectedBlockId],
    );

    // Remove blocks addressed as a whole (a selection's run; the selected
    // divider, image or table; Delete table in a cell's right-click menu) and
    // land the caret at the start of the next text block, or the end of the
    // previous one if there is none, so a Backspace that arrived from the
    // block below can carry on from where it was. Also the image's and file's
    // own Delete.
    const deleteWholeBlock = useCallback(
      (noteId, from, to = from) => {
        const blocks = noteDataRef.current[noteId]?.content?.blocks || [];
        const next = nearestTextIndex(blocks, to + 1, 1);
        const prev = nearestTextIndex(blocks, from - 1, -1);
        if (next >= 0) {
          focusBlockId.current = blocks[next].id;
          focusCursorPos.current = 0;
        } else if (prev >= 0) {
          focusBlockId.current = blocks[prev].id;
          focusCursorPos.current = (blocks[prev].text || "").length;
        }
        deleteBlockRange(noteId, from, to);
        setSelectedBlockId(null);
      },
      [noteDataRef, deleteBlockRange, focusBlockId, focusCursorPos, setSelectedBlockId],
    );

    // Copy the selected blocks whole. No range covers them (the caret rests,
    // hidden, in one), so the copy is raised by hand and answered here, in
    // capture, before the editor's own copy reads the empty selection.
    const copySelectedBlocks = useCallback((blocks, range) => {
      const { json, payload } = wholeBlocksCopy(blocks, range.from, range.to);
      const onCopy = (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        ev.clipboardData.setData("text/boojy-blocks", json);
        ev.clipboardData.setData("text/plain", payload.text);
        ev.clipboardData.setData("text/html", payload.html);
      };
      document.addEventListener("copy", onCopy, true);
      try {
        document.execCommand("copy");
      } finally {
        document.removeEventListener("copy", onCopy, true);
      }
    }, []);

    // The grip's menu (BlockMenu): the viewport rect it hangs under, or null.
    const [blockMenu, setBlockMenu] = useState(null);
    useEffect(() => {
      if (!selectedRun) setBlockMenu(null);
    }, [selectedRun]);

    // Duplicate (⌘D, Edit → Duplicate, the grip's menu): the selected blocks,
    // then selecting the copies; else the block the caret is in, with the
    // items nested under it, the caret staying where it is.
    const duplicateBlocks = useCallback(() => {
      const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
      let range = selectionRange(blocks, blockSelection);
      const selected = !!range;
      if (!range) {
        const sel = window.getSelection();
        const info = sel?.rangeCount
          ? getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)
          : null;
        if (!info || blocks[info.blockIndex]?.type === "frontmatter") return;
        range = { from: info.blockIndex, to: subtreeEnd(blocks, info.blockIndex) };
      }
      const ids = duplicateBlockRange(activeNote, range.from, range.to);
      setBlockMenu(null);
      if (selected && ids.length) setBlockSelection({ anchor: ids[0], head: ids[ids.length - 1] });
    }, [
      activeNote,
      blockSelection,
      noteDataRef,
      editorRef,
      blockRefs,
      duplicateBlockRange,
      setBlockSelection,
    ]);
    useEffect(() => {
      if (blockActionsRef) blockActionsRef.current = { duplicate: duplicateBlocks };
    }, [blockActionsRef, duplicateBlocks]);

    // The menu opened from the keyboard (Shift+F10) hangs where the grip
    // would stand beside the first selected block.
    const openBlockMenuAt = useCallback(
      (blockId) => {
        const ref = blockRefs.current[blockId];
        const root = ref?.closest?.("[data-block-id]") ?? ref;
        if (!root) return;
        const r = root.getBoundingClientRect();
        setBlockMenu({ top: r.top, bottom: r.top + 24, left: r.left - 24, right: r.left });
      },
      [blockRefs],
    );

    // Keys while blocks are selected (utils/blockRun). Escape deselects and
    // moves nothing; the arrows put the caret in the nearest text block on
    // that side, and Shift+arrows grow or shrink the run; Backspace and Delete
    // remove it, Cmd+C copies it whole and Cmd+X both; Enter opens a paragraph
    // under it; Tab and Shift+Tab move its list items a level, the selection
    // staying (a run with none leaves Tab to the editor); a printable
    // character deselects and types where the caret already is. True when
    // consumed.
    const handleSelectedBlockKey = useCallback(
      (e) => {
        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
        const range = selectionRange(blocks, blockSelection);
        if (!range) {
          setSelectedBlockId(null);
          return false;
        }
        const mod = e.metaKey || e.ctrlKey;
        const nearestText = (from, step) => nearestTextIndex(blocks, from, step);
        if (e.key === "Escape") {
          e.preventDefault();
          setSelectedBlockId(null);
          return true;
        }
        // Option+Up/Down (Ctrl off the Mac) from a selected image or divider:
        // on to the next block's start, as from a caret (useKeyboardHandlers).
        if (isBlockJump(e)) {
          e.preventDefault();
          const up = e.key === "ArrowUp";
          const idx = up
            ? caretLandingBefore(blocks, range.from)
            : caretLandingAfter(blocks, range.to);
          if (idx < 0) {
            if (up) {
              setSelectedBlockId(null);
              focusTitleEnd();
            }
            return true;
          }
          const target = blocks[idx];
          const el = blockRefs.current[target.id];
          if (isSelectableBlock(target)) {
            setSelectedBlockId(target.id);
            if (el) revealInNote(el.getBoundingClientRect());
            return true;
          }
          setSelectedBlockId(null);
          if (hasOwnField(target)) focusOwnedField(editorRef.current, target.id, "start");
          else if (el) {
            placeCaret(el, 0);
            revealCaret();
          }
          return true;
        }
        if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !mod && !e.altKey) {
          e.preventDefault();
          const up = e.key === "ArrowUp";
          if (e.shiftKey) {
            setBlockSelection(stepHead(blocks, blockSelection, up ? -1 : 1));
            return true;
          }
          const target = nearestText(up ? range.from - 1 : range.to + 1, up ? -1 : 1);
          setSelectedBlockId(null);
          if (target >= 0) {
            const el = blockRefs.current[blocks[target].id];
            if (el) placeCaret(el, up ? caretLength(el) : 0);
          }
          return true;
        }
        if (mod && !e.shiftKey && !e.altKey && (e.code === "KeyC" || e.code === "KeyX")) {
          e.preventDefault();
          copySelectedBlocks(blocks, range);
          if (e.code === "KeyX") deleteWholeBlock(activeNote, range.from, range.to);
          return true;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          deleteWholeBlock(activeNote, range.from, range.to);
          return true;
        }
        if (e.key === "Tab" && !mod && !e.altKey) {
          const run = blocks.slice(range.from, range.to + 1);
          if (!run.some((b) => LIST_TYPES.has(b.type))) return false;
          e.preventDefault();
          indentBlockRange(activeNote, range.from, range.to, e.shiftKey ? -1 : 1);
          return true;
        }
        if (e.key === "F10" && e.shiftKey) {
          e.preventDefault();
          openBlockMenuAt(blocks[range.from].id);
          return true;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSelectedBlockId(null);
          insertBlockAfter(activeNote, range.to, "p", "");
          return true;
        }
        if (e.key.length === 1 && !mod) setSelectedBlockId(null);
        return false;
      },
      [
        activeNote,
        blockSelection,
        setBlockSelection,
        setSelectedBlockId,
        noteDataRef,
        blockRefs,
        deleteWholeBlock,
        copySelectedBlocks,
        insertBlockAfter,
        indentBlockRange,
        openBlockMenuAt,
      ],
    );

    // A press on a block's grip that never became a drag: select the block and
    // open its menu under the grip (Shift extends the run from its anchor
    // instead). The caret rests, hidden, at the end of a text block, so keys
    // reach the editor and a letter typed deselects and carries on writing.
    const handleGripClick = useCallback(
      (blockId, extend, gripRect) => {
        // `grip`: the selection was made on the grip, whose face then stays
        // pressed; a list marker's click selects with the grip left plain.
        setBlockSelection((s) =>
          extend && s
            ? { ...s, head: blockId }
            : { anchor: blockId, head: blockId, grip: !!gripRect },
        );
        if (extend) return;
        if (gripRect) {
          const { top, bottom, left, right } = gripRect;
          setBlockMenu({ top, bottom, left, right });
        }
        const block = noteDataRef.current[activeNote]?.content?.blocks?.find(
          (b) => b.id === blockId,
        );
        const el = blockRefs.current[blockId];
        if (block && el && isEditableBlock(block)) placeCaret(el, caretLength(el));
        else editorRef.current?.focus({ preventScroll: true });
      },
      [activeNote, noteDataRef, blockRefs, editorRef, setBlockSelection],
    );

    // A press in a block's gutter strip, between the grip and where its
    // content starts (utils/gutterSelect: a list's dot or number, the space
    // left of a paragraph's first letter or a to-do's box), selects the block
    // with any items nested under it, as Notion's does: no menu, the grip left
    // plain. In capture, before the editor places a caret; the grip's own
    // press is the grip's.
    const selectFromGutter = useCallback(
      (e) => {
        if (e.button !== 0 || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target.closest?.(".block-drag-handle") || !editorRef.current) return;
        const id = gutterBlockAt(
          editorRef.current,
          blockRefs.current,
          e.clientX,
          e.clientY,
          HANDLE_GAP,
        );
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        handleGripClick(id, false);
      },
      [editorRef, blockRefs, handleGripClick],
    );

    // The wash on a selected text block: the band's tint over the whole row,
    // marker included. A divider, an image and a table draw their own.
    const selectionWashCss = useMemo(() => {
      if (!selectedRun) return null;
      const blocks = note.content.blocks.slice(selectedRun.from, selectedRun.to + 1);
      const selectors = blocks
        .filter((b) => !isSelectableBlock(b))
        .map((b) => `[data-editor] > [data-block-id="${b.id}"]`);
      if (!selectors.length) return null;
      // The band's reach past the text on each side, as a divider's band has:
      // side shadows only, so selected neighbours never overlap and darken.
      const fill = bandFill(accentColor, theme.name);
      return `${selectors.join(",")}{background:${fill};border-radius:4px;box-shadow:-${BAND_REACH}px 0 0 ${fill},${BAND_REACH}px 0 0 ${fill}}`;
    }, [selectedRun, note, accentColor, theme.name]);

    const handleImageLightbox = useCallback(
      (src, alt) => {
        setLightbox({ src, alt });
      },
      [setLightbox],
    );

    const handleImageCopyImage = useCallback((src) => {
      const api = getAPI();
      if (api?.copyImageToClipboard) {
        api.copyImageToClipboard(src);
      }
    }, []);

    const handleFileOpen = useCallback(async (src) => {
      const api = getAPI();
      if (!api?.resolveAttachment) return;
      const absPath = await api.resolveAttachment(src);
      if (absPath && api.openPath) api.openPath(absPath);
    }, []);

    const handleFileShowInFolder = useCallback(async (src) => {
      const api = getAPI();
      if (!api?.resolveAttachment) return;
      const absPath = await api.resolveAttachment(src);
      if (absPath && api.showItemInFolder) api.showItemInFolder(absPath);
    }, []);

    // A press anywhere but a selectable block's own surface deselects: beside
    // a picture in its row, the margins, the sidebar and the chrome alike. A
    // surface is the
    // thing drawn (`data-selection-surface`: the picture's frame, the divider's
    // row) plus the image menu, which is portalled out of it. Capture phase, so
    // it runs before the press that selects another block.
    useEffect(() => {
      if (!selectedBlockId) return;
      const onPress = (e) => {
        // Shift-click on another block grows the selection to it (Notion's
        // gesture), in place of the text selection the press would make.
        // Through the grip menu's backdrop too: the block under the pointer.
        const ROOT = "[data-editor] > [data-block-id]";
        const root =
          e.shiftKey && e.button === 0
            ? (e.target.closest?.(ROOT) ??
              document
                .elementsFromPoint(e.clientX, e.clientY)
                .map((el) => el.closest(ROOT))
                .find(Boolean))
            : null;
        if (root) {
          e.preventDefault();
          e.stopPropagation();
          const head = root.getAttribute("data-block-id");
          setBlockMenu(null);
          setBlockSelection((s) => (s ? { ...s, head } : s));
          return;
        }
        if (e.target.closest?.("[data-selection-surface], .image-context-menu")) return;
        setSelectedBlockId(null);
      };
      document.addEventListener("mousedown", onPress, true);
      return () => document.removeEventListener("mousedown", onPress, true);
    }, [selectedBlockId, setSelectedBlockId, setBlockSelection]);

    // The editor's right-click menu: a link's own actions when the pointer is
    // on one, then Cut, Copy and Paste (EditorContextMenu). What the menu acts
    // on is taken now, before it takes focus: the selection's range and the
    // field that held focus (a code block's textarea keeps its own selection).
    const [linkCtxMenu, setLinkCtxMenu] = useState(null);
    // The latest right-click's spelling question: an older answer is dropped.
    const spellAsk = useRef(0);

    const handleEditorContextMenu = useCallback(
      (e) => {
        // A block with a menu of its own (an image) has already answered.
        if (e.defaultPrevented) return;
        // On Windows the right-click's spelling comes with Chromium's own
        // menu event, which a cancelled `contextmenu` never sends; Electron
        // shows no menu of its own either way.
        const fromMenu = !!getAPI()?.spellingFromMenu;
        if (!fromMenu) e.preventDefault();
        const x = e.clientX;
        const y = e.clientY;
        const sel = window.getSelection();
        let range = sel?.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
        const active = document.activeElement;
        const field =
          active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
            ? active
            : null;
        const anchor = e.target.closest("a");
        const wikilink = e.target.closest(".wikilink");
        // A table cell is its own editing host: Cut, Copy and Paste run in it,
        // and the table gets its Delete table.
        const cell = e.target.closest('[data-block-type="table"] th, [data-block-type="table"] td');
        const tableId = cell?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
        const linkEl = anchor || wikilink;
        // A right-click on a word outside the selection selects the word, as
        // a Mac text field does; inside the selection it keeps it. A link is
        // left as it is: its menu is about the link.
        if (!field && !linkEl && !(range && pointInRange(range, x, y))) {
          const word = editorRef.current && wordRangeAt(editorRef.current, x, y);
          // Not on a word: the caret goes to the pointer, so Paste lands where
          // the right-click was. Chromium does this on Linux and not on a Mac;
          // the app decides it the same everywhere.
          const target = word ?? document.caretRangeFromPoint?.(x, y);
          if (target && editorRef.current?.contains(target.startContainer)) {
            sel.removeAllRanges();
            sel.addRange(target);
            range = target.cloneRange();
          }
        }
        let hangFrom = range;
        if (linkEl) {
          hangFrom = document.createRange();
          hangFrom.selectNodeContents(linkEl);
        }
        const menu = {
          anchor: menuAnchorFor(hangFrom, x, y),
          linkType: null,
          range,
          field,
          host: cell,
          tableId,
          canCutCopy: field
            ? field.selectionStart !== field.selectionEnd
            : !!range && !range.collapsed,
        };
        if (anchor) {
          menu.linkType = "external";
          menu.url = anchor.getAttribute("data-url") || anchor.getAttribute("href");
          menu.element = anchor;
        } else if (wikilink) {
          const target = wikilink.getAttribute("data-target") || "";
          // A link that names one note gets Open note; one that names none,
          // or two, gets Fix link, which is the picker.
          const status = wikilinkStatus(target, noteDataRef.current);
          menu.linkType = status.kind === "note" ? "wikilink" : "wikilink-broken";
          menu.url = target;
          menu.title = status.kind === "note" ? status.title : target;
          menu.element = wikilink;
        }
        // One word of prose: the menu opens with its spellings once the
        // checker answers (a Mac's, a few hundredths of a second; Windows'
        // with the menu event). Only an underlined word: the menu and the
        // line never disagree. On Windows the line is Chromium's, and the
        // menu event says whether it is drawn under this word.
        const asked = ++spellAsk.current;
        const word = field || linkEl ? null : spellableWord(range);
        const check = getAPI()?.checkSpelling;
        if (!word || !check || !(fromMenu || spellingMarks.markedAt(range)))
          return setLinkCtxMenu(menu);
        check(word.text, word.paragraph)
          .catch(() => null)
          .then((suggestions) => {
            if (asked !== spellAsk.current) return;
            // Windows' answer of "spelled right" means no line is drawn there.
            if (!suggestions && fromMenu) return setLinkCtxMenu(menu);
            setLinkCtxMenu({ ...menu, word: word.text, suggestions: suggestions ?? [] });
          });
      },
      [noteDataRef, editorRef, spellingMarks],
    );

    // Cut, Copy and Paste run where ⌘X, ⌘C and ⌘V would: focus and the
    // selection are put back first, then the editor's own cut, copy and paste
    // handlers take the events these fire, so the menu and the keys can never
    // write different things.
    const runOnSelection = useCallback(
      (fn) => {
        const menu = linkCtxMenu;
        if (!menu) return;
        if (menu.field) {
          menu.field.focus({ preventScroll: true });
        } else {
          (menu.host ?? editorRef.current)?.focus({ preventScroll: true });
          if (menu.range) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(menu.range);
          }
        }
        fn();
        setLinkCtxMenu(null);
      },
      [linkCtxMenu, editorRef],
    );

    const dismissCtxMenu = useCallback(() => setLinkCtxMenu(null), []);

    // A table written compact or by hand, whose columns Tidy table would
    // line up; one the app writes, or one already lined up, needs none.
    const tableNeedsTidy = (tableId) => {
      const block = noteDataRef.current[activeNote]?.content?.blocks?.find((b) => b.id === tableId);
      const source = block?.tableSource;
      return !!source && !isAligned([source.header, source.separator, ...source.rows]);
    };

    // Width the editor actually has: the viewport less whatever the sidebar and
    // its handle are occupying.
    // In CSS pixels: `vw` ignores the UI scale (`atScale`), and the scroller
    // keeps a stable scrollbar gutter the column is centred beside.
    const editorW = `(${atScale("100vw")} - ${
      (sidebarVisible ? sidebarWidth + SIDEBAR_HANDLE_W : 0) + SCROLLBAR_W
    }px)`;
    const colPad = ramp(editorW, [COL_PAD_FROM, COL_PAD_MIN], [COL_PAD_TO, COL_PAD_MAX]);
    const colMax = `calc(${rhythm.measure * rhythm.bodySize}px + 2 * ${colPad})`;
    const colMargin = `max(0px, calc((${editorW} - ${colMax}) / 2))`;
    // Memoised so the band's measuring effect keys on the folder, not on a
    // fresh array every render.
    const folder = deletedNote ? deletedNote.item.folder : note?.folder;
    const parents = useMemo(() => parentFolders(folder), [folder]);
    const titleField = note ? (
      <div
        ref={titleRef}
        contentEditable
        suppressContentEditableWarning
        data-title
        data-placeholder="Untitled"
        role="textbox"
        aria-label="Note title"
        onInput={(e) => {
          const newTitle = titleFieldText(e.currentTarget);
          if (newTitle === "") e.currentTarget.setAttribute("data-placeholder-floor", "");
          commitTextChange((prev) => {
            const next = { ...prev };
            const n = { ...next[activeNote] };
            // A space Chromium typed as U+00A0 would reach the file's name.
            const title = settleTypedSpaces(newTitle, n.title);
            n.title = title;
            n.content = { ...n.content, title };
            next[activeNote] = n;
            return next;
          });
        }}
        onKeyDown={(e) => {
          // Enter, or ArrowDown (the name is one line, so down always leaves
          // it): into the note's first block. ArrowUp from the first block
          // comes back here.
          if (e.key === "Enter" || (e.key === "ArrowDown" && !e.shiftKey)) {
            e.preventDefault();
            // The Markdown view has no blocks: the caret goes to the top of its text.
            if (sourceView) {
              sourceApiRef.current?.focusStart();
              return;
            }
            const blocks = noteDataRef.current[activeNote].content.blocks;
            const first = blocks.find((b) => isEditableBlock(b));
            if (first) {
              const firstId = first.id;
              const el = blockRefs.current[firstId];
              if (el) {
                placeCaret(el, 0);
                requestAnimationFrame(() => {
                  const sel = window.getSelection();
                  if (
                    sel.rangeCount &&
                    getBlockFromNode(sel.anchorNode, editorRef.current, blocks, blockRefs.current)
                  )
                    return;
                  const freshEl = blockRefs.current[firstId];
                  if (freshEl) placeCaret(freshEl, 0);
                });
              } else {
                focusBlockId.current = firstId;
                focusCursorPos.current = 0;
                forceRender((c) => c + 1);
              }
            }
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          // The name is one line: a paste gives it the clipboard's first line
          // with text on it, never the rest.
          const text = e.clipboardData.getData("text/plain");
          const line = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
          if (line) document.execCommand("insertText", false, line.trim());
        }}
        onFocus={(e) => {
          // The placeholder's width holds under the caret from the moment
          // the placeholder has shown in this editing session (a new note, a
          // name cleared and retyped) until the caret leaves, so a short name
          // typed over it never snaps the pill narrow and re-centres the path
          // per letter. A rename that never empties follows its text, as a
          // rename field should. GlobalStyles reads it.
          if (titleFieldText(e.currentTarget) === "")
            e.currentTarget.setAttribute("data-placeholder-floor", "");
          // Truncation is a display concern — editing reveals the whole name.
          e.currentTarget.style.background = BG.surface;
          e.currentTarget.style.textOverflow = "clip";
          e.currentTarget.style.overflowX = "auto";
        }}
        onBlur={(e) => {
          e.currentTarget.removeAttribute("data-placeholder-floor");
          // A blank name takes the filename the write answered with, now.
          onTitleBlur?.();
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.textOverflow = "ellipsis";
          e.currentTarget.style.overflowX = "hidden";
        }}
        onMouseEnter={(e) => {
          if (document.activeElement === e.currentTarget) return;
          e.currentTarget.style.background = BG.surface;
        }}
        onMouseLeave={(e) => {
          if (document.activeElement === e.currentTarget) return;
          e.currentTarget.style.background = "transparent";
        }}
        style={{
          // In the path band: the name's box is its text, and the hover
          // pill's padding is pulled back out with a negative margin so the
          // path centres on the letters, not on the pill.
          ...PATH_FONT,
          fontWeight: NAME_WEIGHT,
          color: TEXT.primary,
          margin: `0 ${-LABEL_PAD_X}px`,
          padding: `0 ${LABEL_PAD_X}px`,
          borderRadius: 4,
          outline: "none",
          position: "relative",
          cursor: "text",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          // min-width is the stylesheet's: 0, or the placeholder's
          // width while the field is empty (GlobalStyles, [data-title]).
          flex: "1 1 auto",
          transition: "background var(--motion-fast), color var(--motion-fast)",
        }}
      />
    ) : null;

    return (
      <div
        ref={editorScrollRef}
        className="editor-scroll"
        onMouseDown={onEditorClick}
        // Files dropped anywhere on the pane, not only on the text.
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
          overflowY: "auto",
          // The scrollbar's lane is kept whether the note overflows or not: a
          // styled bar takes layout width on macOS, so a note crossing the
          // fold (or a switch to the Markdown view, whose height differs)
          // narrowed the pane and moved the centred path by half a bar.
          scrollbarGutter: "stable",
          background: editorBg,
          position: "relative",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {(note || deletedNote) && (
          <NotePath
            parents={parents}
            name={deletedNote ? deletedNote.item.name : note.title}
            collapsed={!sidebarVisible}
            fullScreen={fullScreen}
            bg={editorBg}
            activeNote={activeNote}
            onOpenNote={openNoteProp}
            onRowPointerDown={onPathRowPointerDown}
          >
            {deletedNote ? (
              <span data-deleted-title style={{ color: theme.TEXT.primary }}>
                {deletedNote.item.name || "Untitled"}
              </span>
            ) : (
              titleField
            )}
          </NotePath>
        )}
        {note || deletedNote ? (
          <div
            key={deletedNote ? `deleted:${deletedNote.item.id}` : activeNote}
            ref={columnRef}
            className="panel-motion"
            onMouseDownCapture={selectFromGutter}
            style={{
              padding: `${columnTop(rhythm)}px ${colPad} 80px ${colPad}`,
              maxWidth: colMax,
              marginLeft: colMargin,
              marginRight: "auto",
              width: "100%",
              // The fade is opacity alone. No transform, ever: a transformed
              // element is the containing block for every `position: fixed`
              // descendant, and the link, code, image and file menus and the
              // table's create badge open fixed at the pointer's clientX/Y,
              // and a transform would offset them by the column's own edge.
              opacity: editorFadeIn ? 1 : 0,
              // Padding and margin ease too, so hiding the sidebar reads as the
              // column breathing out rather than the page re-laying-out under
              // you. `.sidebar-dragging` kills all transitions, so dragging the
              // divider stays 1:1.
              transition: `${panelTransition("max-width", "padding", "margin-left")}, opacity 0.2s ease`,
              position: "relative",
              // No z-index: as a stacking context the column would keep its own
              // toolbar, find bar and popovers under the path band. Without one the band (Z.PATH_ROW) sits over the
              // blocks and the grip and under everything that floats.
            }}
          >
            {deletedNote ? (
              <PastVersionView
                versionId={`deleted:${deletedNote.item.id}`}
                noteId={deletedNote.item.id}
                blocks={deletedNote.blocks}
                noteTitleSet={noteTitleSet}
                accentColor={accentColor}
                onTypeIntoPast={onTypeIntoDeleted}
              />
            ) : offloaded ? (
              <OffloadedNoteView
                provider={offloaded.provider}
                failed={offloaded.failed}
                retry={offloaded.retry}
              />
            ) : unreadable ? (
              <UnreadableNoteView
                reason={unreadable.reason}
                openFile={unreadable.openFile}
                revealFile={unreadable.revealFile}
                retry={unreadable.retry}
              />
            ) : pastVersion ? (
              <PastVersionView
                versionId={pastVersion.id}
                noteId={activeNote}
                blocks={pastVersion.blocks}
                noteTitleSet={noteTitleSet}
                accentColor={accentColor}
                onTypeIntoPast={onTypeIntoPast}
              />
            ) : sourceView ? (
              <SourceView
                key={activeNote}
                noteId={activeNote}
                noteDataRef={noteDataRef}
                commitTextChange={commitTextChange}
                scrollerRef={editorScrollRef}
                entryRef={sourceEntryRef}
                apiRef={sourceApiRef}
              />
            ) : (
              <>
                {/* Blocks */}
                <div ref={editorContainerRef} style={{ position: "relative" }}>
                  {findBarOpen && (
                    <FindBar
                      editorRef={editorRef}
                      blocks={note.content.blocks}
                      blockRefs={blockRefs}
                      noteId={activeNote}
                      updateBlockText={updateBlockText}
                      initialShowReplace={findBarReplace}
                      stepRef={findStepRef}
                      onShowReplaceChange={setFindBarReplace}
                      onClose={() => setFindBarOpen(false)}
                    />
                  )}
                  {/* Outside the contentEditable, so no walker or caret ever meets it. */}
                  {selectionWashCss && <style>{selectionWashCss}</style>}
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={!ownSpelling}
                    role="region"
                    aria-label="Note editor"
                    onKeyDown={(e) => {
                      // Cmd+F toggles the find bar, opened as it was last left, Replace
                      // showing or not (one key for both; Cmd+H is Hide on a Mac).
                      const mod = e.ctrlKey || e.metaKey;
                      if (mod && e.code === "KeyF" && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        setFindBarOpen((v) => !v);
                        return;
                      }
                      // ⌘D duplicates the selected blocks, or the caret's.
                      if (mod && e.code === "KeyD" && !e.shiftKey && !e.altKey) {
                        e.preventDefault();
                        duplicateBlocks();
                        return;
                      }
                      // Selected whole blocks (utils/blockRun) take the key first.
                      if (selectedBlockId && handleSelectedBlockKey(e)) return;
                      handleEditorKeyDown(e);
                    }}
                    onInput={handleEditorInput}
                    onPaste={handleEditorPaste}
                    onCopy={handleEditorCopy}
                    onCut={handleEditorCut}
                    onMouseMove={handleEditorMouseMove}
                    onMouseLeave={handleEditorMouseLeave}
                    onContextMenu={handleEditorContextMenu}
                    onMouseDown={(e) => {
                      handleEditorMouseDown(e);
                      // Prevent caret placement inside links on click (for instant open feel)
                      if (!e.shiftKey && e.button === 0) {
                        const anchor = e.target.closest("a");
                        const wikilink = e.target.closest(".wikilink");
                        if (anchor || wikilink) e.preventDefault();
                      }
                    }}
                    onMouseUp={handleEditorMouseUp}
                    onFocus={handleEditorFocus}
                    onClick={(e) => {
                      const sel = window.getSelection();
                      // Don't open links if user was selecting text
                      if (sel && !sel.isCollapsed) return;
                      const anchor = e.target.closest("a");
                      if (anchor) {
                        e.preventDefault();
                        const url = anchor.getAttribute("href") || anchor.getAttribute("data-url");
                        if (url) {
                          const api = getAPI();
                          if (api?.openExternal) {
                            api.openExternal(url);
                          } else {
                            window.open(url, "_blank");
                          }
                        }
                        return;
                      }
                      const tag = e.target.closest(".inline-tag");
                      if (tag) {
                        // The pill's text, not `data-tag`: the attribute is written
                        // at paint, and a tag that grew by typing keeps its first
                        // letter's.
                        const tagName = tag.textContent.replace(/\u200B/g, "").replace(/^#/, "");
                        if (tagName && onTagClick) onTagClick(tagName);
                        return;
                      }
                      const wikilink = e.target.closest(".wikilink");
                      if (wikilink) {
                        e.preventDefault();
                        const target = wikilink.getAttribute("data-target");
                        if (target && onWikilinkClick) onWikilinkClick(target, wikilink);
                        return;
                      }
                    }}
                    data-editor
                    // While a whole block is selected the caret stays where it was
                    // (a printable key deselects and types there) but is not drawn:
                    // a blinking caret beside a selected picture reads as the key
                    // having done nothing.
                    style={{
                      outline: "none",
                      caretColor: selectedBlockId ? "transparent" : undefined,
                    }}
                  >
                    {(() => {
                      const listPositions = listLayout(note.content.blocks);
                      return note.content.blocks.map((block, i) => {
                        const numberedIndex = listPositions[i]?.number;
                        return (
                          <BlockErrorBoundary
                            key={block.id + "-" + block.type}
                            blockId={block.id}
                            onDelete={() => deleteBlock(activeNote, i)}
                          >
                            <EditableBlock
                              block={block}
                              blockIndex={i}
                              noteId={activeNote}
                              onCheckToggle={flipCheck}
                              onDeleteBlock={deleteWholeBlock}
                              registerRef={registerBlockRef}
                              syncGen={syncGeneration.current}
                              accentColor={accentColor}
                              numberedIndex={block.type === "numbered" ? numberedIndex : undefined}
                              onUpdateText={updateBlockText}
                              onUpdateLang={updateCodeLang}
                              onUpdateCallout={updateCallout}
                              onUpdateCalloutTitle={updateCalloutTitle}
                              onUpdateTableCell={updateTableCell}
                              onUpdateTableRows={updateTableRows}
                              noteTitleSet={noteTitleSet}
                              onBlockNav={handleBlockNav}
                              isBlockSelected={
                                !!selectedRun && i >= selectedRun.from && i <= selectedRun.to
                              }
                              isOnlyBlockSelected={
                                !!selectedRun && i === selectedRun.from && i === selectedRun.to
                              }
                              onBlockSelect={handleBlockSelect}
                              onImageDragPress={imageDragPress}
                              onImageLightbox={handleImageLightbox}
                              onImageCopyImage={handleImageCopyImage}
                              onUpdateBlockProperty={updateBlockProperty}
                              onFileOpen={handleFileOpen}
                              onFileShowInFolder={handleFileShowInFolder}
                              noteDataRef={noteDataRef}
                              onNavigateToNote={onNavigateToNote}
                            />
                          </BlockErrorBoundary>
                        );
                      });
                    })()}
                  </div>
                  <BlockDragHandle
                    columnRef={columnRef}
                    editorRef={editorRef}
                    startHandleDrag={startHandleDrag}
                    onGripClick={handleGripClick}
                    pinnedBlockId={
                      selectedRun && blockSelection.grip ? blockSelection.anchor : null
                    }
                    pinKey={note.content.blocks}
                  />
                  {blockMenu && selectedRun && (
                    <BlockMenu
                      anchor={blockMenu}
                      types={note.content.blocks
                        .slice(selectedRun.from, selectedRun.to + 1)
                        .map((b) => b.type)}
                      onTurnInto={(type) => {
                        setBlockMenu(null);
                        setBlockKind(
                          activeNote,
                          selectedIds(note.content.blocks, blockSelection),
                          type,
                        );
                      }}
                      onDuplicate={duplicateBlocks}
                      onCopy={() => {
                        setBlockMenu(null);
                        // The ref, not the render: it holds the last keystroke.
                        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
                        const range = selectionRange(blocks, blockSelection);
                        if (range) copySelectedBlocks(blocks, range);
                      }}
                      onDelete={() => {
                        setBlockMenu(null);
                        deleteWholeBlock(activeNote, selectedRun.from, selectedRun.to);
                      }}
                      onClose={() => setBlockMenu(null)}
                    />
                  )}
                  <FloatingToolbar
                    // Never beside the right-click menu: one surface at a time.
                    position={linkCtxMenu ? null : toolbarState}
                    activeFormats={activeFormats}
                    onFormat={applyFormat}
                  />
                  <LinkTooltip
                    description={linkTooltip?.description ?? null}
                    position={linkTooltip?.position ?? null}
                  />
                </div>

                {/* Click to create new block */}
                <div
                  style={{ minHeight: 200, cursor: "text" }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const blocks = noteDataRef.current[activeNote].content.blocks;
                    if (blocks.length > 0) {
                      const lastBlock = blocks[blocks.length - 1];
                      const lastEl = blockRefs.current[lastBlock.id];
                      if (lastEl && (lastEl.innerText || "").trim() === "") {
                        placeCaret(lastEl, 0);
                        const lastId = lastBlock.id;
                        requestAnimationFrame(() => {
                          const sel = window.getSelection();
                          if (
                            sel.rangeCount &&
                            getBlockFromNode(
                              sel.anchorNode,
                              editorRef.current,
                              blocks,
                              blockRefs.current,
                            )
                          )
                            return;
                          const freshEl = blockRefs.current[lastId];
                          if (freshEl) placeCaret(freshEl, 0);
                        });
                        return;
                      }
                    }
                    insertBlockAfter(activeNote, blocks.length - 1, "p", "");
                  }}
                />
              </>
            )}

            {/* Right-click menu */}
            {linkCtxMenu && (
              <EditorContextMenu
                anchor={linkCtxMenu.anchor}
                link={linkCtxMenu.linkType}
                suggestions={linkCtxMenu.suggestions}
                // Typed over the word, as the keys would: one undoable edit.
                onReplaceWord={(w) =>
                  runOnSelection(() => document.execCommand("insertText", false, w))
                }
                onAddWord={() => {
                  const { word } = linkCtxMenu;
                  dismissCtxMenu();
                  getAPI()
                    ?.addDictionaryWord?.(word)
                    .then(() => {
                      recheckSpelling();
                      showToast?.(`Added "${word}" to dictionary`, "done", {
                        action: {
                          label: "Undo",
                          run: () => getAPI()?.removeDictionaryWord?.(word).then(recheckSpelling),
                        },
                      });
                    });
                }}
                onOpenLink={() => {
                  if (linkCtxMenu.linkType === "external") {
                    const api = getAPI();
                    if (api?.openExternal) api.openExternal(linkCtxMenu.url);
                    else window.open(linkCtxMenu.url, "_blank");
                  } else {
                    if (onWikilinkClick) onWikilinkClick(linkCtxMenu.url);
                  }
                  dismissCtxMenu();
                }}
                onCopyLink={() => {
                  // A note's name as it is, never its raw target.
                  navigator.clipboard.writeText(
                    linkCtxMenu.linkType === "external" ? linkCtxMenu.url : linkCtxMenu.title,
                  );
                  dismissCtxMenu();
                }}
                onEditLink={() => {
                  const el = linkCtxMenu.element;
                  dismissCtxMenu();
                  onEditLink?.(el, { fix: linkCtxMenu.linkType === "wikilink-broken" });
                }}
                onRemoveLink={() => {
                  const el = linkCtxMenu.element;
                  dismissCtxMenu();
                  onRemoveLink?.(el);
                }}
                canCutCopy={linkCtxMenu.canCutCopy}
                canPaste={!!getAPI()?.paste}
                onCut={() => runOnSelection(() => document.execCommand("cut"))}
                onCopy={() => runOnSelection(() => document.execCommand("copy"))}
                onPaste={() => runOnSelection(() => getAPI()?.paste?.())}
                onTidyTable={
                  linkCtxMenu.tableId && tableNeedsTidy(linkCtxMenu.tableId)
                    ? () => {
                        dismissCtxMenu();
                        const blocks = noteDataRef.current[activeNote]?.content?.blocks ?? [];
                        const i = blocks.findIndex((b) => b.id === linkCtxMenu.tableId);
                        if (i !== -1)
                          updateTableRows(activeNote, i, (rows) => ({ rows, tidy: true }));
                      }
                    : undefined
                }
                onDeleteTable={
                  linkCtxMenu.tableId
                    ? () => {
                        dismissCtxMenu();
                        const blocks = noteDataRef.current[activeNote]?.content?.blocks ?? [];
                        const i = blocks.findIndex((b) => b.id === linkCtxMenu.tableId);
                        if (i !== -1) deleteWholeBlock(activeNote, i);
                      }
                    : undefined
                }
                onClose={dismissCtxMenu}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: Z.BASE + 1,
              pointerEvents: "none",
            }}
          >
            <div style={{ textAlign: "center", color: `${TEXT.muted}80`, fontSize: 14 }}>
              <div>Select a note from the sidebar</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>or press ⌘N to create one</div>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    // A sync-generation bump means the blocks must be repainted from state:
    // undo/redo, an external file change, a paste. It outranks every other
    // shortcut here, because a text-only undo looks exactly like a text-only
    // edit to the checks below — and those exist to *skip* the repaint.
    if (prev.syncGen !== next.syncGen) return false;
    // Version History swapped the note for a version, or back.
    if (prev.pastVersion !== next.pastVersion) return false;
    if (prev.deletedNote !== next.deletedNote) return false;
    if (prev.offloaded !== next.offloaded) return false;
    if (prev.unreadable !== next.unreadable) return false;

    // The selection toolbar is an interaction, not a keystroke, and it must
    // paint now: applying a format re-reads the block (which sets the
    // text-only flag below) and *then* asks the toolbar to re-read its pressed
    // state. Skipped here, the pressed glyph would wait for the 300ms text
    // commit, so Bold would light a beat after the press. The flag is
    // left for the render that commit brings.
    if (prev.toolbarState !== next.toolbarState) return false;

    // Fast path: text-only edits don't change block structure, and the
    // contentEditable DOM is already correct — skip the block loop entirely.
    if (next.textOnlyEditForEditor?.current) {
      next.textOnlyEditForEditor.current = false; // consume the flag
      return true;
    }

    // Custom comparator: avoid re-render on pure text edits while still
    // repainting React-owned state such as checkbox checked/unchecked styling.
    const pBlocks = prev.note?.content?.blocks;
    const nBlocks = next.note?.content?.blocks;
    if (haveEditorBlockRenderChanges(pBlocks, nBlocks)) return false;
    return (
      prev.activeNote === next.activeNote &&
      prev.editorFadeIn === next.editorFadeIn &&
      // toolbarState is decided above, before the text-only fast path.
      prev.noteTitleSet === next.noteTitleSet &&
      prev.blockSelection === next.blockSelection &&
      prev.lightbox === next.lightbox
    );
  },
);

/**
 * Where the formatted view's caret is, for the switch to the Markdown view:
 * the block it is in, how far into the block's text, and the block's top in
 * the pane. With no caret in the note, the first block showing at the top of
 * the pane stands in, so the page still holds its place.
 */
function formattedPlace(blocks, refs, editor, scroller) {
  const paneTop = scroller.getBoundingClientRect().top;
  const sel = window.getSelection();
  const node = sel?.rangeCount ? sel.anchorNode : null;
  if (node && editor?.contains(node)) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const id = el?.closest?.("[data-block-id]")?.getAttribute("data-block-id");
    const index = blocks.findIndex((b) => b.id === id);
    const root = index >= 0 ? refs[blocks[index].id] : null;
    if (root) {
      const offset = root.contains(node) ? Math.max(0, getCaretOffset(root)) : 0;
      return { index, offset, top: root.getBoundingClientRect().top - paneTop };
    }
  }
  for (let i = 0; i < blocks.length; i++) {
    const root = refs[blocks[i].id];
    const r = root?.getBoundingClientRect();
    if (r && r.bottom > paneTop) return { index: i, offset: 0, top: r.top - paneTop };
  }
  return null;
}

export default EditorArea;
