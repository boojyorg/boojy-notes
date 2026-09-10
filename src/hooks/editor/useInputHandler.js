import { useCallback } from "react";
import { cleanOrphanNodes, placeCaret } from "../../utils/domHelpers";
import { domNodeToMarkdown } from "../../utils/inlineFormatting";
import { paintTypedFormat, typedFormatHit } from "../../utils/typedFormatting";
import { genBlockId } from "../../utils/storage";
import { SLASH_COMMANDS } from "../../constants/data";

// Pre-compiled markdown shortcut patterns (avoid re-creating RegExp on every keystroke)
const S = "[\\s\\u00a0]";
const MD_PATTERNS = [
  { regex: new RegExp(`^###${S}$`), type: "h3" },
  { regex: new RegExp(`^##${S}$`), type: "h2" },
  { regex: new RegExp(`^#${S}$`), type: "h1" },
  { regex: new RegExp(`^[-*]${S}$`), type: "bullet" },
  { regex: new RegExp(`^\\[\\]${S}$`), type: "checkbox" },
  { regex: new RegExp(`^\\[${S}\\]${S}$`), type: "checkbox" },
  { regex: new RegExp(`^1\\.${S}$`), type: "numbered" },
  { regex: new RegExp(`^>${S}$`), type: "blockquote" },
  { regex: /^---$/, type: "spacer" },
  { regex: /^```/, type: "code" },
];

/**
 * Typed triggers for the two blocks the menu makes through its own path (a table
 * needs a shape, an image a picker), so they run the menu's command rather than
 * a second copy of it. `|||` fires at once, like `---`: no hand-typed table ever
 * starts with three pipes (an empty first cell is `| |`). `![]` waits for the
 * space so `![alt](url)`, matched below, can still be typed through it.
 */
const MENU_TRIGGERS = [
  { regex: /^\|\|\|$/, id: "table" },
  { regex: new RegExp(`^!\\[\\]${S}$`), id: "image" },
];

/** An open `[[` not yet closed: the wikilink menu's trigger. */
const WIKILINK_OPEN_RE = /\[\[([^\]]*)$/;
/** A `#` with at least one letter typed: the tag menu's trigger. */
const TAG_OPEN_RE = /(^|[\s(])#([a-zA-Z][\w/-]*)$/;

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
  insertBlockAfter,
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
    const el = blockRefs.current[blocks[blockIndex]?.id];
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
          const lang = text.slice(3).trim();
          const codeBlock = { ...currentBlock, text: "", type: "code", lang };
          const paraBlock = { id: genBlockId(), type: "p", text: "" };
          commitNoteData((prev) => {
            const next = { ...prev };
            const n = { ...next[noteId] };
            const blks = [...n.content.blocks];
            blks.splice(blockIndex, 1, codeBlock, paraBlock);
            n.content = { ...n.content, blocks: blks };
            next[noteId] = n;
            return next;
          });
          focusBlockId.current = paraBlock.id;
          focusCursorPos.current = 0;
          return;
        }

        el.innerHTML = "<br>";
        commitNoteData((prev) => {
          const next = { ...prev };
          const n = { ...next[noteId] };
          const blks = [...n.content.blocks];
          const updated = { ...blks[blockIndex], text: "", type: pat.type };
          if (pat.type === "checkbox") updated.checked = false;
          if (pat.type === "spacer") {
            delete updated.text;
            delete updated.checked;
          }
          if (pat.type !== "checkbox") delete updated.checked;
          blks[blockIndex] = updated;
          n.content = { ...n.content, blocks: blks };
          next[noteId] = n;
          return next;
        });
        if (pat.type === "spacer") {
          insertBlockAfter(noteId, blockIndex, "p", "");
        } else {
          focusBlockId.current = currentBlock.id;
          focusCursorPos.current = 0;
        }
        return;
      }
    }

    for (const trig of MENU_TRIGGERS) {
      if (trig.regex.test(text)) {
        const command = SLASH_COMMANDS.find((c) => c.id === trig.id);
        if (command) executeSlashCommand(noteId, blockIndex, command);
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
