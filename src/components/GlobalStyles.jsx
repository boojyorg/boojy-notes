import { useTheme } from "../hooks/useTheme";
import { tagPillCss } from "../styles/tagPill";
import { LABEL_PAD_X } from "../constants/layout";
import { PARAGRAPH_GAP } from "./EditableBlock";
import { settingsStyles } from "./settings/SettingsPrimitives";

export default function GlobalStyles() {
  const { theme } = useTheme();

  return (
    <style>{`
        :root {
          --boojy-error-bg: ${theme.BG.darkest};
          --boojy-error-surface: ${theme.BG.surface};
          --boojy-error-text: ${theme.TEXT.primary};
          --boojy-error-muted: ${theme.TEXT.muted};
          --boojy-error-accent: ${theme.ACCENT.primary};
          --boojy-error-danger: ${theme.SEMANTIC.error};
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
        .sidebar-dragging * { transition: none !important; }
        /* Everything on the panel's clock (tokens/motion.js) carries this
           class; a reduced-motion user gets the two states and no travel. */
        @media (prefers-reduced-motion: reduce) {
          .panel-motion { transition: none !important; animation: none !important; }
        }
        body.block-dragging { cursor: grabbing !important; user-select: none !important; }
        body.block-dragging * { cursor: grabbing !important; user-select: none !important; }
        /* Block drag handle (BlockDragHandle.jsx) follows the note-row ···
           grammar for reveal: muted ink at 0.55 beside the hovered block, gone
           while a drag is live. Hovering the grip itself lifts the ink to full
           muted and nothing else — deliberately NO hover surface (judged live
           2026-09-03 against an ink-8% fill): the gutter stays part of the
           page, not a control strip. All states are CSS — no JS opacity handlers. */
        .block-drag-handle {
          opacity: 0.55;
          color: ${theme.TEXT.muted};
          animation: blockHandleIn 120ms ease;
          transition: opacity 120ms ease, color 120ms ease;
        }
        @keyframes blockHandleIn { from { opacity: 0; } to { opacity: 0.55; } }
        .block-drag-handle:hover { opacity: 1; }
        body.block-dragging .block-drag-handle { opacity: 0 !important; }
        /* Insertion marker (useBlockDrag, painted on <body>): where the block
           lands on release. 3px of the accent at 40% — accent is allowed as a
           2-3px marker, never as a surface, and a drop line is a caret between
           blocks. Height is read back by the hook to centre it in the gap. */
        .block-drop-marker {
          position: fixed;
          height: 3px;
          border-radius: 1.5px;
          pointer-events: none;
          z-index: 999;
          background: color-mix(in srgb, ${theme.ACCENT.primary} 40%, transparent);
        }
        * { box-sizing: border-box; }
        /* Firefox only. Chromium 121+ IGNORES every ::-webkit-scrollbar rule on any
           element that sets scrollbar-width or scrollbar-color, so declaring these
           globally silently killed the thumb hover state in Electron and Chrome.
           Chromium supports this selector and skips the block; Firefox doesn't and
           takes it, so it still gets a thin themed bar. Don't hoist these out. */
        @supports not selector(::-webkit-scrollbar) {
          * { scrollbar-width: thin; scrollbar-color: ${theme.scrollbar.thumb} transparent; }
        }
        ::-webkit-scrollbar { width: 12px; height: 12px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-corner { background: transparent; }
        /* 12px of hit area, 7px of visible thumb: the transparent border is padding
           the grab target, not the ink. Use background-color (not the background
           shorthand) in the state rules — the shorthand resets background-clip and
           the thumb would jump to full width on hover. The 2.5px border is what
           standardises the visible weight at 7px with the sidebar bar (judged
           live 2026-08-23); fractional borders are exact on retina, and may
           round a device pixel unevenly on 1× displays. */
        ::-webkit-scrollbar-thumb {
          background-color: ${theme.scrollbar.thumb};
          background-clip: padding-box;
          border: 2.5px solid transparent;
          border-radius: 999px;
        }
        ::-webkit-scrollbar-thumb:hover { background-color: ${theme.scrollbar.thumbHover}; }
        ::-webkit-scrollbar-thumb:active { background-color: ${theme.scrollbar.thumbActive}; }
        /* Sidebar-only scrollbar geometry (judged live 2026-08-23). Same 7px
           visible pill as the global bar, but hugging the divider: 4px border
           on the content side, 1px on the edge side, so the ink's outer edge
           sits 1px off the divider instead of centred. Same colours as the
           global bar. Pairs with ROW_INSET_RIGHT in Sidebar.jsx. */
        .sidebar-scroll::-webkit-scrollbar-thumb {
          border-left-width: 4px;
          border-right-width: 1px;
        }
        /* Note-row ··· reveal (judged live 2026-08-23; slot collapses at rest
           since 2026-08-23 v2). Hidden at rest and on a merely-selected row;
           row hover or keyboard focus shows muted dots; hovering the control
           itself lifts them to primary ink. The slot takes NO width at rest so
           a long title truncates against the full row, and re-truncates only
           20px + the row gap shorter while the dots are revealed. Width snaps
           (judged live: a sliding re-truncation reads worse than an instant
           one) — only the ink transitions. An open menu holds the slot via
           inline styles in Sidebar.jsx. */
        /* Rest ground for the drag's drop targets when their inline background is
           absent. A folder row is a <button>: with no inline background it falls to
           the UA's buttonface (#EFEFEF), which no theme covers. Inline values, the
           row's own rest colour and the drag's paint alike, still win over this. */
        [data-folder-path], [data-drop-root] { background: transparent; }
        .sidebar-note-more {
          opacity: 0;
          width: 0;
          overflow: hidden;
          color: ${theme.TEXT.muted};
          transition: opacity 120ms, color 120ms;
        }
        .sidebar-note:hover .sidebar-note-more,
        .sidebar-note:focus-visible .sidebar-note-more {
          opacity: 1;
          width: 20px;
        }
        .sidebar-note-more:hover {
          opacity: 1;
          color: ${theme.TEXT.primary};
        }
        /* A folder row's trailing New note and ··· (2026-09-16): the note
           row's slot grammar, two glyph boxes wide. Zero-width at rest,
           revealed on row hover or focus; muted, each glyph primary on its
           own hover. Sidebar.jsx holds the slot open inline while the row's
           menu is up. */
        .sidebar-folder-actions {
          opacity: 0;
          width: 0;
          overflow: hidden;
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          color: ${theme.TEXT.muted};
          transition: opacity 120ms;
        }
        .sidebar-folder:hover .sidebar-folder-actions,
        .sidebar-folder:focus-visible .sidebar-folder-actions {
          opacity: 1;
          width: 44px;
        }
        .sidebar-folder-action {
          width: 20px;
          height: 24px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
          cursor: pointer;
          transition: color 120ms;
        }
        .sidebar-folder-action:hover { color: ${theme.TEXT.primary}; }
        /* A row renaming stands down (2026-09-16): no pill under the field,
           however it is hovered, active or selected (the hover pill is an
           inline write, hence !important), and no trailing actions, whose
           only effect would be to blur the field. The selected name is the
           whole signal. */
        .sidebar-note.is-renaming, .sidebar-folder.is-renaming {
          background: transparent !important;
        }
        /* A folder the app has just made (Duplicate folder) wears the row's own
           pill for NEW_ROW_MS, so the copy is found among its alphabetical
           neighbours instead of announced in a message. Same !important reason
           as above: the row's hover is an inline write. */
        .sidebar-folder.is-new, .sidebar-note.is-new {
          background: ${theme.BG.hover} !important;
        }
        .sidebar-note.is-renaming .sidebar-note-more,
        .sidebar-folder.is-renaming .sidebar-folder-actions {
          opacity: 0 !important;
          width: 0 !important;
          pointer-events: none;
        }
        /* The Notes row's three controls (Search, New folder, ···) are
           visible at rest and lift on hover or focus. 0.55 is the quiet ink —
           the faintest composite that clears ~3:1 on the DAY ground (0.4 does
           not). They hid at rest until 2026-09-12; Search is the only route to
           the palette while the sidebar is showing, and a control you must
           hover to find is not one. An open menu holds its control at full ink
           via inline opacity (SectionAction \`active\`). */
        /* The Notes row's New folder and Sort (2026-09-16): hidden at rest,
           revealed muted while the pointer is on the row or a focus is in it
           (the folder rows' own grammar), each full ink on its own hover.
           .menu-open on the row holds the pair while the Sort menu is up,
           and .is-active is the control whose menu it is. Only the ink
           fades; the slot keeps its width, so the label never re-truncates. */
        .sidebar-section-action {
          background: transparent;
          color: ${theme.TEXT.secondary};
          opacity: 0;
          transition: background 120ms, color 120ms, opacity 120ms;
        }
        .sidebar-section-header:hover .sidebar-section-action,
        .sidebar-section-header:has(:focus-visible) .sidebar-section-action,
        .sidebar-section-header.menu-open .sidebar-section-action {
          opacity: 0.55;
        }
        .sidebar-section-header .sidebar-section-action:hover,
        .sidebar-section-header .sidebar-section-action:focus-visible,
        .sidebar-section-header .sidebar-section-action.is-active {
          background: ${theme.BG.surface};
          color: ${theme.TEXT.primary};
          opacity: 1;
        }
        /* A window drag region takes the press before the page sees it, so
           while the path's folder popup is open every drag region stands down
           and a press on the empty top row closes the popup instead (2026-09-16).
           !important, because the regions are set inline. */
        html.popup-open [data-drag-region] { -webkit-app-region: no-drag !important; }
        input::placeholder { color: ${theme.TEXT.muted}; }
        /* The app font on the body too, so a surface portalled to it (the
           table's cell menu) inherits Inter rather than the browser's serif
           (2026-09-10). The app root sets the same stack. */
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        [contenteditable]:focus:not(:focus-visible) { outline: none; }
        *:focus-visible { outline: 2px solid ${theme.ACCENT.primary}40; outline-offset: 2px; border-radius: 2px; }
        [contenteditable]:focus-visible { outline: none; }
        /* Sidebar action rows opt out of the global 25%-alpha ring for a solid 2px accent. */
        .sidebar-action-row:focus-visible { outline: 2px solid ${theme.ACCENT.primary}; outline-offset: 2px; border-radius: 12px; }
        .sidebar-section-action:focus-visible { outline: 2px solid ${theme.ACCENT.primary}; outline-offset: 2px; border-radius: 6px; }
        /* The press squeezes the drawn box; the hit area around it never
           transforms. On .checkbox-box itself the scale pulled the element's
           own edges 1.2px in from under the pointer, so a press near an edge
           animated and then released onto the row instead (2026-09-19). */
        .checkbox-hit:active .checkbox-box { transform: scale(0.85); }
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
        /* The strike is drawn in the text's own colour (2026-09-16, Tyr's ask);
           it was the accent, which made struck words the one inline format
           with a colour of its own. */
        [data-block-id] del {
          text-decoration: line-through;
          text-decoration-thickness: 1.5px;
          color: inherit;
        }
        /* Bold inside a heading is one step heavier than the heading
           (2026-09-16). Left to the browser, "bolder" on a 600 or 700 heading
           jumps to 900, which is a different face rather than an emphasis. */
        [data-block-type="h1"] strong, [data-block-type="h6"] strong { font-weight: 800; }
        [data-block-type="h2"] strong, [data-block-type="h3"] strong,
        [data-block-type="h4"] strong, [data-block-type="h5"] strong { font-weight: 700; }
        [data-block-id] mark {
          background: ${theme.mark.bg};
          color: inherit;
          border-radius: 2px;
          padding: 0 2px;
        }
${tagPillCss(theme)}
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
        /* The words the link picker will link, while it holds focus: a
           neutral wash the selection's own strength, unwrapped before the
           block is read back (useLinkPicker). Never the saved ==highlight==. */
        [data-block-id] mark.link-picker-wash {
          background: ${theme.selectionWash};
          color: inherit;
          border-radius: 2px;
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
          /* Empty overlay lines must occupy the same line box as the textarea. */
          min-height: 1lh;
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
          display: flex;
          align-items: center;
          gap: 2px;
          border: none;
          background: none;
          padding: 0;
          font-size: 11px;
          color: ${theme.codeLang.color};
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          user-select: none;
          cursor: pointer;
          transition: color 0.15s;
        }
        .code-lang:hover, .code-lang:focus-visible, .code-lang-open {
          color: ${theme.codeLang.hoverColor};
        }
        /* The chevron is the label's only affordance: it takes its width at
           rest so the label never shifts, and only its ink fades in, as the
           sidebar's row controls do. */
        .code-lang-chevron {
          display: flex;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .code-lang:hover .code-lang-chevron,
        .code-lang:focus-visible .code-lang-chevron,
        .code-lang-open .code-lang-chevron {
          opacity: 1;
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
        .code-ctx-danger { color: ${theme.SEMANTIC.error}; }
        .code-ctx-danger:hover { background: ${theme.SEMANTIC.error}18; }
        .code-ctx-sep {
          height: 1px;
          background: ${theme.BG.divider};
          margin: 4px 0;
        }
        /* Prism.js token colors */
        .token.comment, .token.prolog, .token.doctype, .token.cdata { color: ${theme.syntax.comment}; font-style: italic; }
        .token.punctuation { color: ${theme.syntax.punctuation}; }
        .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol { color: ${theme.syntax.property}; }
        .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin { color: ${theme.syntax.string}; }
        .token.operator, .token.entity, .token.url { color: ${theme.syntax.operator}; }
        .token.atrule, .token.attr-value, .token.keyword { color: ${theme.syntax.keyword}; }
        .token.function, .token.class-name { color: ${theme.syntax.function}; }
        .token.regex, .token.important, .token.variable { color: ${theme.syntax.variable}; }
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
        /* Table block styles. The grid sizes to its content (Obsidian's
           model; Markdown holds no column width), with a minimum cell width
           so an empty table reads as a small grid, capped at the column by the
           scroller it sits in. No focus ring on a cell: the caret is the
           signal, as in a paragraph (2026-09-10). */
        .table-outer {
          position: relative;
          outline: none;
        }
        /* Shrink before you scroll, the way Chrome's tabs do: auto layout
           shares the column's width between the columns in proportion to
           their content and wraps text, down to a 72px floor per cell (about
           six characters); only past that does the scroller take over. The
           240px minimum is the table's, not the cells', so an empty 2×2 still
           reads as a small grid while eight empty columns fit the column. A
           120px per-cell minimum made six columns scroll at once
           (2026-09-10). */
        .table-block {
          width: auto;
          min-width: 240px;
          table-layout: auto;
          border-collapse: collapse;
          font-size: 14px;
        }
        /* One grid, one thickness: the cells' collapsed 1px borders are the
           whole grid, outer edge included (no border on the scroller, which
           doubled the edge), and no rounded corners (2026-09-10, judged
           against Obsidian's). */
        .table-block th, .table-block td {
          border: 1px solid ${theme.BG.divider};
          padding: 8px 12px;
          text-align: left;
          outline: none;
          min-width: 72px;
          overflow-wrap: anywhere;
        }
        .table-block th {
          background: transparent;
          font-weight: 600;
          color: ${theme.TEXT.primary};
        }
        .table-block td {
          color: ${theme.TEXT.primary};
          background: transparent;
        }
        /* Edge zones */
        .table-left-zone { cursor: grab; }
        .table-left-zone:active { cursor: grabbing; }
        .table-top-zone { cursor: grab; }
        .table-top-zone:active { cursor: grabbing; }
        /* The add-row and add-column boxes, Obsidian's: a bordered box the
           grid's height at its right edge and its width under its bottom
           edge, sharing the grid's own border line, with a Plus centred.
           Hidden at rest and shown only while the pointer is past that edge,
           on the box itself (reveal is CSS, never a JS hover state). */
        .table-add-bar {
          opacity: 0;
          transition: opacity 120ms;
          color: ${theme.TEXT.muted};
        }
        .table-add-bar:hover {
          opacity: 1;
          color: ${theme.TEXT.primary};
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
        /* Settings and setup: hover lifts ink, focus is the inset ring
           (settings/SettingsPrimitives.jsx). */
        ${settingsStyles(theme)}
        /* The paragraph pitch (EditableBlock.PARAGRAPH_GAP): a soft break is
           line height alone, Enter adds this, an empty row adds a whole line.
           A paragraph after a list item is its own structure now (the file
           has a blank line between them) and gets the same gap above it,
           which the list's tight row padding does not give. */
        p[data-block-type="p"] {
          margin: 0 0 ${PARAGRAPH_GAP}px;
        }
        [data-block-type="bullet"] + p[data-block-type="p"],
        [data-block-type="numbered"] + p[data-block-type="p"],
        [data-block-type="checkbox"] + p[data-block-type="p"] {
          margin-top: ${PARAGRAPH_GAP}px;
        }
        .empty-block {
          position: relative;
        }
        /* Placeholder shows only while the first block is visually empty.
           An "empty" contentEditable block holds a single <br> (set in
           EditableBlock for caret placement), so match that — and also a
           truly-empty node. As soon as real text is typed, neither matches
           and the placeholder hides immediately (no dependency on the
           debounced block.text, which was the cause of it lingering). */
        .empty-block:empty::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.4;
          position: absolute;
          pointer-events: none;
        }
        .empty-block:has(> br:only-child)::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.4;
          position: absolute;
          pointer-events: none;
        }
        /* An empty heading names its level, in its own size and weight
           (the pseudo-element inherits the heading's type), by the same two
           rules as the paragraph's placeholder: while the element holds
           nothing, or only the caret's <br>. Every heading, focused or not:
           the editor is one contentEditable, so a block is never :focus, and
           an empty heading is otherwise an invisible row (2026-09-20). */
        [data-block-type^="h"][data-placeholder]:empty::before,
        [data-block-type^="h"][data-placeholder]:has(> br:only-child)::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.4;
          position: absolute;
          pointer-events: none;
        }
        /* The name's placeholder follows the same rule as the block's: it
           shows while the field is empty on screen (nothing, or the <br>
           the sync paints for the caret), read from the DOM and never from
           the debounced title, which showed an empty pill for 300 ms after a
           Backspace. Absolute, as the block's is, because Chromium draws the
           caret after an in-flow ::before; it inherits the field's padding
           so the text starts where the caret does rather than 5px behind
           it, which put the caret through the U. While empty the field is
           as wide as the placeholder (NotePath measures it), so the pill
           holds its width and the path stays centred. */
        [data-title] {
          min-width: 0;
        }
        /* While empty, and for the rest of an editing session in which the
           placeholder has shown (data-placeholder-floor, set by the field on
           focus and on input, cleared on blur): a short name typed over the
           placeholder keeps its width instead of snapping to a one-letter
           pill and re-centring the path on every keystroke; a rename that
           never empties follows its text (judged 2026-09-17). The field fits
           the name and re-centres once, when the caret leaves. border-box,
           so the pill's padding is inside the minimum. */
        [data-title]:empty,
        [data-title]:has(> br:only-child),
        [data-title][data-placeholder-floor] {
          min-width: calc(var(--title-placeholder-width, 0px) + ${2 * LABEL_PAD_X}px);
        }
        [data-title]:empty::before,
        [data-title]:has(> br:only-child)::before {
          content: attr(data-placeholder);
          color: ${theme.TEXT.muted};
          opacity: 0.4;
          position: absolute;
          top: 0;
          left: 0;
          padding: inherit;
          pointer-events: none;
        }
      `}</style>
  );
}
