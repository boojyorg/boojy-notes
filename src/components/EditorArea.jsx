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
} from "../constants/layout";
import { Z } from "../constants/zIndex";
import { useLayout } from "../context/LayoutContext";
import { useEditorContext } from "../context/EditorContext";
import { getAPI } from "../services/apiProvider";
import { SIDEBAR_HANDLE_W } from "./EditorChrome";
import NotePath, { NAME_WEIGHT, PATH_FONT } from "./NotePath";
import { parentFolders } from "../utils/pathCrumbs";
import EditableBlock, { EDITOR_FONT_SIZE, EDITOR_LINE_HEIGHT } from "./EditableBlock";
import BlockErrorBoundary from "./BlockErrorBoundary";
import BlockDragHandle from "./BlockDragHandle";
import FloatingToolbar from "./FloatingToolbar";
import LinkTooltip from "./LinkTooltip";
import EditorContextMenu from "./EditorContextMenu";
import { menuAnchorFor, pointInRange, wordRangeAt } from "../utils/contextSelection";
import {
  getBlockFromNode,
  placeCaret,
  caretLength,
  isEditableBlock,
  isSelectableBlock,
  hasOwnField,
  focusOwnedField,
  titleFieldText,
} from "../utils/domHelpers";
import { haveEditorBlockRenderChanges } from "../utils/editorBlockRenderChanges";
import { baselineFromTop, baselineInRow } from "../utils/typeBaseline";
import { listLayout } from "../utils/listStructure";
import { useLinkHoverTooltip } from "../hooks/editor/useLinkHoverTooltip";
import FindBar from "./FindBar";
import { ramp } from "../utils/fluidLength";
import { wikilinkStatus } from "../utils/wikilinkTarget";
import { panelTransition } from "../tokens/motion";

/*
 * The note name is a FILE LABEL, not the document's heading.
 *
 * It reads at label rank so it can never compete with a real Markdown H1 in
 * the body. A note whose file is `boojy-notes-design-demo-v1.2.md` and whose
 * first block is `# Notes Demo v1.2` shows both, and they read as
 * file-then-document rather than as two titles. The filename and the H1 stay
 * independent: editing the heading never renames the file.
 *
 * On the desktop it sits in the chrome row, centred on the pane behind its
 * folder path (NotePath, 2026-09-15), and the column below it starts where it
 * always did: the body did not move when the name left it. On a touch device
 * there is no chrome row, so the name keeps its place at the head of the
 * column, small and muted.
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
 * Tops agreeing and centres agreeing were the two answers before this, on the
 * same day; a baseline is the line the eye actually reads two words as sharing.
 */
const COLUMN_TOP =
  COLUMN_HEAD_GAP +
  baselineInRow(ACTION_ROW_H, ROW_LABEL_SIZE, ROW_LABEL_LINE_HEIGHT) -
  baselineFromTop(EDITOR_FONT_SIZE, EDITOR_LINE_HEIGHT) +
  FIRST_LINE_BELOW_ROW;
const MOBILE_LABEL_FONT_SIZE = 13.5;
const MOBILE_LABEL_LINE_HEIGHT = 1.4;
/** Air between the mobile label and the first Markdown block. */
const MOBILE_LABEL_GAP = 26;

/*
 * The writing column is fluid, because the window is.
 *
 * Width should change how much room the prose has, never what the app is. So
 * as the window narrows the column gives up its decorative left offset first
 * and its gutters second — losing them in that order keeps text comfortable
 * for roughly 200px longer than shrinking both at once would.
 *
 * Both ramps are linear between two anchors and clamped at each end. The
 * offset is fully spent at 640px of editor width and the gutters bottom out
 * at 560px (2026-09-14; they were 560 and 400, so the 600px window still
 * carried 45px gutters and the minimum could go no lower); below that the
 * column only gets narrower. The gutter floor is the drag grip's: 20px plus
 * its 4px gap live in the left padding, and the right side matches it. The
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
const COL_PAD_MIN = 24;
const COL_PAD_MAX = 56;
const COL_PAD_FROM = 560;
const COL_PAD_TO = 800;
/** Decorative left offset: 0 at the editor floor, COL_OFFSET_MAX at _TO. */
const COL_OFFSET_MAX = 40;
const COL_OFFSET_FROM = 640;
const COL_OFFSET_TO = 880;

/** The nearest block that holds a caret, walking from `from` by `step`; -1 when none. */
function nearestTextIndex(blocks, from, step) {
  let i = from;
  while (i >= 0 && i < blocks.length && !isEditableBlock(blocks[i])) i += step;
  return i >= 0 && i < blocks.length ? i : -1;
}

const EditorArea = memo(
  function EditorArea({
    isMobile,
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
    selectedBlockId,
    setSelectedBlockId,
    lightbox: _lightbox,
    setLightbox,
    openNote: openNoteProp,
    // The sidebar's press-and-hold drag, for the rows of the path's popup.
    onPathRowPointerDown,
    onEditorClick,
    onTitleBlur,
    // Edit → Find… and Find and Replace…: the menu opens the bar through this.
    openFindRef,
  }) {
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
    } = useEditorContext();
    const { theme } = useTheme();
    const { TEXT, BG } = theme;
    const { accentColor, editorBg, sidebarVisible, sidebarWidth, fullScreen } = useLayout();

    // Find bar state
    const [findBarOpen, setFindBarOpen] = useState(false);
    const [findBarReplace, setFindBarReplace] = useState(false);
    // The menu's Find… opens the bar (and Find and Replace… with Replace shown);
    // unlike Cmd+F it never closes it, since a menu item says what it does.
    if (openFindRef) {
      openFindRef.current = (replace) => {
        setFindBarReplace(!!replace);
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
    // the column inside it is), so the previous note's scroll carried over:
    // the path band is sticky inside the scroller and stayed put while the
    // new note's first line sat high under it, off the New note baseline
    // (2026-09-20). A layout effect, so a search jump's own scroll (150 ms
    // later) still wins.
    useLayoutEffect(() => {
      if (editorScrollRef.current) editorScrollRef.current.scrollTop = 0;
    }, [activeNote, editorScrollRef]);

    useEffect(() => {
      const el = editorRef.current;
      if (!el) return;
      el.addEventListener("beforeinput", handleEditorBeforeInput);
      return () => el.removeEventListener("beforeinput", handleEditorBeforeInput);
    }, [activeNote, hasNote, editorRef, handleEditorBeforeInput]);

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
    const handleBlockSelect = useCallback(
      (blockId) => {
        setSelectedBlockId(blockId);
      },
      [setSelectedBlockId],
    );

    // Remove a block addressed as a whole (the selected divider, image or
    // table; the table's own Delete table) and land the caret at the start of
    // the next text block, or the end of the previous one if there is none,
    // so a Backspace that arrived from the block below can carry on from where
    // it was. Also the image's and file's own Delete.
    const deleteWholeBlock = useCallback(
      (noteId, idx) => {
        const blocks = noteDataRef.current[noteId]?.content?.blocks || [];
        const next = nearestTextIndex(blocks, idx + 1, 1);
        const prev = nearestTextIndex(blocks, idx - 1, -1);
        if (next >= 0) {
          focusBlockId.current = blocks[next].id;
          focusCursorPos.current = 0;
        } else if (prev >= 0) {
          focusBlockId.current = blocks[prev].id;
          focusCursorPos.current = (blocks[prev].text || "").length;
        }
        deleteBlock(noteId, idx);
        setSelectedBlockId(null);
      },
      [noteDataRef, deleteBlock, focusBlockId, focusCursorPos, setSelectedBlockId],
    );

    // Keys while a whole block is selected. Escape deselects and moves nothing;
    // the arrows put the caret in the nearest text block on that side;
    // Backspace and Delete remove the block (deleteWholeBlock); Enter opens a
    // paragraph under the block; a printable character deselects and types
    // where the caret already is. True when consumed.
    const handleSelectedBlockKey = useCallback(
      (e) => {
        const blocks = noteDataRef.current[activeNote]?.content?.blocks || [];
        const idx = blocks.findIndex((b) => b.id === selectedBlockId);
        if (idx < 0) {
          setSelectedBlockId(null);
          return false;
        }
        const nearestText = (from, step) => nearestTextIndex(blocks, from, step);
        if (e.key === "Escape") {
          e.preventDefault();
          setSelectedBlockId(null);
          return true;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const up = e.key === "ArrowUp";
          const target = nearestText(idx + (up ? -1 : 1), up ? -1 : 1);
          setSelectedBlockId(null);
          if (target >= 0) {
            const el = blockRefs.current[blocks[target].id];
            if (el) placeCaret(el, up ? caretLength(el) : 0);
          }
          return true;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          deleteWholeBlock(activeNote, idx);
          return true;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          setSelectedBlockId(null);
          insertBlockAfter(activeNote, idx, "p", "");
          return true;
        }
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) setSelectedBlockId(null);
        return false;
      },
      [
        activeNote,
        selectedBlockId,
        setSelectedBlockId,
        noteDataRef,
        blockRefs,
        deleteWholeBlock,
        insertBlockAfter,
      ],
    );

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
    // a picture in its row, the margins, the sidebar and the chrome alike
    // (2026-09-23). Before, only a click in the text column did, and the
    // picture's whole row counted as the picture, so a picture stayed selected
    // (its controls up) with the pointer well to its right. A surface is the
    // thing drawn (`data-selection-surface`: the picture's frame, the divider's
    // row) plus the image menu, which is portalled out of it. Capture phase, so
    // it runs before the press that selects another block.
    useEffect(() => {
      if (!selectedBlockId) return;
      const onPress = (e) => {
        if (e.target.closest?.("[data-selection-surface], .image-context-menu")) return;
        setSelectedBlockId(null);
      };
      document.addEventListener("mousedown", onPress, true);
      return () => document.removeEventListener("mousedown", onPress, true);
    }, [selectedBlockId, setSelectedBlockId]);

    // The editor's right-click menu: a link's own actions when the pointer is
    // on one, then Cut, Copy and Paste (EditorContextMenu). What the menu acts
    // on is taken now, before it takes focus: the selection's range and the
    // field that held focus (a code block's textarea keeps its own selection).
    const [linkCtxMenu, setLinkCtxMenu] = useState(null);

    const handleEditorContextMenu = useCallback(
      (e) => {
        // A block with a menu of its own (an image) has already answered.
        if (e.defaultPrevented || isMobile) return;
        e.preventDefault();
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
          // or two, gets Fix link, which is the picker (2026-09-20).
          const status = wikilinkStatus(target, noteDataRef.current);
          menu.linkType = status.kind === "note" ? "wikilink" : "wikilink-broken";
          menu.url = target;
          menu.title = status.kind === "note" ? status.title : target;
          menu.element = wikilink;
        }
        setLinkCtxMenu(menu);
      },
      [noteDataRef, isMobile, editorRef],
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
          editorRef.current?.focus({ preventScroll: true });
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

    // Width the editor actually has: the viewport less whatever the sidebar and
    // its handle are occupying. Mobile keeps its own fixed geometry.
    const editorW = `(100vw - ${sidebarVisible ? sidebarWidth + SIDEBAR_HANDLE_W : 0}px)`;
    const colPad = ramp(editorW, [COL_PAD_FROM, COL_PAD_MIN], [COL_PAD_TO, COL_PAD_MAX]);
    const colOffset = ramp(editorW, [COL_OFFSET_FROM, 0], [COL_OFFSET_TO, COL_OFFSET_MAX]);
    // The name's field, one element wherever it is rendered: in the chrome
    // row's path band on the desktop, at the head of the column on a touch
    // device. Its handlers are the title's own and do not change with the
    // place; only its rest colours do (primary ink in the band, muted in the
    // column).
    const restColor = isMobile ? TEXT.muted : TEXT.primary;
    // Memoised so the band's measuring effect keys on the folder, not on a
    // fresh array every render.
    const folder = note?.folder;
    const parents = useMemo(() => parentFolders(folder), [folder]);
    const hoverColor = isMobile ? TEXT.secondary : TEXT.primary;
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
            n.title = newTitle;
            n.content = { ...n.content, title: newTitle };
            next[activeNote] = n;
            return next;
          });
        }}
        onKeyDown={(e) => {
          // Enter, or ArrowDown (the name is one line, so down always leaves
          // it): into the note's first block. ArrowUp from the first block
          // comes back here (2026-09-24).
          if (e.key === "Enter" || (e.key === "ArrowDown" && !e.shiftKey)) {
            e.preventDefault();
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
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onFocus={(e) => {
          // The placeholder's width holds under the caret from the moment
          // the placeholder has shown in this editing session (a new note, a
          // name cleared and retyped) until the caret leaves, so a short name
          // typed over it never snaps the pill narrow and re-centres the path
          // per letter. A rename that never empties follows its text, as a
          // rename field should (judged 2026-09-17). GlobalStyles reads it.
          if (titleFieldText(e.currentTarget) === "")
            e.currentTarget.setAttribute("data-placeholder-floor", "");
          // Truncation is a display concern — editing reveals the whole name.
          e.currentTarget.style.background = BG.surface;
          e.currentTarget.style.color = TEXT.primary;
          e.currentTarget.style.textOverflow = "clip";
          e.currentTarget.style.overflowX = "auto";
        }}
        onBlur={(e) => {
          e.currentTarget.removeAttribute("data-placeholder-floor");
          // A blank name takes the filename the write answered with, now.
          onTitleBlur?.();
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = restColor;
          e.currentTarget.style.textOverflow = "ellipsis";
          e.currentTarget.style.overflowX = "hidden";
        }}
        onMouseEnter={(e) => {
          if (document.activeElement === e.currentTarget) return;
          e.currentTarget.style.background = BG.surface;
          e.currentTarget.style.color = hoverColor;
        }}
        onMouseLeave={(e) => {
          if (document.activeElement === e.currentTarget) return;
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = restColor;
        }}
        style={
          isMobile
            ? {
                fontSize: MOBILE_LABEL_FONT_SIZE,
                fontWeight: 500,
                color: restColor,
                lineHeight: MOBILE_LABEL_LINE_HEIGHT,
                margin: `0 0 ${MOBILE_LABEL_GAP}px ${-LABEL_PAD_X}px`,
                padding: `0 ${LABEL_PAD_X}px`,
                borderRadius: 4,
                outline: "none",
                position: "relative",
                cursor: "text",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                transition: "background 0.12s, color 0.12s",
              }
            : {
                // In the path band: the name's box is its text, and the hover
                // pill's padding is pulled back out with a negative margin so the
                // path centres on the letters, not on the pill.
                ...PATH_FONT,
                fontWeight: NAME_WEIGHT,
                color: restColor,
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
                transition: "background 0.12s, color 0.12s",
              }
        }
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
          background: editorBg,
          position: "relative",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {note && !isMobile && (
          <NotePath
            parents={parents}
            name={note.title}
            collapsed={!sidebarVisible}
            fullScreen={fullScreen}
            bg={editorBg}
            activeNote={activeNote}
            onOpenNote={openNoteProp}
            onRowPointerDown={onPathRowPointerDown}
          >
            {titleField}
          </NotePath>
        )}
        {note ? (
          <div
            key={activeNote}
            ref={columnRef}
            className="panel-motion"
            style={{
              padding: isMobile
                ? "12px 20px 80px 20px"
                : `${COLUMN_TOP}px ${colPad} 80px ${colPad}`,
              maxWidth: isMobile ? "100%" : sidebarVisible ? 720 : 840,
              marginLeft: isMobile ? 0 : colOffset,
              marginRight: "auto",
              width: "100%",
              // The fade is opacity alone. No transform, ever: a transformed
              // element is the containing block for every `position: fixed`
              // descendant, and the link, code, image and file menus and the
              // table's create badge open fixed at the pointer's clientX/Y. The
              // 4px lift this used to carry offset them by the column's own
              // left edge and scroll, for the fade's 200ms and, because it
              // ended at translateY(0), for ever after (review 2026-09-07 §3.9).
              opacity: editorFadeIn ? 1 : 0,
              // Padding and margin ease too, so hiding the sidebar reads as the
              // column breathing out rather than the page re-laying-out under
              // you. `.sidebar-dragging` kills all transitions, so dragging the
              // divider stays 1:1.
              transition: `${panelTransition("max-width", "padding", "margin-left")}, opacity 0.2s ease`,
              position: "relative",
              // No z-index: as a stacking context the column kept its own
              // toolbar, find bar and popovers under the path band above it
              // (2026-09-15). Without one the band (Z.PATH_ROW) sits over the
              // blocks and the grip and under everything that floats.
            }}
          >
            {isMobile && titleField}

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
                  onClose={() => {
                    setFindBarOpen(false);
                    setFindBarReplace(false);
                  }}
                />
              )}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="region"
                aria-label="Note editor"
                onKeyDown={(e) => {
                  // Cmd+F toggles the find bar; Option+Cmd+F opens it with Replace
                  // (2026-09-24: Cmd+H is Hide on a Mac, VS Code's and Pages' key).
                  // `code`, because Option turns the F into a character on a Mac.
                  const mod = e.ctrlKey || e.metaKey;
                  if (mod && e.code === "KeyF" && !e.shiftKey) {
                    e.preventDefault();
                    if (e.altKey) {
                      setFindBarReplace(true);
                      setFindBarOpen(true);
                    } else {
                      setFindBarReplace(false);
                      setFindBarOpen((v) => !v);
                    }
                    return;
                  }
                  // A selected whole block (divider or image) takes the key first.
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
                    // at paint, and a tag that grew by typing kept its first
                    // letter's (2026-09-20, `#ha` searched `#h`).
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
                // a blinking caret beside a selected picture read as the key
                // having done nothing (2026-09-23).
                style={{ outline: "none", caretColor: selectedBlockId ? "transparent" : undefined }}
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
                          isBlockSelected={selectedBlockId === block.id}
                          onBlockSelect={handleBlockSelect}
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
              {!isMobile && (
                <BlockDragHandle
                  columnRef={columnRef}
                  editorRef={editorRef}
                  startHandleDrag={startHandleDrag}
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

            {/* Right-click menu */}
            {linkCtxMenu && (
              <EditorContextMenu
                anchor={linkCtxMenu.anchor}
                link={linkCtxMenu.linkType}
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
                onClose={dismissCtxMenu}
              />
            )}
          </div>
        ) : (
          !isMobile && (
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
          )
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

    // The selection toolbar is an interaction, not a keystroke, and it must
    // paint now: applying a format re-reads the block (which sets the
    // text-only flag below) and *then* asks the toolbar to re-read its pressed
    // state. Skipped here, the pressed glyph waited for the 300ms text commit
    // to publish, so Bold lit a beat after the press (2026-09-19). The flag is
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
      prev.selectedBlockId === next.selectedBlockId &&
      prev.lightbox === next.lightbox
    );
  },
);

export default EditorArea;
