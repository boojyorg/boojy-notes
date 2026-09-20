import { useState, useRef, useEffect, useLayoutEffect, useCallback, memo } from "react";
import Prism from "prismjs";
import { latestBlock, useOwnedField } from "../hooks/useOwnedField";
import CodeLangMenu from "./CodeLangMenu";
import { canonicalLang, sameLang } from "../utils/codeLanguage";
import { ChevronDownIcon } from "./Icons";
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
 * language added after it (2026-09-19; before, the order was roughly by how
 * often each is used, which had to be re-judged on each addition). Each is a
 * Prism grammar imported above; adding a row means adding its grammar.
 */
const LANGUAGES = [
  { value: "", label: "Plain" },
  { value: "bash", label: "Bash" },
  { value: "css", label: "CSS" },
  { value: "html", label: "HTML" },
  { value: "javascript", label: "JavaScript" },
  { value: "json", label: "JSON" },
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

// Display full names for the bottom-right badge
const LANG_DISPLAY = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  bash: "Bash",
  sql: "SQL",
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
  const [hovered, setHovered] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  // The language menu's anchor: the label's rect while it is open, null otherwise.
  const [langMenu, setLangMenu] = useState(null);
  const textareaRef = useRef(null);
  const overlayRef = useRef(null);
  const overlayCodeRef = useRef(null);
  const langLabelRef = useRef(null);

  // The fence's text exactly as the file holds it, blank first and last
  // lines included. Stripping them here made Enter at the end of the block
  // a no-op (the newline was written to state and stripped back by the next
  // render) and lost a fence's own blank lines at the first keystroke
  // (review 2026-09-07, §1.3).
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
  const commit = useCallback(
    (value) => {
      onUpdateCode(noteId, blockIndex, value);
      paintOverlay(value);
      autoResize();
      syncScroll();
    },
    [noteId, blockIndex, onUpdateCode, paintOverlay, autoResize, syncScroll],
  );

  const handleInput = useCallback((e) => commit(e.target.value), [commit]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e) => {
      // Undo and redo are the app's, at the text grain the field commits at
      // (useAppKeyboard, on the window); held here they were the textarea's
      // own, one character at a time and blind to state.
      const mod = e.metaKey || e.ctrlKey;
      // Lower-cased: with Shift held the key is "Z", and the guard missed
      // it, so redo was stopped here and never reached the shell (2026-09-20).
      const k = e.key.toLowerCase();
      if (mod && (k === "z" || k === "y")) return;
      e.stopPropagation(); // Prevent parent editor from intercepting
      const ta = textareaRef.current;
      if (!ta) return;

      // Tab — indent (supports multi-line selection)
      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
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
        e.stopPropagation();
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

      // Enter — new line with auto-indent
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
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
        e.stopPropagation();
        if (onBlockNav) onBlockNav(blockIndex, "next");
        return;
      }

      // ArrowUp at first line
      if (e.key === "ArrowUp") {
        const beforeCursor = ta.value.substring(0, ta.selectionStart);
        if (!beforeCursor.includes("\n")) {
          e.preventDefault();
          e.stopPropagation();
          if (onBlockNav) onBlockNav(blockIndex, "prev");
          return;
        }
      }

      // ArrowDown at last line
      if (e.key === "ArrowDown") {
        const afterCursor = ta.value.substring(ta.selectionEnd);
        if (!afterCursor.includes("\n")) {
          e.preventDefault();
          e.stopPropagation();
          if (onBlockNav) onBlockNav(blockIndex, "next");
          return;
        }
      }

      // Backspace on empty — delete block
      if (e.key === "Backspace" && ta.value === "") {
        e.preventDefault();
        e.stopPropagation();
        if (onDelete) onDelete(blockIndex);
        return;
      }
    },
    [blockIndex, commit, onBlockNav, onDelete],
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
    setCtxMenu({ top: e.clientY, left: e.clientX });
  }, []);

  // Close context menu
  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e) => {
      if (e.key === "Escape") closeCtxMenu();
    };
    const clickHandler = () => closeCtxMenu();
    window.addEventListener("keydown", handler);
    window.addEventListener("mousedown", clickHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("mousedown", clickHandler);
    };
  }, [ctxMenu, closeCtxMenu]);

  /** Open the language menu under the label, wherever it was asked for. */
  const openLangMenu = useCallback(() => {
    const rect = langLabelRef.current?.getBoundingClientRect();
    if (!rect) return;
    setLangMenu({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
  }, []);
  const closeLangMenu = useCallback(() => setLangMenu(null), []);

  const handleLangChange = useCallback(
    (newLang) => {
      // Choosing the language the block already has writes nothing: a file
      // that says ```js keeps saying `js` when JavaScript is picked again.
      if (sameLang(newLang, lang)) return;
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
  const displayLabel = LANG_DISPLAY[canonical] || canonical;

  return (
    <div
      className="code-block"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={handleContextMenu}
      onInput={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      <div className="code-body">
        <textarea
          ref={textareaRef}
          className="code-textarea"
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <pre ref={overlayRef} className="code-overlay" aria-hidden="true">
          <code ref={overlayCodeRef} />
        </pre>
      </div>

      {/* Copy button — top right, hover only */}
      <div className="code-copy-wrapper" style={{ opacity: hovered ? 1 : 0 }}>
        <button
          className="code-copy-btn"
          onClick={handleCopy}
          onMouseDown={(e) => e.preventDefault()}
          title="Copy"
        >
          {copied ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8.5L6.5 12L13 4"
                stroke="#4ade80"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="5.5"
                y="5.5"
                width="7"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.3"
              />
              <path
                d="M10.5 5.5V3.5C10.5 2.67 9.83 2 9 2H4C3.17 2 2.5 2.67 2.5 3.5V10C2.5 10.83 3.17 11.5 4 11.5H5.5"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Language label — bottom right, click to change. The chevron is the
          only thing that says the label is a control, and it shows on hover or
          while the menu is open: the block is quiet at rest, as the gutter grip
          and the row controls are. */}
      <div className="code-lang-anchor">
        <button
          type="button"
          ref={langLabelRef}
          className={`code-lang${langMenu ? " code-lang-open" : ""}`}
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
          {displayLabel || "Plain"}
          <span className="code-lang-chevron" aria-hidden="true">
            <ChevronDownIcon size={12} />
          </span>
        </button>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CodeCtxMenu
          position={ctxMenu}
          onCopy={handleCopy}
          onChangeLang={handleChangeLangFromMenu}
          onDelete={handleDeleteBlock}
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

/* ---- Context menu, position: fixed inside the column (not a portal) ---- */
/**
 * The code block's own menu: Copy code, Change language, Delete block. The
 * language list used to live here a second time, in a hover submenu with its
 * own viewport clamping (2026-09-19): one list, in `CodeLangMenu`, which this
 * row now opens under the block's label.
 */
function CodeCtxMenu({ position, onCopy, onChangeLang, onDelete }) {
  const menuRef = useRef(null);

  // Adjust position so menu stays within viewport
  const [pos, setPos] = useState(position);
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { top, left } = position;
    if (rect.bottom > window.innerHeight) top = window.innerHeight - rect.height - 8;
    if (rect.right > window.innerWidth) left = window.innerWidth - rect.width - 8;
    if (top < 0) top = 8;
    if (left < 0) left = 8;
    setPos({ top, left });
  }, [position]);

  return (
    <div
      ref={menuRef}
      className="code-ctx-menu"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className="code-ctx-item" onClick={onCopy}>
        Copy code
      </button>
      <button className="code-ctx-item" onClick={onChangeLang}>
        Change language
      </button>
      <div className="code-ctx-sep" />
      <button className="code-ctx-item code-ctx-danger" onClick={onDelete}>
        Delete block
      </button>
    </div>
  );
}
