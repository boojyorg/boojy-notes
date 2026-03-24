import { useState, useRef, useEffect, useCallback, memo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-markup";

const LANGUAGES = [
  { value: "", label: "Plain" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
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

export default memo(function CodeBlock({
  block,
  noteId,
  blockIndex,
  onUpdateCode,
  onUpdateLang,
  onBlockNav,
  onDelete,
}) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [langDropdown, setLangDropdown] = useState(false);
  const textareaRef = useRef(null);
  const overlayRef = useRef(null);
  const langDropdownRef = useRef(null);

  const code = (block.text || "").replace(/^\n+|\n+$/g, "");
  const lang = block.lang || "";

  const highlight = useCallback((text, langKey) => {
    const resolved = resolveGrammar(langKey);
    if (resolved) {
      return Prism.highlight(text, resolved.grammar, resolved.name);
    }
    return escapeHtml(text);
  }, []);

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

  useEffect(() => {
    autoResize();
  }, [code, autoResize]);

  // Handle input changes
  const handleInput = useCallback(
    (e) => {
      onUpdateCode(noteId, blockIndex, e.target.value);
      autoResize();
      syncScroll();
    },
    [noteId, blockIndex, onUpdateCode, autoResize, syncScroll],
  );

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e) => {
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
        onUpdateCode(noteId, blockIndex, ta.value);
        autoResize();
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
        onUpdateCode(noteId, blockIndex, ta.value);
        autoResize();
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
        onUpdateCode(noteId, blockIndex, newVal);
        autoResize();
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
    [noteId, blockIndex, onUpdateCode, onBlockNav, onDelete, autoResize],
  );

  // Copy to clipboard
  const handleCopy = useCallback(
    async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      try {
        await navigator.clipboard.writeText(code);
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

  // Close lang dropdown on outside click / Escape
  useEffect(() => {
    if (!langDropdown) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setLangDropdown(false);
    };
    const handleClick = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setLangDropdown(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [langDropdown]);

  const handleLangChange = useCallback(
    (newLang) => {
      onUpdateLang(noteId, blockIndex, newLang);
      closeCtxMenu();
    },
    [noteId, blockIndex, onUpdateLang, closeCtxMenu],
  );

  const handleLangDropdownSelect = useCallback(
    (newLang) => {
      onUpdateLang(noteId, blockIndex, newLang);
      setLangDropdown(false);
    },
    [noteId, blockIndex, onUpdateLang],
  );

  const handleDeleteBlock = useCallback(() => {
    closeCtxMenu();
    if (onDelete) onDelete(blockIndex);
  }, [blockIndex, onDelete, closeCtxMenu]);

  const displayLabel = LANG_DISPLAY[lang] || (lang && !["", "plain"].includes(lang) ? lang : "");

  const highlightedHtml = highlight(code, lang);

  // Post-process: wrap each line in a span
  const overlayHtml = highlightedHtml
    .split("\n")
    .map((lineHtml) => {
      return `<span class="code-line">${lineHtml}</span>`;
    })
    .join("");

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
          value={code}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        <pre ref={overlayRef} className="code-overlay" aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: overlayHtml }} />
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

      {/* Language label — bottom right, click to change */}
      <div className="code-lang-anchor" ref={langDropdownRef}>
        <span
          className="code-lang"
          onClick={(e) => {
            e.stopPropagation();
            setLangDropdown((v) => !v);
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {displayLabel || "Plain"}
        </span>
        {langDropdown && (
          <div className="code-lang-dropdown" onMouseDown={(e) => e.stopPropagation()}>
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                className={`code-lang-option${l.value === lang ? " code-lang-option-active" : ""}`}
                onClick={() => handleLangDropdownSelect(l.value)}
              >
                {l.value === lang && <span style={{ marginRight: 6, fontSize: 11 }}>✓</span>}
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <CodeCtxMenu
          position={ctxMenu}
          currentLang={lang}
          onCopy={handleCopy}
          onChangeLang={handleLangChange}
          onDelete={handleDeleteBlock}
          onClose={closeCtxMenu}
        />
      )}
    </div>
  );
});

/* ---- Context menu rendered as a portal ---- */
function CodeCtxMenu({ position, currentLang, onCopy, onChangeLang, onDelete, onClose: _onClose }) {
  const [langSub, setLangSub] = useState(false);
  const menuRef = useRef(null);
  const subRef = useRef(null);

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

  // Adjust submenu position
  useEffect(() => {
    if (!langSub || !subRef.current) return;
    const rect = subRef.current.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      subRef.current.style.top = "auto";
      subRef.current.style.bottom = "0";
    }
    if (rect.right > window.innerWidth) {
      subRef.current.style.left = "auto";
      subRef.current.style.right = "100%";
    }
  }, [langSub]);

  return (
    <div
      ref={menuRef}
      className="code-ctx-menu"
      style={{ top: pos.top, left: pos.left }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button className="code-ctx-item" onClick={onCopy}>
        Copy Code
      </button>
      <div
        className="code-ctx-item code-ctx-submenu-trigger"
        onMouseEnter={() => setLangSub(true)}
        onMouseLeave={() => setLangSub(false)}
      >
        <span>Change Language</span>
        <span style={{ marginLeft: "auto", opacity: 0.4, fontSize: 10 }}>▶</span>
        {langSub && (
          <div ref={subRef} className="code-ctx-submenu">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                className={`code-ctx-item${l.value === currentLang ? " code-ctx-active" : ""}`}
                onClick={() => onChangeLang(l.value)}
              >
                {l.value === currentLang && <span style={{ marginRight: 6, fontSize: 11 }}>✓</span>}
                {l.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="code-ctx-sep" />
      <button className="code-ctx-item code-ctx-danger" onClick={onDelete}>
        Delete Block
      </button>
    </div>
  );
}
