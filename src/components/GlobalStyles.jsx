import { useTheme } from "../hooks/useTheme";

export default function GlobalStyles() {
  const { theme } = useTheme();

  return (
    <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes syncGlow {
          0%, 100% { box-shadow: 0 0 4px ${theme.BRAND.orange}40; }
          50% { box-shadow: 0 0 14px ${theme.BRAND.orange}80, 0 0 24px ${theme.BRAND.orange}30; }
        }
        @keyframes syncDotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInToolbar {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes tabSlideIn {
          from { max-width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
          to { max-width: 200px; opacity: 1; }
        }
        @keyframes tabSlideOut {
          from { max-width: 200px; opacity: 1; }
          to { max-width: 0; opacity: 0; padding-left: 0; padding-right: 0; overflow: hidden; }
        }
        .sidebar-dragging * { transition: none !important; }
        body.block-dragging { cursor: grabbing !important; user-select: none !important; }
        body.block-dragging * { cursor: grabbing !important; user-select: none !important; }
        [data-drag-slot] { transition: opacity 150ms ease; }
        * { box-sizing: border-box; scrollbar-width: thin; scrollbar-color: ${theme.BG.divider} transparent; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.BG.divider}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${theme.BG.hover}; box-shadow: 0 0 4px ${theme.BG.hover}40; }
        .tab-scroll::-webkit-scrollbar { height: 0px; }
        .tab-scroll::-webkit-scrollbar-track { background: transparent; }
        .tab-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; }
        .tab-scroll:hover::-webkit-scrollbar { height: 5px; }
        .tab-scroll:hover::-webkit-scrollbar-thumb { background: ${theme.BG.divider}; }
        .editor-scroll::-webkit-scrollbar-thumb { background: transparent; }
        .editor-scroll:hover::-webkit-scrollbar-thumb { background: ${theme.BG.divider}; }
        input::placeholder { color: ${theme.TEXT.muted}; }
        [contenteditable]:focus { outline: none; }
        .checkbox-box:active { transform: scale(0.85); }
        .tab-btn > .tab-close { opacity: 0; width: 0; overflow: hidden; margin-left: 0; transition: opacity 0.15s, width 0.1s, margin-left 0.1s; }
        .tab-btn:hover > .tab-close, .tab-btn.tab-active > .tab-close { opacity: 0.6; width: 16px; margin-left: 5px; }
        .tab-btn > .tab-close:hover { opacity: 1 !important; }
        [data-block-id] code {
          background: ${theme.inlineCode.bg};
          border: 1px solid ${theme.inlineCode.border};
          border-radius: 3px;
          padding: 1px 4px;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.9em;
        }
        [data-block-id] a {
          color: ${theme.link.color};
          text-decoration: underline;
          text-decoration-color: ${theme.link.underline};
          cursor: pointer;
        }
        [data-block-id] a:hover {
          text-decoration-color: ${theme.link.color};
          background: ${theme.link.hoverBg};
          border-radius: 2px;
        }
        [data-block-id] .external-link-icon {
          font-size: 0.65em;
          opacity: 0.5;
          vertical-align: super;
          user-select: none;
          pointer-events: none;
          margin-left: 1px;
        }
        [data-block-id] a:hover .external-link-icon {
          opacity: 0.8;
        }
        [data-block-id] del {
          text-decoration: line-through;
          text-decoration-color: ${theme.ACCENT.primary};
          text-decoration-thickness: 1.5px;
          color: inherit;
        }
        [data-block-id] mark {
          background: ${theme.mark.bg};
          color: inherit;
          border-radius: 2px;
          padding: 0 2px;
        }
        [data-block-id] .inline-tag {
          color: ${theme.ACCENT.primary};
          opacity: 0.7;
          font-size: 0.92em;
        }
        [data-block-id] .wikilink {
          color: ${theme.wikilink.color};
          text-decoration: underline;
          text-decoration-style: dotted;
          text-decoration-color: ${theme.wikilink.underline};
          cursor: pointer;
        }
        [data-block-id] .wikilink:hover {
          text-decoration-color: ${theme.wikilink.color};
        }
        [data-block-id] .wikilink-broken {
          color: ${theme.wikilinkBroken.color};
          text-decoration-style: dashed;
          text-decoration-color: ${theme.wikilinkBroken.underline};
        }
        [data-block-id] .wikilink-broken:hover {
          color: ${theme.wikilinkBroken.hoverColor};
          text-decoration-color: ${theme.wikilinkBroken.hoverUnderline};
        }
        .code-block {
          position: relative;
          background: ${theme.codeBlockBg};
          border: 1px solid ${theme.codeBlockBorder};
          border-radius: 8px;
          margin: 8px 0;
          padding: 14px 16px;
          transition: border-color 0.15s;
        }
        .code-block:focus-within {
          border-color: ${theme.codeBlockBorderFocus};
        }
        .code-body {
          position: relative;
          overflow: hidden;
        }
        .code-textarea {
          display: block;
          width: 100%;
          min-height: 22px;
          padding: 0;
          margin: 0;
          background: transparent;
          color: transparent;
          -webkit-text-fill-color: transparent;
          caret-color: ${theme.caretColor};
          border: none;
          outline: none;
          resize: none;
          overflow: hidden;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.6;
          tab-size: 4;
          white-space: pre-wrap;
          word-wrap: break-word;
          position: relative;
          z-index: 1;
        }
        .code-textarea::selection {
          background: ${theme.codeSelection};
          -webkit-text-fill-color: transparent;
        }
        .code-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          margin: 0;
          padding: 0;
          background: transparent;
          border: none;
          pointer-events: none;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.6;
          tab-size: 4;
          white-space: pre-wrap;
          word-wrap: break-word;
          color: ${theme.TEXT.primary};
          overflow: hidden;
        }
        .code-overlay code {
          display: block;
          font-family: inherit;
          font-size: inherit;
          line-height: inherit;
          background: transparent;
          border: none;
          padding: 0;
          border-radius: 0;
        }
        .code-line {
          position: relative;
          display: block;
        }
        .code-copy-wrapper {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 2;
          opacity: 0;
          transition: opacity 0.15s;
          pointer-events: auto;
        }
        .code-block:hover .code-copy-wrapper {
          opacity: 1;
        }
        .code-copy-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid ${theme.codeCopy.border};
          background: ${theme.codeCopy.bg};
          color: ${theme.codeCopy.color};
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          padding: 0;
        }
        .code-copy-btn:hover {
          background: ${theme.codeCopy.hoverBg};
          color: ${theme.codeCopy.hoverColor};
        }
        .code-lang-anchor {
          position: absolute;
          bottom: 8px;
          right: 10px;
          z-index: 2;
        }
        .code-lang {
          font-size: 11px;
          color: ${theme.codeLang.color};
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          user-select: none;
          cursor: pointer;
          transition: color 0.15s;
        }
        .code-lang:hover {
          color: ${theme.codeLang.hoverColor};
        }
        .code-lang-dropdown {
          position: absolute;
          bottom: calc(100% + 6px);
          right: 0;
          min-width: 140px;
          background: ${theme.BG.elevated};
          border: 1px solid ${theme.BG.divider};
          border-radius: 8px;
          padding: 4px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
          max-height: 260px;
          overflow-y: auto;
        }
        .code-lang-option {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 6px 12px;
          border: none;
          background: none;
          color: ${theme.TEXT.secondary};
          font-size: 12px;
          font-family: inherit;
          cursor: pointer;
          text-align: left;
        }
        .code-lang-option:hover {
          background: ${theme.codeLangOption.hoverBg};
          color: ${theme.TEXT.primary};
        }
        .code-lang-option-active {
          color: ${theme.TEXT.primary};
        }
        /* Code block context menu */
        .code-ctx-menu {
          position: fixed;
          z-index: 9999;
          min-width: 170px;
          background: ${theme.BG.elevated};
          border: 1px solid ${theme.BG.divider};
          border-radius: 8px;
          padding: 4px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        .code-ctx-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 7px 14px;
          font-size: 12.5px;
          color: ${theme.TEXT.primary};
          background: none;
          border: none;
          cursor: pointer;
          text-align: left;
          position: relative;
          gap: 4px;
        }
        .code-ctx-item:hover {
          background: rgba(255,255,255,0.06);
        }
        .code-ctx-danger { color: #f87171; }
        .code-ctx-danger:hover { background: rgba(248,113,113,0.1); }
        .code-ctx-active { color: ${theme.ACCENT.primary}; }
        .code-ctx-sep {
          height: 1px;
          background: ${theme.BG.divider};
          margin: 4px 0;
        }
        .code-ctx-submenu-trigger {
          position: relative;
        }
        .code-ctx-submenu {
          position: absolute;
          left: 100%;
          top: 0;
          min-width: 150px;
          background: ${theme.BG.elevated};
          border: 1px solid ${theme.BG.divider};
          border-radius: 8px;
          padding: 4px 0;
          box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        }
        /* Prism.js token colors */
        .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #636980; font-style: italic; }
        .token.punctuation { color: #9B9EB0; }
        .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol { color: #FF9E64; }
        .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin { color: #9ECE6A; }
        .token.operator, .token.entity, .token.url { color: #89DDFF; }
        .token.atrule, .token.attr-value, .token.keyword { color: #BB9AF7; }
        .token.function, .token.class-name { color: #7AA2F7; }
        .token.regex, .token.important, .token.variable { color: #E0AF68; }
        .token.important, .token.bold { font-weight: bold; }
        .token.italic { font-style: italic; }
        /* Callout block styles */
        .callout-block {
          margin: 8px 0;
        }
        .callout-icon-btn:hover {
          background: ${theme.calloutIconHover} !important;
        }
        .callout-title:empty::before {
          content: attr(data-placeholder);
          opacity: 0.35;
          pointer-events: none;
        }
        .callout-body:empty::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.5;
          pointer-events: none;
        }
        .callout-body p { margin: 0; }
        /* Table block styles */
        .table-outer {
          position: relative;
          outline: none;
        }
        .table-block-wrapper {
          overflow-x: auto;
          border-radius: 8px;
          border: 1px solid ${theme.BG.divider};
        }
        .table-block {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }
        .table-block th, .table-block td {
          border: 1px solid ${theme.BG.divider};
          padding: 8px 12px;
          text-align: left;
          outline: none;
          min-width: 80px;
        }
        .table-block th {
          background: ${theme.tableTh};
          font-weight: 600;
          color: ${theme.TEXT.primary};
        }
        .table-block td {
          color: ${theme.TEXT.primary};
          background: transparent;
        }
        .table-block td:focus, .table-block th:focus {
          box-shadow: inset 0 0 0 2px ${theme.ACCENT.primary}50;
        }
        /* Edge zones */
        .table-left-zone { cursor: grab; }
        .table-left-zone:active { cursor: grabbing; }
        .table-top-zone { cursor: grab; }
        .table-top-zone:active { cursor: grabbing; }
        /* Add row/column bars */
        .table-bottom-zone:hover, .table-right-zone:hover {
          background: ${theme.ACCENT.primary}0A;
        }
        /* Preview rows */
        .table-preview-row td {
          background: ${theme.ACCENT.primary}08 !important;
          border-style: dashed !important;
        }
        /* Frontmatter block styles */
        .frontmatter-block {
          border-radius: 8px;
          border: 1px solid ${theme.BG.divider};
          background: ${theme.frontmatter};
          margin: 8px 0;
          overflow: hidden;
        }
        .frontmatter-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          color: ${theme.TEXT.muted};
          transition: color 0.15s;
        }
        .frontmatter-header:hover { color: ${theme.TEXT.secondary}; }
        .frontmatter-body {
          padding: 8px 12px;
          border-top: 1px solid ${theme.BG.divider};
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 12px;
          line-height: 1.6;
          color: ${theme.TEXT.secondary};
          white-space: pre-wrap;
        }
        .empty-block {
          position: relative;
        }
        .empty-block::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.4;
          position: absolute;
          pointer-events: none;
        }
        .empty-title::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.35;
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
        }
      `}</style>
  );
}
