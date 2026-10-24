import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo } from "react";
import Prism from "prismjs";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import CodeLangMenu from "./CodeLangMenu";
import { canonicalLang, sameLang } from "../utils/codeLanguage";
import Menu, { pointAnchor } from "./Menu";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  ExpandIcon,
  SlashCommandIcon,
  SourceViewIcon,
  TrashIcon,
} from "./Icons";
import DiagramView from "./DiagramView";
import DiagramLightbox from "./DiagramLightbox";
import { Tooltip, useTooltip } from "./Tooltip";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markup";

/**
 * The languages offered, Plain then alphabetical: one editorial exception,
 * because Plain is the absence of a language, and a mechanical rule for every
 * language added after it. Each is a
 * Prism grammar imported above; adding a row means adding its grammar.
 */
const LANGUAGES = [
  { value: "", label: "Plain" },
  { value: "bash", label: "Bash" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
  { value: "mermaid", label: "Mermaid" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "typescript", label: "TypeScript" },
];

// Map common aliases to Prism grammar keys
const LANG_ALIAS = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  htm: "markup",
  html: "markup",
  xml: "markup",
  svg: "markup",
};

/**
 * Mermaid's source in the editor's syntax colours: a few token kinds, enough
 * to read a flowchart by (Prism has no grammar of its own for it).
 */
Prism.languages.mermaid = {
  comment: /%%.*/,
  keyword:
    /\b(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|mindmap|journey|gitGraph|timeline|subgraph|end|participant|actor|title|section|note|loop|alt|else)\b/,
  constant: /\b(?:TD|TB|LR|RL|BT)\b/,
  string: /\[[^\]\n]*\]|\([^)\n]*\)|\{[^}\n]*\}|\|[^|\n]*\|/,
  operator: /-\.->|==>|-->>|->>|-->|---|--|->/,
};

function resolveGrammar(lang) {
  const key = LANG_ALIAS[lang] || lang;
  return Prism.languages[key] ? { grammar: Prism.languages[key], name: key } : null;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(text, langKey) {
  const resolved = resolveGrammar(langKey);
  if (resolved) {
    return Prism.highlight(text, resolved.grammar, resolved.name);
  }
  return escapeHtml(text);
}

// The highlight overlay: each line wrapped in a span.
function overlayHtml(text, langKey) {
  return highlight(text, langKey)
    .split("\n")
    .map((lineHtml) => `<span class="code-line">${lineHtml}</span>`)
    .join("");
}

export default memo(function CodeBlock({
  block,
  noteId,
  blockIndex,
  syncGen,
  noteDataRef,
  onUpdateCode,
  onUpdateLang,
  onBlockNav,
  onDelete,
}) {
  const [copied, setCopied] = useState(false);
  // A ```mermaid block is a diagram: drawn, its code joined above while open.
  const diagram = canonicalLang(block.lang) === "mermaid";
  // Open until `</> Code` (or Shift+Enter) closes it; a new, empty one starts open.
  const [codeOpen, setCodeOpen] = useState(() => !(block.text || "").trim());
  // What the field holds while it is ahead of the note's ref: the drawing follows it.
  const [draft, setDraft] = useState(null);
  const blockRef = useRef(null);
  const codeTip = useTooltip();
  const codeBtnRef = useRef(null);
  // A diagram's drawing as shown, and whether it is open full size.
  const [drawing, setDrawing] = useState("");
  const [viewing, setViewing] = useState(false);
  const viewTip = useTooltip();
  const viewBtnRef = useRef(null);
  const copyTip = useTooltip();
  const copyBtnRef = useRef(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  // The language menu's anchor: the label's rect while it is open, null otherwise.
  const [langMenu, setLangMenu] = useState(null);
  const textareaRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayCodeRef = useRef(null);
  const langLabelRef = useRef(null);

  // The fence's text exactly as the file holds it, blank first and last
  // lines included. Stripping them would make Enter at the end of the block
  // a no-op and lose a fence's own blank lines at the first keystroke.
  const code = block.text || "";
  const lang = block.lang || "";

  // Sync overlay scroll with textarea
  const syncScroll = useCallback(() => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  // Auto-resize textarea
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }, []);

  const paintOverlay = useCallback(
    (text) => {
      if (overlayCodeRef.current) overlayCodeRef.current.innerHTML = overlayHtml(text, lang);
    },
    [lang],
  );

  // The textarea is uncontrolled: it is the browser's while the user types
  // into it, and it commits what it holds on every input at the text grain
  // (useOwnedField). A controlled value would have held it to the state
  // the commit debounce is still behind.
  useOwnedField(textareaRef, {
    text: code,
    syncGen,
    latest: () => latestBlock(noteDataRef, noteId, block)?.text || "",
    read: (el) => el.value,
    paint: (el, text) => {
      const focused = document.activeElement === el;
      const at = focused ? Math.min(el.selectionStart, text.length) : 0;
      el.value = text;
      if (focused) el.selectionStart = el.selectionEnd = at;
      paintOverlay(text);
      autoResize();
      syncScroll();
    },
  });

  // A language change re-highlights what the field holds.
  useLayoutEffect(() => {
    if (textareaRef.current) paintOverlay(textareaRef.current.value);
  }, [paintOverlay]);

  // What the field holds now goes to state, the overlay and the box.
  // Every commit (a keystroke, Enter's indent, Tab) reaches a diagram's drawing too.
  const commit = useCallback(
    (value) => {
      onUpdateCode(noteId, blockIndex, value);
      paintOverlay(value);
      autoResize();
      syncScroll();
      if (diagram) setDraft(value);
    },
    [noteId, blockIndex, onUpdateCode, paintOverlay, autoResize, syncScroll, diagram],
  );

  const handleInput = useCallback((e) => commit(e.target.value), [commit]);

  // An undo, a redo or an outside change: the note's text is the drawing's again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the generation is the signal
  useEffect(() => setDraft(null), [syncGen]);
  // A block that stops being a diagram stops keeping one: edited as code, the
  // note's text is what it draws when it is a diagram again.
  useEffect(() => {
    if (!diagram) setDraft(null);
  }, [diagram]);

  /** The diagram's code, opened with the caret at its end. */
  const openCode = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus({ preventScroll: true });
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }, []);
  /** The code closed, the editor keeping the keys. */
  const closeCode = useCallback(() => {
    blockRef.current?.closest("[data-editor]")?.focus({ preventScroll: true });
    setCodeOpen(false);
  }, []);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e) => {
      // Undo and redo are the app's, at the text grain the field commits at
      // (useAppKeyboard, on the window); held here they were the textarea's
      // own, one character at a time and blind to state.
      const mod = e.metaKey || e.ctrlKey;
      // Lower-cased: with Shift held the key is "Z", and redo must still
      // reach the shell.
      const k = e.key.toLowerCase();
      if (mod && (k === "z" || k === "y")) return;
      e.stopPropagation(); // Prevent parent editor from intercepting
      const ta = textareaRef.current;
      if (!ta) return;

      // Tab — indent (supports multi-line selection)
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;

        if (start === end) {
          // Single cursor: insert 4 spaces
          const newVal = val.substring(0, start) + "    " + val.substring(end);
          ta.value = newVal;
          ta.selectionStart = ta.selectionEnd = start + 4;
        } else {
          // Multi-line: indent each selected line
          const firstLineStart = val.lastIndexOf("\n", start - 1) + 1;
          const lines = val.substring(firstLineStart, end).split("\n");
          const indented = lines.map((l) => "    " + l).join("\n");
          const newVal = val.substring(0, firstLineStart) + indented + val.substring(end);
          ta.value = newVal;
          ta.selectionStart = firstLineStart;
          ta.selectionEnd = firstLineStart + indented.length;
        }
        commit(ta.value);
        return;
      }

      // Shift+Tab — dedent (supports multi-line selection)
      if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;
        const firstLineStart = val.lastIndexOf("\n", start - 1) + 1;
        const lines = val.substring(firstLineStart, end).split("\n");
        const dedented = lines.map((l) => (l.startsWith("    ") ? l.substring(4) : l)).join("\n");
        const newVal = val.substring(0, firstLineStart) + dedented + val.substring(end);
        ta.value = newVal;
        ta.selectionStart = firstLineStart;
        ta.selectionEnd = firstLineStart + dedented.length;
        commit(ta.value);
        return;
      }

      // Shift+Enter finishes a diagram's code, as it finishes a formula: it
      // closes and the caret moves on.
      if (diagram && e.key === "Enter" && e.shiftKey) {
        e.preventDefault();
        // The field is about to be folded away: the editor takes the keys first.
        closeCode();
        if (onBlockNav) onBlockNav(blockIndex, "next");
        return;
      }

      // Enter — new line with auto-indent
      if (e.key === "Enter") {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const val = ta.value;
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const line = val.substring(lineStart, start);
        const indent = line.match(/^(\s*)/)[1];
        const insert = "\n" + indent;
        const newVal = val.substring(0, start) + insert + val.substring(end);
        ta.value = newVal;
        ta.selectionStart = ta.selectionEnd = start + insert.length;
        commit(newVal);
        return;
      }

      // Escape — exit code block, focus next block
      if (e.key === "Escape") {
        e.preventDefault();
        if (onBlockNav) onBlockNav(blockIndex, "next");
        return;
      }

      // ArrowUp at first line
      if (e.key === "ArrowUp") {
        const beforeCursor = ta.value.substring(0, ta.selectionStart);
        if (!beforeCursor.includes("\n")) {
          e.preventDefault();
          if (onBlockNav) onBlockNav(blockIndex, "prev");
          return;
        }
      }

      // ArrowDown at last line
      if (e.key === "ArrowDown") {
        const afterCursor = ta.value.substring(ta.selectionEnd);
        if (!afterCursor.includes("\n")) {
          e.preventDefault();
          if (onBlockNav) onBlockNav(blockIndex, "next");
          return;
        }
      }

      // Backspace on empty — delete block
      if (e.key === "Backspace" && ta.value === "") {
        e.preventDefault();
        if (onDelete) onDelete(blockIndex);
        return;
      }
    },
    [blockIndex, commit, onBlockNav, onDelete, diagram, closeCode],
  );

  // Copy to clipboard
  const handleCopy = useCallback(
    async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      try {
        await navigator.clipboard.writeText(textareaRef.current?.value ?? code);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {}
    },
    [code],
  );

  // Right-click context menu
  const handleContextMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(pointAnchor(e));
  }, []);
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  /** Open the language menu under the label, wherever it was asked for. */
  // Under the language button, its right edge flush with the toolbar's end
  // (the copy button): the toolbar is one group pinned to the block's edge.
  const openLangMenu = useCallback(() => {
    const rect = langLabelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const end = langLabelRef.current.parentElement?.getBoundingClientRect().right ?? rect.right;
    setLangMenu({ top: rect.top, bottom: rect.bottom, left: rect.left, right: end });
  }, []);
  const closeLangMenu = useCallback(() => setLangMenu(null), []);

  const handleLangChange = useCallback(
    (newLang) => {
      // Choosing the language the block already has writes nothing: a file
      // that says ```js keeps saying `js` when JavaScript is picked again.
      if (sameLang(newLang, lang)) return;
      // A code block that becomes a diagram opens, its code where it was.
      if (canonicalLang(newLang) === "mermaid") setCodeOpen(true);
      onUpdateLang(noteId, blockIndex, newLang);
    },
    [noteId, blockIndex, onUpdateLang, lang],
  );

  /** The context menu's own row: it closes and hands the menu to the label. */
  const handleChangeLangFromMenu = useCallback(() => {
    closeCtxMenu();
    openLangMenu();
  }, [closeCtxMenu, openLangMenu]);

  const handleDeleteBlock = useCallback(() => {
    closeCtxMenu();
    if (onDelete) onDelete(blockIndex);
  }, [blockIndex, onDelete, closeCtxMenu]);

  // What the corner reads and what the menu ticks: the language the info
  // string names, not the string itself. A file's ```js is JavaScript here and
  // stays `js` on disk; a word the app does not know reads as it was written.
  const canonical = canonicalLang(lang);
  // Plain for no language, as the menu names it.
  const displayLabel = LANGUAGES.find((l) => l.value === canonical)?.label || canonical;

  const codeField = (
    <div className="code-body">
      <textarea
        ref={textareaRef}
        className="code-textarea"
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        // Arrowing or tabbing into a diagram's code opens it, as a press does.
        onFocus={() => diagram && setCodeOpen(true)}
        onScroll={syncScroll}
        // A new diagram's example: a hint, never written to the file.
        placeholder={diagram ? "flowchart LR\n  A[Start] --> B[Next step]" : undefined}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
      />
      <pre ref={overlayRef} className="code-overlay" aria-hidden="true">
        <code ref={overlayCodeRef} />
      </pre>
    </div>
  );

  // One toolbar on every code block, top right, on hover or while the block
  // has focus (the way a tap or the keyboard reaches it): what it is (the
  // language), then what it does (icons), copy always last. A diagram adds
  // `</>` between them, lit while its code is open as the header's is for
  // the Markdown view, and, while it has a drawing, View full size (an
  // image's view; a press on the drawing still opens its code).
  const tools = (
    <div className={`code-tools${langMenu ? " code-tools-held" : ""}`}>
      <button
        type="button"
        ref={langLabelRef}
        className={`code-tool code-lang${langMenu ? " code-lang-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={!!langMenu}
        aria-label="Code language"
        onClick={(e) => {
          e.stopPropagation();
          if (langMenu) closeLangMenu();
          else openLangMenu();
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {displayLabel}
        <ChevronDownIcon size={12} />
      </button>
      {diagram && (
        <button
          ref={codeBtnRef}
          type="button"
          className="code-tool code-show"
          aria-label={codeOpen ? "Hide code" : "Show code"}
          aria-pressed={codeOpen}
          {...codeTip.handlers}
          onMouseDown={(e) => {
            e.preventDefault();
            codeTip.handlers.onMouseDown();
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (codeOpen) closeCode();
            else openCode();
          }}
        >
          <SourceViewIcon />
        </button>
      )}
      {diagram && codeTip.shown && (
        <Tooltip label={codeOpen ? "Hide code" : "Show code"} anchor={codeBtnRef.current} />
      )}
      {diagram && drawing && (
        <button
          ref={viewBtnRef}
          type="button"
          className="code-tool code-view"
          aria-label="View full size"
          {...viewTip.handlers}
          onMouseDown={(e) => {
            e.preventDefault();
            viewTip.handlers.onMouseDown();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setViewing(true);
          }}
        >
          <ExpandIcon />
        </button>
      )}
      {diagram && drawing && viewTip.shown && (
        <Tooltip label="View full size" anchor={viewBtnRef.current} />
      )}
      <button
        type="button"
        ref={copyBtnRef}
        className={`code-tool code-copy-btn${copied ? " code-copied" : ""}`}
        aria-label="Copy code"
        {...copyTip.handlers}
        onMouseDown={(e) => {
          e.preventDefault();
          copyTip.handlers.onMouseDown();
        }}
        onClick={handleCopy}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      {copyTip.shown && <Tooltip label="Copy" anchor={copyBtnRef.current} />}
    </div>
  );

  return (
    <div
      ref={blockRef}
      className={`code-block${diagram ? " diagram-block" : ""}`}
      onContextMenu={handleContextMenu}
      onInput={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {tools}
      {/* The code, in one place whatever the language: a change of language
          must never remount the field (a fresh one is empty, and the next
          keystroke would save over the code). For a diagram it sits above
          the drawing, open until its \`</>\` closes it. */}
      <div
        className={diagram ? "diagram-code" : undefined}
        data-open={(diagram && codeOpen) || undefined}
      >
        <div className={diagram ? "diagram-code-inner" : undefined}>{codeField}</div>
      </div>
      {diagram && (
        <>
          {/* The drawing; a press on it opens its code. */}
          <div
            className="diagram-view"
            onMouseDown={(e) => {
              if (e.button === 0) e.preventDefault();
            }}
            onClick={openCode}
          >
            <DiagramView
              source={draft ?? latestBlock(noteDataRef, noteId, block)?.text ?? code}
              emptyText={codeOpen ? "Your diagram appears here" : "Empty diagram"}
              onDrawing={setDrawing}
            />
          </div>
          {viewing && drawing && (
            <DiagramLightbox svg={drawing} onClose={() => setViewing(false)} />
          )}
        </>
      )}

      {/* Context menu: Copy code, Change language (CodeLangMenu's list, under the label), Delete block */}
      {ctxMenu && (
        <Menu
          label="Code block options"
          idPrefix="code-menu-item"
          className="code-ctx-menu"
          anchor={ctxMenu}
          minWidth={180}
          onClose={closeCtxMenu}
          items={[
            {
              label: "Copy code",
              icon: <CopyIcon />,
              action: () => {
                closeCtxMenu();
                handleCopy();
              },
            },
            {
              label: "Change language",
              icon: <SlashCommandIcon name="code" />,
              action: handleChangeLangFromMenu,
            },
            {
              label: "Delete block",
              icon: <TrashIcon />,
              action: handleDeleteBlock,
              danger: true,
              rule: true,
            },
          ]}
        />
      )}

      {/* Language menu — the app's menu grammar, from the label or the ··· */}
      {langMenu && (
        <CodeLangMenu
          anchor={langMenu}
          languages={LANGUAGES}
          lang={canonical}
          onSelect={handleLangChange}
          onClose={closeLangMenu}
        />
      )}
    </div>
  );
});
