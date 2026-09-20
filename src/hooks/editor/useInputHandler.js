import { useCallback } from "react";
import { cleanOrphanNodes, hasOwnField, placeCaret } from "../../utils/domHelpers";
import { domNodeToMarkdown } from "../../utils/inlineFormatting";
import { paintTypedFormat, typedFormatHit } from "../../utils/typedFormatting";
import { genBlockId } from "../../utils/storage";
import { TAG_TAIL_RE } from "../../utils/tags";
import { SLASH_COMMANDS } from "../../constants/data";
import {
  TYPED_DIVIDER_RE,
  TYPED_FENCE_RE,
  TYPED_TABLE_RE,
  typedFenceLang,
  typedTableColumns,
} from "../../utils/blockTriggers";

// Pre-compiled markdown shortcut patterns (avoid re-creating RegExp on every keystroke)
const S = "[\\s\\u00a0]";
const MD_PATTERNS = [
  { regex: new RegExp(`^######${S}$`), type: "h6" },
  { regex: new RegExp(`^#####${S}$`), type: "h5" },
  { regex: new RegExp(`^####${S}$`), type: "h4" },
  { regex: new RegExp(`^###${S}$`), type: "h3" },
  { regex: new RegExp(`^##${S}$`), type: "h2" },
  { regex: new RegExp(`^#${S}$`), type: "h1" },
  { regex: new RegExp(`^[-*]${S}$`), type: "bullet" },
  { regex: new RegExp(`^\\[\\]${S}$`), type: "checkbox" },
  { regex: new RegExp(`^\\[${S}\\]${S}$`), type: "checkbox" },
  { regex: new RegExp(`^1\\.${S}$`), type: "numbered" },
  { regex: new RegExp(`^>${S}$`), type: "blockquote" },
  // Every marker waits for its space, these two included (2026-09-19): a
  // marker that fires on its last character can never be given an argument,
  // which is what kept ```js from opening a JavaScript block and `||||` from
  // asking for a third column, and what made all three untypable as text.
  { regex: TYPED_DIVIDER_RE, type: "spacer" },
  { regex: TYPED_FENCE_RE, type: "code" },
];

/**
 * Typed triggers for the two blocks the menu makes through its own path (a
 * table needs a shape, an image a picker), so they run the menu's command
 * rather than a second copy of it. Both wait for the space: the table's pipes
 * are the row it draws, and `![]` waits so `![alt](url)`, matched below, can
 * still be typed through it.
 */
const MENU_TRIGGERS = [
  { regex: TYPED_TABLE_RE, id: "table" },
  { regex: new RegExp(`^!\\[\\]${S}$`), id: "image" },
];

/** An open `[[` not yet closed: the wikilink menu's trigger. */
const WIKILINK_OPEN_RE = /\[\[([^\]]*)$/;
/** A `#` with at least one letter typed: the tag menu's trigger (the one tag grammar). */
const TAG_OPEN_RE = TAG_TAIL_RE;

/** Whether `text` is about to open or filter a suggestion menu under the caret. */
const menuWouldOpen = (text) =>
  text.trim().startsWith("/") || WIKILINK_OPEN_RE.test(text) || TAG_OPEN_RE.test(text);

/** A block's text as the editor commits it: the DOM's Markdown, edge newlines trimmed. */
const trimEdgeNewlines = (text) => text.replace(/[\n\r]+$/, "").replace(/^[\n\r]+/, "");

export function useInputHandler({
  noteDataRef,
  activeNoteRef,
  blockRefs,
  editorRef,
  commitNoteData,
  focusBlockId,
  focusCursorPos,
  slashMenuRef,
  setSlashMenu,
  wikilinkMenuRef,
  setWikilinkMenu,
  tagMenuRef,
  setTagMenu,
  syncGeneration,
  updateBlockText,
  openCodeBlock,
  openDivider,
  getBlock,
  executeSlashCommand,
  noteTitleSetRef,
}) {
  // --- Block input handler ---
  // `native` is the InputEvent behind the React event, when the caller has one:
  // the typed-formatting trigger reads its inputType and data. The keyboard
  // handler and the rAF fallback below pass nothing and never trigger it.
  const handleBlockInput = useCallback((noteId, blockIndex, native = null) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const block = blocks[blockIndex];
    // A block that keeps its own field owns its edits: a callout's body and a
    // code block's textarea commit through the block, at the text grain. This
    // path would read the whole wrapper — for a callout, its title and body as
    // one run — and commit that as the block's text. Until 2026-09-19 the ref
    // lookup below said so by accident, because these roots registered
    // nothing; they register now, for the gutter grip, so the rule is stated.
    if (hasOwnField(block)) return;
    const el = blockRefs.current[block?.id];
    if (!el) return;
    let text = trimEdgeNewlines(domNodeToMarkdown(el));

    // Typed inline formatting: the closing marker of `**bold**` and its kin
    // repaints the block and parks the caret after the new element, before
    // the commit and before the bare-URL check below (the paint already
    // styles a URL, so that check finds nothing to bump and repaint). An
    // underscore form is committed in the star form only once it is painted;
    // a paint that could not find its element leaves the literal text alone.
    const hit = native ? typedFormatHit(el, native) : null;
    if (hit && !menuWouldOpen(text)) {
      const painted = hit.rewritten ? trimEdgeNewlines(hit.newText) : text;
      if (paintTypedFormat(el, hit, painted, noteTitleSetRef?.current)) text = painted;
    }
    updateBlockText(noteId, blockIndex, text);

    const currentBlock = noteDataRef.current[noteId].content.blocks[blockIndex];
    for (const pat of MD_PATTERNS) {
      if (pat.regex.test(text)) {
        // Code block auto-conversion
        if (pat.type === "code") {
          el.innerHTML = "<br>";
          // The info string is kept as it was typed — ```js stays `js` in the
          // file, and the corner reads JavaScript (`canonicalLang`). The block
          // owns the next keystroke: the caret goes into its own field, not
          // the paragraph under it, exactly as the slash menu's Code does.
          openCodeBlock(noteId, blockIndex, typedFenceLang(text) ?? "");
          return;
        }

        el.innerHTML = "<br>";
        // A divider holds no text and takes no caret, so it ends in a fresh
        // paragraph; `openDivider` is that operation, shared with the Enter
        // that opens one.
        if (pat.type === "spacer") {
          openDivider(noteId, blockIndex);
          return;
        }
        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          const updated = { ...blks[blockIndex], text: "", type: pat.type };
          if (pat.type === "checkbox") updated.checked = false;
          if (pat.type !== "checkbox") delete updated.checked;
          blks[blockIndex] = updated;
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        focusBlockId.current = currentBlock.id;
        focusCursorPos.current = 0;
        return;
      }
    }

    for (const trig of MENU_TRIGGERS) {
      if (trig.regex.test(text)) {
        const command = SLASH_COMMANDS.find((c) => c.id === trig.id);
        // The pipes are the row being drawn: `|||` is two columns, `||||`
        // three. Nothing else carries an argument here.
        if (command)
          executeSlashCommand(noteId, blockIndex, command, {
            columns: typedTableColumns(text) ?? undefined,
          });
        return;
      }
    }

    // Auto-convert markdown image syntax: ![alt](url)
    const imgMatch = text.match(/^!\[([^\]]*)\]\((\S+)\)$/);
    if (imgMatch) {
      el.innerHTML = "<br>";
      const imgBlock = {
        ...currentBlock,
        text: "",
        type: "image",
        src: imgMatch[2],
        alt: imgMatch[1],
        width: 0,
      };
      const paraBlock = { id: genBlockId(), type: "p", text: "" };
      commitNoteData((prev) => {
        const next = { ...prev };
        const n = { ...next[noteId] };
        const blks = [...n.content.blocks];
        blks.splice(blockIndex, 1, imgBlock, paraBlock);
        n.content = { ...n.content, blocks: blks };
        next[noteId] = n;
        return next;
      });
      focusBlockId.current = paraBlock.id;
      focusCursorPos.current = 0;
      return;
    }

    const trimmed = text.trim();
    if (trimmed === "/") {
      const rect = el.getBoundingClientRect();
      setSlashMenu({
        noteId,
        blockIndex,
        filter: "",
        selectedIndex: 0,
        // Full block rect: SlashMenu opens below it or flips above it when
        // the viewport runs out (useMenuPosition), without covering the line.
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      });
    } else if (slashMenuRef.current && slashMenuRef.current.blockIndex === blockIndex) {
      if (trimmed.startsWith("/")) {
        setSlashMenu((prev) =>
          prev ? { ...prev, filter: trimmed.slice(1), selectedIndex: 0 } : null,
        );
      } else {
        setSlashMenu(null);
      }
    }

    // Wikilink menu detection: open [[ not yet closed
    const wikiMatch = text.match(WIKILINK_OPEN_RE);
    if (wikiMatch) {
      const rect = el.getBoundingClientRect();
      setWikilinkMenu({
        noteId,
        blockIndex,
        filter: wikiMatch[1],
        rect: { top: rect.bottom + 4, left: rect.left },
      });
    } else if (wikilinkMenuRef.current && wikilinkMenuRef.current.blockIndex === blockIndex) {
      setWikilinkMenu(null);
    }

    // Tag autocomplete detection: open # with at least one letter typed
    const tagMatch = text.match(TAG_OPEN_RE);
    if (tagMatch) {
      const rect = el.getBoundingClientRect();
      setTagMenu({
        noteId,
        blockIndex,
        filter: tagMatch[2],
        rect: { top: rect.bottom + 4, left: rect.left },
      });
    } else if (tagMenuRef.current && tagMenuRef.current.blockIndex === blockIndex) {
      setTagMenu(null);
    }

    // Auto-convert bare URLs: if text contains a URL followed by a space, re-render to style it
    if (/https?:\/\/\S+\s$/.test(text) || /https?:\/\/\S+\s/.test(text)) {
      // Check if the DOM already has it as a link (avoid re-render loop)
      const hasUnstyledUrl = !el.querySelector("a.external-link");
      if (hasUnstyledUrl && /https?:\/\//.test(text)) {
        syncGeneration.current++;
      }
    }
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks passed via shared object
  }, []);

  // --- Editor wrapper input handler ---
  const handleEditorInput = useCallback((e) => {
    const currentNote = activeNoteRef.current;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const info = getBlock(sel.anchorNode);
    // React's synthetic event wraps the native InputEvent; a bare native
    // event (a test, a direct listener) is taken as it is.
    const native =
      e?.nativeEvent ?? (typeof InputEvent !== "undefined" && e instanceof InputEvent ? e : null);
    if (!info) {
      requestAnimationFrame(() => {
        const freshSel = window.getSelection();
        if (!freshSel.rangeCount) return;
        const freshInfo = getBlock(freshSel.anchorNode);
        if (freshInfo) {
          handleBlockInput(currentNote, freshInfo.blockIndex);
          return;
        }
        cleanOrphanNodes(editorRef.current);
        const blocks = noteDataRef.current[currentNote]?.content?.blocks;
        if (!blocks || blocks.length === 0) return;
        const lastBlock = blocks[blocks.length - 1];
        const el = blockRefs.current[lastBlock.id];
        if (el?.isConnected) placeCaret(el, (lastBlock.text || "").length);
      });
      return;
    }
    handleBlockInput(currentNote, info.blockIndex, native);
    // Deps deliberately not exhaustive: all deps are stable refs/callbacks
  }, []);

  return { handleBlockInput, handleEditorInput };
}
