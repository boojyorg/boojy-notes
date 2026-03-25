import { useCallback } from "react";
import { cleanOrphanNodes, placeCaret } from "../../utils/domHelpers";
import { domNodeToMarkdown } from "../../utils/inlineFormatting";
import { genBlockId } from "../../utils/storage";

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
}) {
  // --- Block input handler ---
  const handleBlockInput = useCallback((noteId, blockIndex) => {
    const blocks = noteDataRef.current[noteId].content.blocks;
    const el = blockRefs.current[blocks[blockIndex]?.id];
    if (!el) return;
    const text = domNodeToMarkdown(el)
      .replace(/[\n\r]+$/, "")
      .replace(/^[\n\r]+/, "");
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
        rect: { top: rect.bottom + 4, left: rect.left },
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
    const wikiMatch = text.match(/\[\[([^\]]*)$/);
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
    const tagMatch = text.match(/(^|[\s(])#([a-zA-Z][\w/-]*)$/);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks passed via shared object
  }, []);

  // --- Editor wrapper input handler ---
  const handleEditorInput = useCallback(() => {
    const currentNote = activeNoteRef.current;
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const info = getBlock(sel.anchorNode);
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
    handleBlockInput(currentNote, info.blockIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all deps are stable refs/callbacks
  }, []);

  return { handleBlockInput, handleEditorInput };
}
