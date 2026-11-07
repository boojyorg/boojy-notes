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
import { useLayout, useSourceView } from "../context/LayoutContext";
import { useSettings } from "../context/SettingsContext";
import { useEditorContext } from "../context/EditorContext";
import { getAPI } from "../services/apiProvider";
import { isPhone, isWeb } from "../utils/platform";
import { SIDEBAR_HANDLE_W } from "./EditorChrome";
import NotePath, { NAME_WEIGHT, PATH_FONT } from "./NotePath";
import { parentFolders } from "../utils/pathCrumbs";
import EditableBlock from "./EditableBlock";
import OffloadedNoteView from "./OffloadedNoteView";
import PastVersionView from "./PastVersionView";
import UnreadableNoteView from "./UnreadableNoteView";
import FileView from "./FileView";
import { useRhythm } from "../tokens/rhythm";
import BlockErrorBoundary from "./BlockErrorBoundary";
import BlockDragHandle, { HANDLE_GAP } from "./BlockDragHandle";
import { gutterBlockAt } from "../utils/gutterSelect";
import FloatingToolbar from "./FloatingToolbar";
import LinkTooltip from "./LinkTooltip";
import EditorContextMenu from "./EditorContextMenu";
import InlineMathPanel from "./InlineMathPanel";
import FootnoteRefPanel from "./FootnoteRefPanel";
import { FootnoteDraftPanel, FootnoteUnavailable } from "./FootnoteDraft";
import { useFootnoteDraft } from "../hooks/editor/useFootnoteDraft";
import { menuAnchorFor, pointInRange, spellableWord, wordRangeAt } from "../utils/contextSelection";
import {
  INLINE_MATH_CLASS,
  getBlockFromNode,
  placeCaret,
  caretLength,
  isEditableBlock,
  landing,
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
  caretRangeAt,
  caretRect,
  cssZoom,
} from "../utils/domHelpers";
import { openBlock } from "../utils/blockOpen";
import { openMathSource } from "../utils/mathOpen";
import { drawInlineMath } from "../utils/inlineMath";
import { haveEditorBlockRenderChanges } from "../utils/editorBlockRenderChanges";
import { baselineFromTop, baselineInRow } from "../utils/typeBaseline";
import { listLayout } from "../utils/listStructure";
import { capturePlace, resolveAnchor, resolveCaret } from "../utils/notePlace";
import { tintElement, tintRanges } from "../utils/searchHighlight";
import { useLinkHoverTooltip } from "../hooks/editor/useLinkHoverTooltip";
import { useSpellingMarks } from "../hooks/editor/useSpellingMarks";
import { useHoldToGrab } from "../hooks/editor/useHoldToGrab";
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
import {
  gripSelection,
  selectedIds,
  selectionRange,
  stepHead,
  subtreeEnd,
  inFootnoteGroup,
} from "../utils/blockRun";
import { selectedLinesOf } from "../utils/selectedLines";
import { reorderFloor } from "../utils/blockOrder";
import { measureBlockPlaces, settleBlocks } from "../utils/blockSettle";
import { LIST_TYPES } from "../utils/blockKinds";
import BlockMenu from "./BlockMenu";
import { BAND_REACH, bandFill } from "../utils/selectionBand";
import { wholeBlocksCopy } from "../utils/clipboardCopy";
import { fromTouch } from "../utils/touch";
import { isTodoKey, todoFlip } from "../utils/todoToggle";
import { editedSurface, shedStyleResidue } from "../utils/styleResidue";
import { forgetDeletedStyle } from "../utils/typingStyle";
import { useMarqueeSelect } from "../hooks/editor/useMarqueeSelect";
import { linkTargetIn } from "../utils/embedTarget";
import { useEmbedFence } from "../hooks/editor/useEmbedFence";
import { besideLine } from "../utils/marqueeSelect";
import { withAlpha } from "../utils/selectionBand";
import { selectTagName, tagName, tagRange } from "../utils/tagName";
import { editingTag } from "../utils/tagEditing";
import {
  describeFootnote,
  editorIn,
  findFootnoteDefinition,
  footnoteBackAt,
  footnoteRefKey,
  markCaretFootnote,
  ownFootnoteRef,
  refLabel,
  watchFootnoteNumbers,
  footnoteNumbers,
} from "../utils/footnoteTarget";
import { FOOTNOTE_REF_CLASS } from "../utils/footnotes";

// `?hold` turns the phone's hold on in the web build: the e2e suite's touch
// tests and the iOS simulator's look at it.
const HOLD_IN_WEB =
  isWeb && typeof location !== "undefined" && new URLSearchParams(location.search).has("hold");

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

/** The nearest block that holds a caret, walking from `from` (itself included) by `step`; -1 when none. */
const nearestTextIndex = (blocks, from, step) =>
  landing(blocks, from - step, step, isEditableBlock);

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
    onFileOpenInPlace,
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
    openNote: openNoteProp,
    // The sidebar's press-and-hold drag, for the rows of the path's popup.
    onPathRowPointerDown,
    onShowFolder,
    // Back and Forward through the notes opened, beside the path (useNoteHistory).
    noteHistory,
    // The same, always current: the editor skips renders, so a step it takes
    // later (a footnote's ↩) reads the history as it is then.
    noteHistoryRef,
    // A heading link's way in (useWikilinkHandlers): the place now, a place
    // put back, a section revealed.
    headingNavRef,
    onEditorClick,
    onTitleBlur,
    // Edit → Find… and Find and Replace…: the menu opens the bar through this.
    openFindRef,
    // Show Markdown / Show Formatted, from the menus, ⌘/ and the lit `</>`.
    switchViewRef,
    // Edit → Duplicate reaches the editor's ⌘D through this.
    blockActionsRef,
    outsideChangeRef,
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
    // A file that is not a note, shown in the note's place (useFileView), and
    // the card's two ways on for one it can't show.
    fileView = null,
    onOpenFileDefault,
    onRevealFile,
    // A viewed PDF's right-click: copy, quote, its page's link, link into a note.
    fileActions,
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
      holdDrag,
      cancelBlockDrag,
      handleEditorMouseDown,
      handleEditorMouseUp,
      releaseMouse,
      handleEditorFocus,
      handleEditorDragOver,
      handleEditorDragLeave,
      handleEditorDrop,
      commitTextChange,
      syncGeneration,
      flipCheck,
      checkTodos,
      deleteBlock,
      registerBlockRef,
      insertBlockAfter,
      updateBlockText,
      updateCalloutTitle,
      updateTableCell,
      updateTableRows,
      updateBlockProperty,
      editFrontmatter,
      removeEmptyFrontmatter,
      removeFrontmatter,
      detectActiveFormats,
      applyFormat,
      insertFootnote,
      commitFootnoteDraft,
      canInsertFootnote,
      deleteBlockRange,
      duplicateBlockRange,
      indentBlockRange,
      moveBlock,
      setBlockKind,
      reReadBlockFromDom,
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
    const { accentColor, sidebarVisible, sidebarWidth, fullScreen } = useLayout();
    const [sourceView, setSourceView] = useSourceView(activeNote);

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
    // The open note's place as the page shows it now: its top block, and the
    // caret when it is a collapsed one in a block's own text.
    const currentPlace = () => {
      const scroller = editorScrollRef.current;
      if (!scroller || !activeNote) return null;
      const caretIn = () => {
        const sel = window.getSelection();
        if (!sel?.rangeCount || !sel.isCollapsed) return null;
        const node = sel.anchorNode;
        if (!node || !editorRef.current?.contains(node)) return null;
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        const id = el?.closest?.("[data-block-id]")?.getAttribute("data-block-id");
        const root = id && blockRefs.current[id];
        if (!root?.contains(node)) return null;
        const offset = getCaretOffset(root);
        return offset >= 0 ? { id, offset, line: caretRect(sel.getRangeAt(0), root) } : null;
      };
      const blocks = noteDataRef.current?.[activeNote]?.content?.blocks ?? [];
      return capturePlace(blocks, blockRefs.current, scroller, caretIn, cssZoom(scroller));
    };

    // A visit's place put back (`notePlace.ts`): its top block where it
    // stood, and the caret if its line shows, never pulling the page to it.
    // Null is the note's top.
    const applyPlace = (place) => {
      const scroller = editorScrollRef.current;
      if (!scroller) return;
      scroller.scrollTop = 0;
      if (!place || sourceView) return;
      const blocks = noteDataRef.current?.[activeNote]?.content?.blocks ?? [];
      const ids = new Set(blocks.map((b) => b.id));
      const anchor = resolveAnchor(place, ids);
      const anchorEl = anchor && blockRefs.current[anchor.id];
      // Rects are viewport pixels, scrollTop CSS pixels (the UI scale).
      const zoom = cssZoom(scroller);
      if (anchorEl) {
        scroller.scrollTop +=
          (anchorEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / zoom -
          anchor.top;
      }
      const caret = resolveCaret(place, ids);
      const caretEl = caret && blockRefs.current[caret.id];
      const block = caret && blocks.find((b) => b.id === caret.id);
      if (!caretEl || !isEditableBlock(block)) return;
      // Only a caret whose own line shows, put back without moving the view.
      const range = caretRangeAt(caretEl, caret.offset);
      const pane = scroller.getBoundingClientRect();
      const line = range && caretRect(range, caretEl);
      if (line && line.bottom > pane.top && line.top < pane.bottom) {
        placeCaret(caretEl, caret.offset, { reveal: false });
      }
    };

    // A heading link's section: its heading where a note's first line sits,
    // the caret let go (following a link moves the view, never the typing),
    // the section tinted as a search hit is. Blocks without text tint nothing.
    // In the Markdown view, the heading's line instead (its field keeps focus).
    const revealSection = (startId, lastId) => {
      const scroller = editorScrollRef.current;
      if (!scroller) return;
      // A note left in the Markdown view: the heading's line, at the same height.
      if (sourceView) {
        const blocks = noteDataRef.current?.[activeNote]?.content?.blocks ?? [];
        const index = blocks.findIndex((b) => b.id === startId);
        if (index >= 0) sourceApiRef.current?.reveal(index);
        return;
      }
      const el = blockRefs.current[startId];
      const editor = editorRef.current;
      if (!el || !editor) return;
      // Where a note's first line rests unscrolled: the editor's top and its
      // padding, measured, never the column's padding alone (the chrome row
      // stands over the scrolled text, and in the flow above it unscrolled).
      const zoom = cssZoom(scroller);
      const pad = Number.parseFloat(getComputedStyle(editor).paddingTop) || 0;
      scroller.scrollTop =
        (el.getBoundingClientRect().top - editor.getBoundingClientRect().top) / zoom - pad;
      // The last note's caret may sit on a node the switch removed, or on the
      // scroller, where the browser carries it into the new note's text.
      const sel = window.getSelection();
      const at = sel?.rangeCount ? sel.anchorNode : null;
      if (at && (!at.isConnected || scroller.contains(at))) sel.removeAllRanges();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && editorRef.current?.contains(focused)) focused.blur();
      const last = blockRefs.current[lastId] ?? el;
      const range = document.createRange();
      range.setStart(el, 0);
      range.setEnd(last, last.childNodes.length);
      tintRanges([range]);
    };

    // A section to reveal once its note has opened (a link into another note).
    const pendingReveal = useRef(null);
    const activeNoteRef = useRef(activeNote);
    activeNoteRef.current = activeNote;
    if (headingNavRef) {
      headingNavRef.current = {
        place: () => currentPlace(),
        applyPlace,
        reveal: (noteId, startId, lastId) => {
          if (noteId === activeNoteRef.current) revealSection(startId, lastId);
          else pendingReveal.current = { noteId, startId, lastId };
        },
      };
    }

    // A footnote reference followed (a click, or Go to footnote): the caret
    // at the end of its definition, the last of that label (Obsidian's
    // reading), a visit of its own, so Back returns to the reference. A
    // label with no definition is said, the caret left where it is.
    // The latest jump from a reference: ↩ on its footnote is Back while that
    // jump is still the visit open.
    const lastFootnoteJump = useRef(null);
    const goToFootnote = (refEl) => {
      const label = refLabel(refEl?.textContent || "");
      const blocks = noteDataRef.current?.[activeNote]?.content?.blocks ?? [];
      const at = findFootnoteDefinition(blocks, label);
      const el = at >= 0 ? blockRefs.current[blocks[at].id] : null;
      if (!el) {
        showToast?.(`No footnote [^${label}] in this note`, "info");
        return;
      }
      // Back returns to just after the reference, never inside it.
      if (refEl.isConnected && editorRef.current?.contains(refEl)) {
        const after = document.createRange();
        after.setStartAfter(refEl);
        after.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(after);
      }
      const place = currentPlace();
      if (place) noteHistory?.recordPlace?.(activeNote, place);
      const visit = noteHistory?.jump?.(activeNote);
      lastFootnoteJump.current = { label, ref: refEl, visit };
      placeCaret(el, caretLength(el), { reveal: false });
      el.scrollIntoView?.({ block: "nearest" });
      // Where it landed, tinted a moment as a heading link's section is.
      const landed = document.createRange();
      landed.selectNodeContents(el);
      tintRanges([landed]);
    };

    // A footnote's ↩. Came here from one of its references, and nowhere since
    // (the jump is still the visit open): Back, to that very reference and
    // the scroll it had. Otherwise: its first reference, a visit of its own.
    // Either way the reference is tinted a moment: the element itself, as its
    // [1] is CSS over hidden source text, which a highlight cannot paint.
    const goToReference = (label) => {
      const last = lastFootnoteJump.current;
      if (
        last?.label === label &&
        last.ref?.isConnected &&
        last.visit !== undefined &&
        noteHistoryRef?.current?.currentVisit?.() === last.visit
      ) {
        lastFootnoteJump.current = null;
        noteHistoryRef.current.back();
        tintElement(last.ref);
        return;
      }
      const ref = [...(editorRef.current?.querySelectorAll(`.${FOOTNOTE_REF_CLASS}`) ?? [])].find(
        (r) => r.getAttribute("data-fn") === label && ownFootnoteRef(r),
      );
      if (!ref) return;
      const place = currentPlace();
      if (place) noteHistory?.recordPlace?.(activeNote, place);
      noteHistory?.jump?.(activeNote);
      const after = document.createRange();
      const anchor = ref.nextSibling;
      if (anchor?.classList?.contains("caret-anchor") && anchor.firstChild)
        after.setStart(anchor.firstChild, anchor.firstChild.length);
      else after.setStartAfter(ref);
      after.collapse(true);
      editorRef.current?.focus({ preventScroll: true });
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(after);
      ref.scrollIntoView?.({ block: "nearest" });
      tintElement(ref);
    };

    // A note opens at its top. The scroller is not keyed by the note (only
    // the column inside it is), so the previous note's scroll would carry
    // over. A layout effect, so a search jump's own scroll (150 ms
    // later) still wins. Back and Forward return to the visit's place
    // instead; a heading link, to its section.
    // biome-ignore lint/correctness/useExhaustiveDependencies: the note opening is the cue; the rest is read as it stands
    useLayoutEffect(() => {
      const back = activeNote ? noteHistory?.takeRestore?.(activeNote) : null;
      applyPlace(back?.place ?? null);
      const reveal = pendingReveal.current;
      pendingReveal.current = null;
      if (reveal && reveal.noteId === activeNote) revealSection(reveal.startId, reveal.lastId);
    }, [activeNote, editorScrollRef]);

    // The open visit's place, kept as you scroll and as the caret moves, at
    // most once a frame, for Back and Forward to return to.
    // biome-ignore lint/correctness/useExhaustiveDependencies: refs and the history's stable recorder
    useEffect(() => {
      const scroller = editorScrollRef.current;
      const record = noteHistory?.recordPlace;
      if (!scroller || !record || !activeNote) return;
      let frame = 0;
      const capture = () => {
        frame = 0;
        record(activeNote, currentPlace());
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(capture);
      };
      scroller.addEventListener("scroll", schedule, { passive: true });
      document.addEventListener("selectionchange", schedule);
      return () => {
        cancelAnimationFrame(frame);
        scroller.removeEventListener("scroll", schedule);
        document.removeEventListener("selectionchange", schedule);
      };
    }, [activeNote]);

    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      el.addEventListener("beforeinput", handleEditorBeforeInput);
      return () => el.removeEventListener("beforeinput", handleEditorBeforeInput);
      // `sourceView`: the editor element is a new one on the way back from the Markdown view.
    }, [activeNote, hasNote, editorRef, handleEditorBeforeInput, sourceView]);

    // Inline formulas are drawn by KaTeX wherever the editor puts one
    // (utils/inlineMath). A press on one opens its source under it, never a
    // caret inside it (InlineMathPanel).
    const [mathTarget, setMathTarget] = useState(null);
    const closeMath = useCallback(() => setMathTarget(null), []);
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      const stop = drawInlineMath(el);
      const onPress = (e) => {
        const atom = e.button === 0 ? e.target.closest?.(`.${INLINE_MATH_CLASS}`) : null;
        const root = atom?.closest("[data-block-id]");
        if (!atom || !root || !el.contains(atom)) return;
        const blockId = root.getAttribute("data-block-id");
        const text = blockRefs.current[blockId];
        if (!text?.contains(atom)) return;
        e.preventDefault();
        e.stopPropagation();
        const index = [...text.querySelectorAll(`.${INLINE_MATH_CLASS}`)].indexOf(atom);
        setMathTarget({ blockId, index });
      };
      el.addEventListener("mousedown", onPress, true);
      return () => {
        stop();
        el.removeEventListener("mousedown", onPress, true);
        setMathTarget(null);
      };
    }, [activeNote, hasNote, editorRef, sourceView, blockRefs]);

    // Footnotes are numbered as Reading view numbers them, whatever puts one
    // in the editor (utils/footnoteTarget `numberFootnotes`). Watched from the
    // scroller, which outlives the editor element: that is replaced, the note
    // unchanged, when an offloaded note downloads or a past version closes.
    useEffect(() => {
      const host = editorScrollRef.current;
      if (!host) return;
      const stop = watchFootnoteNumbers(host);
      // ← → cross a sealed reference in one press; Backspace opens it back
      // into its text (footnoteRefKey).
      const onKey = (e) => {
        if (e.shiftKey || e.altKey || e.metaKey || e.ctrlKey || e.isComposing) return;
        const editor = editorIn(host);
        if (editor?.contains(e.target) && footnoteRefKey(e.key, editor, reReadBlockFromDom))
          e.preventDefault();
      };
      host.addEventListener("keydown", onKey, true);
      const onSel = () => {
        const editor = editorIn(host);
        if (editor) markCaretFootnote(editor);
      };
      document.addEventListener("selectionchange", onSel);
      return () => {
        stop();
        host.removeEventListener("keydown", onKey, true);
        document.removeEventListener("selectionchange", onSel);
      };
    }, [editorScrollRef, reReadBlockFromDom]);

    // A new footnote, made from where the caret is (useFootnoteDraft).
    const footnoteDraft = useFootnoteDraft({
      editorRef,
      blockRefs,
      noteDataRef,
      activeNote,
      commitFootnoteDraft,
    });

    // A reference's label, edited in a field under it (FootnoteRefPanel).
    const [fnRefTarget, setFnRefTarget] = useState(null);
    const closeFnRef = useCallback(() => setFnRefTarget(null), []);
    const openFnRefPanel = (refEl) => {
      const root = refEl?.closest("[data-block-id]");
      const blockId = root?.getAttribute("data-block-id");
      const text = blockId && blockRefs.current[blockId];
      if (!text?.contains(refEl)) return;
      const index = [...text.querySelectorAll(`.${FOOTNOTE_REF_CLASS}`)].indexOf(refEl);
      setFnRefTarget({ blockId, index });
    };
    const describeLabel = (label) =>
      describeFootnote(noteDataRef.current?.[activeNote]?.content?.blocks ?? [], label);
    const footnoteNumberOf = (label) =>
      footnoteNumbers(noteDataRef.current?.[activeNote]?.content?.blocks ?? []).get(label);

    // One native input listener for what Chromium does beside the app's own
    // handlers: a deletion's remembered style is forgotten, and
    // Chromium's copied look (a deleted code span's font and grey, as
    // `<font>` and a styled `<span>` on the next text typed) is unwrapped
    // where it appears. The read-back already takes it as plain text, so this
    // listener, which runs before the block's or field's own, changes no byte.
    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      const onInput = (e) => {
        if (e.isComposing) return;
        // After a deletion the next letters take the caret's own formatting,
        // never the deleted text's (utils/typingStyle).
        forgetDeletedStyle(e);
        const textRootOf = (blockEl) => {
          const type = blockEl.getAttribute("data-block-type");
          if (!type || !isEditableBlock({ type })) return null;
          return blockRefs.current[blockEl.getAttribute("data-block-id")] ?? null;
        };
        shedStyleResidue(editedSurface(window.getSelection()?.anchorNode ?? null, textRootOf));
      };
      el.addEventListener("input", onInput);
      return () => el.removeEventListener("input", onInput);
    }, [activeNote, hasNote, editorRef, sourceView, blockRefs]);

    // The spelling underline is the app's (useSpellingMarks), so Chromium's
    // own is off in the editor wherever the app can check. On Windows it is
    // Chromium's (electron/spelling.ts).
    const { spelling } = useSettings();
    const ownSpelling = !!getAPI()?.checkParagraphs;
    const spellingLayerRef = useRef(null);
    const spellingMarks = useSpellingMarks(
      editorRef,
      spellingLayerRef,
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

    // An embed's click opens the note it shows.
    const onNavigateToNote = useCallback((id) => openNoteProp?.(id), [openNoteProp]);

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
          // Selected, it takes no caret: the editor takes the keys, so a field
          // left behind (a code block's) never hears the next Enter.
          editorRef.current?.focus({ preventScroll: true });
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

    // The phone's hold (useHoldToGrab): a finger kept still on a block selects
    // it; moved, it drags the block (useBlockDrag, from the finger); let go
    // where it was, it opens the block's menu there. Through a ref: the drag's
    // functions come from the frozen context and close over refs only.
    const holdDragRef = useRef(holdDrag);
    holdDragRef.current = holdDrag;
    const heldIdsRef = useRef([]);
    heldIdsRef.current = selectedRun
      ? selectedIds(note?.content?.blocks || [], blockSelection)
      : [];
    useHoldToGrab({
      editorRef,
      enabled: isPhone || HOLD_IN_WEB,
      mountKey: `${activeNote}:${hasNote}:${sourceView}`,
      // A hold through the open menu's backdrop closes it.
      // A hold on a block already selected keeps the run, so its menu acts on all of it.
      onHold: (id, x, y) => {
        setBlockMenu(null);
        // A hold on a tag or a footnote reference is its own (its menu, on
        // release), never the block's.
        if (tagAtPoint(x, y) || fnRefAtPoint(x, y)) return;
        if (!heldIdsRef.current.includes(id)) setSelectedBlockId(id);
      },
      // Under the run the menu acts on (the held block and its nested items,
      // or the selection the hold kept), never on it: a block it covered
      // would be one its Delete or Turn into changes unseen.
      onRelease: (id, x, y) => {
        const tagEl = tagAtPoint(x, y);
        if (tagEl) {
          openTagMenu(tagEl, x, y);
          return;
        }
        const refEl = fnRefAtPoint(x, y);
        if (refEl) {
          openFnRefMenu(refEl, x, y);
          return;
        }
        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
        const i = blocks.findIndex((b) => b.id === id);
        const run = heldIdsRef.current;
        const kept = run.includes(id);
        const firstId = kept ? run[0] : blocks[i]?.id;
        const lastId = kept ? run[run.length - 1] : blocks[subtreeEnd(blocks, i)]?.id;
        const rootOf = (bid) => blockRefs.current[bid]?.closest?.("[data-block-id]");
        const first = rootOf(firstId)?.getBoundingClientRect();
        const last = rootOf(lastId)?.getBoundingClientRect();
        if (i < 0 || !first || !last) return;
        setBlockMenu({
          top: first.top,
          bottom: last.bottom,
          left: first.left,
          right: first.left,
          under: true,
        });
      },
      onDragStart: (id, x, y) => holdDragRef.current?.start(id, x, y) ?? false,
      onDragMove: (x, y) => holdDragRef.current?.move(x, y),
      isHeld: (id) => heldIdsRef.current.includes(id),
      onDragEnd: (cancelled) => {
        if (cancelled) cancelBlockDrag?.();
        else holdDragRef.current?.end();
        // A drop leaves the block where it landed, not selected.
        setSelectedBlockId(null);
      },
    });
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
    // staying (a run with none leaves Tab to the editor); Cmd+Shift+Up/Down
    // moves one selected block as the caret's key does, and a longer run not
    // at all (the caret's block alone would leave the run); a printable
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
        if (mod && e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
          e.preventDefault();
          const i = blocks.findIndex((b) => b.id === blockSelection.anchor);
          if (blockSelection.anchor !== blockSelection.head || i !== range.from) return true;
          const places = measureBlockPlaces(editorRef.current);
          if (moveBlock(activeNote, i, e.key === "ArrowUp" ? -1 : 1, false)) {
            settleBlocks(editorRef.current, places);
          }
          return true;
        }
        if (e.key === "F10" && e.shiftKey) {
          e.preventDefault();
          openBlockMenuAt(blocks[range.from].id);
          return true;
        }
        if (isTodoKey(e)) {
          const run = blocks.slice(range.from, range.to + 1).map((b) => b.id);
          const flip = todoFlip(blocks, run);
          if (flip) {
            e.preventDefault();
            checkTodos(activeNote, flip.ids, flip.checked);
            return true;
          }
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSelectedBlockId(null);
          // A formula selected alone opens its source; anything else opens a line under it.
          if (range.from === range.to && blocks[range.from].type === "math") {
            openMathSource(blocks[range.from].id);
          } else insertBlockAfter(activeNote, range.to, "p", "");
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
        checkTodos,
        copySelectedBlocks,
        insertBlockAfter,
        indentBlockRange,
        moveBlock,
        openBlockMenuAt,
      ],
    );

    // The caret rests, hidden, at the end of a selected text block, so keys
    // reach the editor and a letter typed deselects and carries on writing.
    const restCaretIn = useCallback(
      (blockId) => {
        const block = noteDataRef.current[activeNote]?.content?.blocks?.find(
          (b) => b.id === blockId,
        );
        const el = blockRefs.current[blockId];
        if (block && el && isEditableBlock(block)) placeCaret(el, caretLength(el));
        else editorRef.current?.focus({ preventScroll: true });
      },
      [activeNote, noteDataRef, blockRefs, editorRef],
    );

    // A press on a block's grip that never became a drag, or a right-click on
    // it: open its menu under the grip on the run it was pressed in, or the
    // lines a text selection runs through, else the block alone
    // (`gripSelection`), with that grip's face pressed. Shift extends the run
    // from its anchor instead. The text selection is read here, before the
    // caret comes to rest and collapses it.
    const handleGripClick = useCallback(
      (blockId, extend, gripRect) => {
        if (extend) {
          setBlockSelection((s) =>
            s ? { ...s, head: blockId } : { anchor: blockId, head: blockId, grip: blockId },
          );
          return;
        }
        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
        const sel = window.getSelection();
        const floor = reorderFloor(blocks);
        const lineIds =
          sel?.rangeCount && !sel.isCollapsed
            ? selectedLinesOf(blocks, sel).filter(
                (id) => blocks.findIndex((b) => b.id === id) >= floor,
              )
            : [];
        setBlockSelection((s) => gripSelection(blocks, s, lineIds, blockId));
        const { top, bottom, left, right } = gripRect;
        setBlockMenu({ top, bottom, left, right });
        restCaretIn(blockId);
      },
      [activeNote, noteDataRef, setBlockSelection, restCaretIn],
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
        // A fresh pick: the block alone, whatever was selected, and no menu.
        setSelectedBlockId(id);
        restCaretIn(id);
      },
      [editorRef, blockRefs, setSelectedBlockId, restCaretIn],
    );

    // An embed's copy is read-only: a selection in it edits nothing (useEmbedFence).
    useEmbedFence(editorRef);

    // A drag from the note's background or a block's gutter strip draws a box
    // that selects the blocks it touches (useMarqueeSelect). Its start is
    // exactly the background (the scroller, the column, the editor between
    // its blocks) or a gutter strip; a control under the press keeps it.
    const blockSelectionRef = useRef(blockSelection);
    blockSelectionRef.current = blockSelection;
    useMarqueeSelect({
      enabled: !isPhone,
      scrollerRef: editorScrollRef,
      editorRef,
      currentSelection: () => blockSelectionRef.current,
      setBlockSelection,
      restCaretIn: (id) => restCaretIn(id),
      releaseMouse,
      colours: {
        fill: withAlpha(accentColor, theme.name === "night" ? 0.14 : 0.1),
        edge: withAlpha(accentColor, 0.55),
      },
      startsBox: (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return false;
        if (t.closest("button, a, input, textarea, select, [role='button'], .block-drag-handle"))
          return false;
        if (t.closest(".checkbox-hit, .wikilink, .inline-tag")) return false;
        if (
          editorRef.current &&
          gutterBlockAt(editorRef.current, blockRefs.current, e.clientX, e.clientY, HANDLE_GAP)
        )
          return true;
        // Beside a block on its right is the line's: a drag from there is text.
        const editor = editorRef.current;
        if (editor) {
          const spans = Array.from(editor.children, (el) => el.getBoundingClientRect());
          if (besideLine(spans, editor.getBoundingClientRect().left, e.clientX, e.clientY))
            return false;
        }
        return (
          t === editorScrollRef.current ||
          t === columnRef.current ||
          t === editorContainerRef.current ||
          t === editorRef.current
        );
      },
    });

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

    const handleImageCopyImage = useCallback((src) => {
      const api = getAPI();
      if (api?.copyImageToClipboard) {
        api.copyImageToClipboard(src);
      }
    }, []);

    const handleFileOpenDefault = useCallback(async (src) => {
      const api = getAPI();
      if (!api?.resolveAttachment) return;
      const absPath = await api.resolveAttachment(src);
      if (absPath && api.openPath) api.openPath(absPath);
    }, []);

    // A file block opens its file in the note's place, as a [[link]] to it
    // does; the default app only for a file the vault's list doesn't hold.
    const handleFileOpen = useCallback(
      (src) => {
        if (!onFileOpenInPlace?.(src)) handleFileOpenDefault(src);
      },
      [onFileOpenInPlace, handleFileOpenDefault],
    );

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
    // The tag being edited (the selection is in it, `tagEditing`) wears
    // `data-editing`, and is read at each press, before the press moves the
    // caret, so a first click on a tag still searches.
    const tagAtPressRef = useRef(null);
    useEffect(() => {
      let shown = null;
      const mark = () => {
        const tag = editingTag(editorRef.current);
        if (tag === shown) return;
        shown?.removeAttribute("data-editing");
        tag?.setAttribute("data-editing", "");
        shown = tag;
      };
      const press = () => {
        tagAtPressRef.current = editingTag(editorRef.current);
      };
      document.addEventListener("selectionchange", mark);
      document.addEventListener("pointerdown", press, true);
      return () => {
        document.removeEventListener("selectionchange", mark);
        document.removeEventListener("pointerdown", press, true);
        shown?.removeAttribute("data-editing");
      };
    }, [editorRef]);

    const [linkCtxMenu, setLinkCtxMenu] = useState(null);

    /** The note's tag under a point (a hold's finger), if any. */
    const tagAtPoint = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.(".inline-tag");
      return el && editorRef.current?.contains(el) ? el : null;
    };

    /** The open note's footnote reference under a point (a hold's finger), if any. */
    const fnRefAtPoint = (x, y) => {
      const el = ownFootnoteRef(document.elementFromPoint(x, y));
      return el && editorRef.current?.contains(el) ? el : null;
    };

    // The phone's hold on a footnote reference: its menu (Go to footnote,
    // Edit reference, Cut, Copy), the reference selected whole.
    const openFnRefMenu = (refEl, x, y) => {
      setSelectedBlockId(null);
      const whole = document.createRange();
      whole.selectNode(refEl);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(whole);
      setLinkCtxMenu({
        anchor: menuAnchorFor(whole, x, y),
        linkType: null,
        range: whole.cloneRange(),
        field: null,
        host: null,
        tableId: null,
        canCutCopy: true,
        footnote: refEl,
      });
    };

    // The phone's hold on a tag opens the tag's menu, the desktop's
    // right-click one (Search, Edit tag, Cut, Copy), the tag selected whole as
    // a right-click selects it, and no block held.
    const openTagMenu = (tagEl, x, y) => {
      const whole = tagRange(tagEl);
      if (!whole) return;
      setSelectedBlockId(null);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(whole);
      const hangFrom = document.createRange();
      hangFrom.selectNodeContents(tagEl);
      const cell = tagEl.closest('[data-block-type="table"] th, [data-block-type="table"] td');
      setLinkCtxMenu({
        anchor: menuAnchorFor(hangFrom, x, y),
        linkType: null,
        range: whole.cloneRange(),
        field: null,
        host: cell,
        tableId: cell?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null,
        canCutCopy: true,
        tag: tagName(tagEl),
        element: tagEl,
      });
    };
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
        const tagEl = e.target.closest(".inline-tag");
        const fnRef = ownFootnoteRef(e.target);
        // In a numbered footnote: Back to reference, its ↩ by name.
        const fnRow = e.target.closest?.('[data-block-type="footnote"]');
        const backTo =
          fnRow && editorRef.current?.contains(fnRow) && !fnRow.closest("[data-embed-source]")
            ? (fnRow.querySelector("[data-footnote-label][data-n]")?.getAttribute("data-fn") ??
              null)
            : null;
        // A tag or a footnote reference is left as it is, as a link is: its
        // menu is about it.
        const linkEl = anchor || wikilink || tagEl || fnRef;
        // A right-click on a word outside the selection selects the word, as
        // a Mac text field does; inside the selection it keeps it. A link is
        // left as it is: its menu is about the link.
        // From the keyboard (Shift+F10) the selection is the caret's, kept as it is.
        if (!field && !linkEl && !e.fromKeyboard && !(range && pointInRange(range, x, y))) {
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
        // A tag outside the selection is selected whole, `#` and all, as a
        // word is: Cut and Copy take all of it.
        if (tagEl && !field && !(range && pointInRange(range, x, y))) {
          const whole = tagRange(tagEl);
          if (whole) {
            sel.removeAllRanges();
            sel.addRange(whole);
            range = whole.cloneRange();
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
          // Where the selection now ends, a reference could go; never in the
          // menu of a link, tag or reference, which is about that.
          canFootnote: !field && !linkEl && canInsertFootnote(),
          footnote: fnRef,
          backTo,
        };
        if (tagEl) {
          menu.tag = tagName(tagEl);
          menu.element = tagEl;
        } else if (anchor) {
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

    // The open note took a version from disk (an edit in another app), its
    // blocks keeping their ids. A formula's source names its formula by place
    // in its block, so one in a block that changed may now name another: it
    // closes. The right-click menu acts on a range taken before the change:
    // it closes too.
    if (outsideChangeRef) {
      outsideChangeRef.current = (changed) => {
        setMathTarget((t) => (t && changed.has(t.blockId) ? null : t));
        setLinkCtxMenu(null);
      };
    }

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
    // keeps a stable scrollbar gutter the column is centred beside (the
    // phone's scrollbar is drawn over the content and takes none).
    const editorW = `(${atScale("100vw")} - ${
      (sidebarVisible ? sidebarWidth + SIDEBAR_HANDLE_W : 0) + (isPhone ? 0 : SCROLLBAR_W)
    }px)`;
    const colPad = ramp(editorW, [COL_PAD_FROM, COL_PAD_MIN], [COL_PAD_TO, COL_PAD_MAX]);
    const colMax = `calc(${rhythm.measure * rhythm.bodySize}px + 2 * ${colPad})`;
    const colMargin = `max(0px, calc((${editorW} - ${colMax}) / 2))`;
    // Memoised so the band's measuring effect keys on the folder, not on a
    // fresh array every render.
    const folder = deletedNote
      ? deletedNote.item.folder
      : fileView
        ? fileView.rel.slice(0, Math.max(0, fileView.rel.lastIndexOf("/")))
        : note?.folder;
    const parents = useMemo(() => parentFolders(folder), [folder]);
    // The note name is a file label, not the document's heading: it reads at
    // label rank so it never competes with a Markdown H1 in the body. A file
    // `demo-v1.2.md` whose first block is `# Notes Demo v1.2` shows both, read
    // as file then document. Editing the heading never renames the file. It
    // sits in the chrome row, centred on the pane behind its folder path
    // (NotePath).
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
          if (fromTouch(e)) return;
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
          // A viewed file scrolls its own pages, so the pane keeps no lane.
          scrollbarGutter: fileView ? "auto" : "stable",
          ...(fileView ? { overflowY: "hidden" } : null),
          background: theme.BG.editor,
          position: "relative",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {(note || deletedNote || fileView) && (
          <NotePath
            // A file and a note have different controls beside the path: a
            // fresh path for each, so it snaps to its place instead of gliding
            // there on the sidebar's clock.
            key={fileView ? "file" : "note"}
            parents={parents}
            name={deletedNote ? deletedNote.item.name : fileView ? fileView.name : note.title}
            lane={!fileView}
            rightControlsW={fileView?.controlsWidth ?? 0}
            collapsed={!sidebarVisible}
            fullScreen={fullScreen}
            bg={theme.BG.editor}
            activeNote={activeNote}
            onOpenNote={openNoteProp}
            onRowPointerDown={onPathRowPointerDown}
            onShowFolder={onShowFolder}
            history={noteHistory}
            outsideFolder={!deletedNote && !fileView ? (note?.outside ?? null) : null}
          >
            {deletedNote ? (
              <span data-deleted-title style={{ color: theme.TEXT.primary }}>
                {deletedNote.item.name || "Untitled"}
              </span>
            ) : fileView ? (
              <span
                data-file-title
                style={{
                  color: theme.TEXT.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {fileView.name}
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
                onContextMenu={isPhone ? undefined : handleEditorContextMenu}
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
                      // Shift+F10 opens the text menu at the caret, as a right-click
                      // there would (a Mac sends no menu event for it).
                      if (e.key === "F10" && e.shiftKey && !mod && !e.altKey && !isPhone) {
                        const sel = window.getSelection();
                        const node = sel?.rangeCount ? sel.focusNode : null;
                        const target =
                          node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
                        if (target && editorRef.current?.contains(target)) {
                          e.preventDefault();
                          const r = sel.getRangeAt(0).getBoundingClientRect();
                          const at = r.height ? r : target.getBoundingClientRect();
                          handleEditorContextMenu({
                            target,
                            clientX: at.left,
                            clientY: at.top + at.height / 2,
                            defaultPrevented: false,
                            preventDefault() {},
                            fromKeyboard: true,
                          });
                          return;
                        }
                      }
                      handleEditorKeyDown(e);
                    }}
                    onInput={handleEditorInput}
                    onPaste={handleEditorPaste}
                    onCopy={handleEditorCopy}
                    onCut={handleEditorCut}
                    onMouseMove={handleEditorMouseMove}
                    onMouseLeave={handleEditorMouseLeave}
                    // The phone's long-press is Android's: it selects the word and
                    // shows the system's own Cut, Copy, Paste over it.
                    onContextMenu={isPhone ? undefined : handleEditorContextMenu}
                    onMouseDown={(e) => {
                      handleEditorMouseDown(e);
                      // Prevent caret placement inside links on click (for instant open feel)
                      if (!e.shiftKey && e.button === 0) {
                        const anchor = e.target.closest("a");
                        const wikilink = e.target.closest(".wikilink");
                        // A footnote reference is sealed: a press jumps, never places a caret.
                        if (anchor || wikilink || ownFootnoteRef(e.target)) e.preventDefault();
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
                      // A footnote's ↩ goes back up to its reference.
                      const backTo = footnoteBackAt(e.target, e.clientX, e.clientY);
                      if (backTo) {
                        e.preventDefault();
                        goToReference(backTo);
                        return;
                      }
                      // A footnote reference jumps to its definition.
                      const fnRef = ownFootnoteRef(e.target);
                      if (fnRef) {
                        goToFootnote(fnRef);
                        return;
                      }
                      const tag = e.target.closest(".inline-tag");
                      if (tag) {
                        // The tag being edited when the press began takes the
                        // click as text: the caret lands where it was.
                        if (tag === tagAtPressRef.current) return;
                        // A click searches; editing is the tag's menu's (Edit tag).
                        const name = tagName(tag);
                        if (name && onTagClick) onTagClick(name);
                        return;
                      }
                      // An embed's arrow opens its source, as a link to it would.
                      const embedOpen = e.target.closest(".embed-open");
                      if (embedOpen) {
                        e.preventDefault();
                        const target = embedOpen.getAttribute("data-target");
                        if (target && onWikilinkClick) onWikilinkClick(target, embedOpen);
                        return;
                      }
                      const wikilink = e.target.closest(".wikilink");
                      if (wikilink) {
                        e.preventDefault();
                        // Inside an embed, a link reads as in its own note.
                        const target = linkTargetIn(wikilink);
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
                              continuesFootnote={
                                block.type === "p" && inFootnoteGroup(note.content.blocks, i)
                              }
                              onUpdateText={updateBlockText}
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
                              onBlockSelect={setSelectedBlockId}
                              onImageDragPress={imageDragPress}
                              onImageCopyImage={handleImageCopyImage}
                              showToast={showToast}
                              onUpdateBlockProperty={updateBlockProperty}
                              onEditFrontmatter={editFrontmatter}
                              onRemoveEmptyFrontmatter={removeEmptyFrontmatter}
                              onRemoveFrontmatter={removeFrontmatter}
                              onShowMarkdown={() => switchViewRef?.current?.()}
                              onTagClick={onTagClick}
                              onFileOpen={handleFileOpen}
                              onFileOpenDefault={handleFileOpenDefault}
                              onFileShowInFolder={handleFileShowInFolder}
                              noteDataRef={noteDataRef}
                              onNavigateToNote={onNavigateToNote}
                            />
                          </BlockErrorBoundary>
                        );
                      });
                    })()}
                  </div>
                  {/* The spelling underline (useSpellingMarks): laid over the
                      text, outside it, so the text is never split to draw it. */}
                  <div ref={spellingLayerRef} className="spelling-layer" aria-hidden="true" />
                  {/* Desktop only: on the phone a press in the text is the
                      caret's, and the bar above the keyboard does the rest. */}
                  {!isPhone && (
                    <BlockDragHandle
                      columnRef={columnRef}
                      editorRef={editorRef}
                      startHandleDrag={startHandleDrag}
                      onGripClick={handleGripClick}
                      pinnedBlockId={
                        selectedRun && blockSelection.grip ? blockSelection.grip : null
                      }
                      pinKey={note.content.blocks}
                    />
                  )}
                  {blockMenu && selectedRun && (
                    <BlockMenu
                      anchor={blockMenu}
                      under={!!blockMenu.under}
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
                      fold={(() => {
                        // One callout: Make foldable writes `-` (starts
                        // folded); Always open takes away `-` or `+`. An edit.
                        if (selectedRun.from !== selectedRun.to) return undefined;
                        const b = note.content.blocks[selectedRun.from];
                        if (b?.type !== "callout") return undefined;
                        const written = b.calloutFold === "-" || b.calloutFold === "+";
                        return {
                          written,
                          onChange: () => {
                            setBlockMenu(null);
                            updateBlockProperty(activeNote, selectedRun.from, {
                              calloutFold: written ? "" : "-",
                            });
                          },
                        };
                      })()}
                      onEditLink={() => {
                        setBlockMenu(null);
                        openBlock(note.content.blocks[selectedRun.from].id);
                      }}
                      onClose={() => setBlockMenu(null)}
                    />
                  )}
                  <FloatingToolbar
                    // Never beside the right-click menu: one surface at a time.
                    // The phone's text styles are the bar above the keyboard.
                    position={linkCtxMenu || isPhone ? null : toolbarState}
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

            {mathTarget && (
              <InlineMathPanel
                key={`${mathTarget.blockId}:${mathTarget.index}`}
                target={mathTarget}
                blockRefs={blockRefs}
                syncGen={syncGeneration.current}
                reRead={reReadBlockFromDom}
                onClose={closeMath}
              />
            )}

            {footnoteDraft.unavailable && !footnoteDraft.draft && (
              <FootnoteUnavailable
                rect={footnoteDraft.unavailable.rect}
                text={footnoteDraft.unavailable.text}
              />
            )}
            {footnoteDraft.draft && (
              <FootnoteDraftPanel
                key={`${footnoteDraft.draft.blockId}:${footnoteDraft.draft.kind}`}
                draft={footnoteDraft.draft}
                number={footnoteDraft.number}
                draftText={footnoteDraft.draftText}
                onDone={footnoteDraft.done}
                onCancel={footnoteDraft.cancel}
              />
            )}
            {fnRefTarget && (
              <FootnoteRefPanel
                key={`${fnRefTarget.blockId}:${fnRefTarget.index}`}
                target={fnRefTarget}
                blockRefs={blockRefs}
                describe={describeLabel}
                numberOf={footnoteNumberOf}
                reRead={reReadBlockFromDom}
                onClose={closeFnRef}
              />
            )}

            {/* Right-click menu */}
            {linkCtxMenu && (
              <EditorContextMenu
                anchor={linkCtxMenu.anchor}
                link={linkCtxMenu.linkType}
                tag={linkCtxMenu.tag}
                onSearchTag={() => {
                  const { tag } = linkCtxMenu;
                  dismissCtxMenu();
                  if (tag && onTagClick) onTagClick(tag);
                }}
                onEditTag={() => {
                  const { element } = linkCtxMenu;
                  dismissCtxMenu();
                  if (element?.isConnected) selectTagName(element);
                }}
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
                onGoToFootnote={
                  linkCtxMenu.footnote
                    ? () => {
                        const ref = linkCtxMenu.footnote;
                        dismissCtxMenu();
                        goToFootnote(ref);
                      }
                    : undefined
                }
                onBackToReference={
                  linkCtxMenu.backTo
                    ? () => {
                        const label = linkCtxMenu.backTo;
                        dismissCtxMenu();
                        goToReference(label);
                      }
                    : undefined
                }
                onEditFootnoteRef={
                  linkCtxMenu.footnote
                    ? () => {
                        const ref = linkCtxMenu.footnote;
                        dismissCtxMenu();
                        openFnRefPanel(ref);
                      }
                    : undefined
                }
                onInsertFootnote={
                  linkCtxMenu.canFootnote ? () => runOnSelection(insertFootnote) : undefined
                }
                canCutCopy={linkCtxMenu.canCutCopy}
                canPaste={!!getAPI()?.paste}
                // The phone has no way to paste from a menu: no row for it.
                pasteRow={!isPhone}
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
        ) : fileView ? (
          <FileView
            view={fileView}
            openFile={onOpenFileDefault}
            revealFile={onRevealFile}
            actions={fileActions}
          />
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
    if (prev.fileView !== next.fileView) return false;

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
      prev.blockSelection === next.blockSelection
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
