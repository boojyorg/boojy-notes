import { useTheme } from "../hooks/useTheme";
import { tagPillCss, tagPillGround } from "../styles/tagPill";
import { CHROME_BTN, LABEL_PAD_X, SCROLLBAR_W } from "../constants/layout";
import { CHROME_TOP } from "./EditorChrome";
import { MOTION_VARS } from "../tokens/motion";
import { useRhythm } from "../tokens/rhythm";
import { bandFill, withAlpha } from "../utils/selectionBand";
import { SEARCH_HIT_ALPHA, SEARCH_HIT_STEPS } from "../utils/searchHighlight";
import { settingsStyles } from "./settings/SettingsPrimitives";
import { isPhone } from "../utils/platform";

/** What the phone shades on a press (`:active`), and fades back out after. */
const PHONE_PRESSABLE = `html.is-phone :is(
  .press, .chrome-button, .sidebar-row, .sidebar-action-row, .sidebar-vault-label,
  .settings-location, .code-copy-btn, .callout-icon-btn,
  [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"],
  [role="option"], [role="treeitem"]
)`;

export default function GlobalStyles() {
  const { theme } = useTheme();
  const rhythm = useRhythm();

  return (
    <style>{`
        :root {
          --boojy-error-bg: ${theme.BG.darkest};
          --boojy-error-surface: ${theme.BG.surface};
          --boojy-error-text: ${theme.TEXT.primary};
          --boojy-error-muted: ${theme.TEXT.muted};
          --boojy-error-accent: ${theme.ACCENT.primary};
          --boojy-error-danger: ${theme.SEMANTIC.error};
          /* The focus ring is accent as ink, not the mark: the mark is 2:1 on
             Light's grounds and a ring has to show (3:1). */
          --boojy-focus-ring: ${theme.ACCENT.text};
          ${Object.entries(MOTION_VARS)
            .map(([name, value]) => `${name}: ${value};`)
            .join("\n          ")}
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .sidebar-dragging *, .window-resizing * { transition: none !important; }
        /* While the divider is dragged nothing else answers the pointer: a row
           or button passed over would light up as if it could be pressed. The
           drag itself listens on the window, and body keeps the cursor. */
        .sidebar-dragging body * { pointer-events: none !important; }
        /* The small clock (tokens/motion.js). A surface arrives wearing one
           of these: .motion-pop (a menu or dialog grows in), .motion-rise
           (a toast or the selection toolbar lifts in), .motion-fade (a scrim
           or tooltip). When it closes, useExitGhost leaves a copy wearing
           .motion-ghost that fades away, so the surface itself is gone at once.
           scale and translate are their own properties, so they never fight a
           surface's own transform, and a keyframe with only a start lands on
           whatever the surface rests at. */
        @keyframes motion-pop-in { from { opacity: 0; scale: var(--pop-from); } }
        @keyframes motion-rise-in { from { opacity: 0; translate: 0 var(--rise); } }
        @keyframes motion-fade-in { from { opacity: 0; } }
        @keyframes motion-glyph-in { from { opacity: 0; scale: 0.6; } }
        @keyframes motion-pop-out { to { opacity: 0; scale: 0.97; } }
        @keyframes motion-rise-out { to { opacity: 0; translate: 0 5px; } }
        @keyframes motion-fade-out { to { opacity: 0; } }
        .motion-pop {
          transform-origin: var(--motion-origin, top left);
          animation: motion-pop-in var(--motion-enter) var(--ease-enter) backwards;
        }
        .motion-rise { animation: motion-rise-in var(--motion-enter) var(--ease-enter) backwards; }
        .motion-fade { animation: motion-fade-in var(--motion-enter) var(--ease-enter) backwards; }
        /* The toast's one coloured mark lands a beat after its toast: the
           moment that says done. */
        .motion-glyph {
          animation: motion-glyph-in var(--motion-enter) var(--ease-enter)
            calc(var(--motion-fast) * 0.6) backwards;
        }
        .motion-from-end { --motion-origin: top right; }
        .motion-from-top { --motion-origin: top center; }
        .motion-from-bottom { --motion-origin: bottom left; }
        .motion-from-center { --motion-origin: center; }
        .motion-ghost {
          animation: motion-pop-out var(--motion-exit) var(--ease-exit) forwards !important;
          pointer-events: none !important;
        }
        .motion-ghost.motion-rise { animation-name: motion-rise-out !important; }
        .motion-ghost.motion-fade { animation-name: motion-fade-out !important; }
        /* The copy's insides must not replay their own arrival. */
        .motion-ghost .motion-pop, .motion-ghost .motion-rise,
        .motion-ghost .motion-fade, .motion-ghost .motion-glyph { animation: none !important; }
        /* Everything on the panel's clock (tokens/motion.js) carries this
           class; a reduced-motion user gets the two states and no travel.
           Keyframe animations (every popover's arrival, the loading pulse) are
           all travel or pulse, so none plays; a colour transition stays. */
        @media (prefers-reduced-motion: reduce) {
          .panel-motion, .theme-fade { transition: none !important; }
          .checkbox-tick, .press svg, .sidebar-section-action svg { transition: none !important; }
          .block-drop-marker { transition: none !important; }
          *, *::before, *::after { animation: none !important; }
        }
        body.block-dragging { cursor: grabbing !important; user-select: none !important; }
        body.block-dragging * { cursor: grabbing !important; user-select: none !important; }
        /* Block drag handle (BlockDragHandle.jsx) follows the note-row ···
           grammar for reveal: muted ink at 0.55 beside the hovered block, gone
           while a drag is live. The grip is a control (a click selects), so
           hovering it takes the chrome controls' grey and ink. All states are
           CSS — no JS opacity handlers. */
        .block-drag-handle {
          opacity: 0.55;
          color: ${theme.TEXT.muted};
          animation: blockHandleIn 120ms ease;
          transition: opacity var(--motion-fast) ease, color var(--motion-fast) ease, background var(--motion-fast) ease;
        }
        @keyframes blockHandleIn { from { opacity: 0; } to { opacity: 0.55; } }
        .block-drag-handle:hover,
        .block-drag-handle[data-pressed] {
          opacity: 1;
          background: ${theme.BG.surface};
          color: ${theme.TEXT.primary};
        }
        body.block-dragging .block-drag-handle { opacity: 0 !important; }
        /* A picture's controls are for one at rest: gone from the original too while it travels. */
        body.block-dragging [data-drag-chrome] { display: none !important; }
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
          transition: top var(--motion-fast) var(--ease-enter);
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
        /* The phone styles no scrollbar: an unstyled one is Android's own,
           drawn over the content while it scrolls and gone at rest, as in
           every app there. A styled bar would take a lane of its own. */
        ${
          isPhone
            ? ""
            : `
        ::-webkit-scrollbar { width: ${SCROLLBAR_W}px; height: ${SCROLLBAR_W}px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-corner { background: transparent; }
        /* 12px of hit area, 7px of visible thumb: the transparent border is padding
           the grab target, not the ink. Use background-color (not the background
           shorthand) in the state rules — the shorthand resets background-clip and
           the thumb would jump to full width on hover. The 2.5px border is what
           standardises the visible weight at 7px with the sidebar bar; fractional borders are exact on retina, and may
           round a device pixel unevenly on 1× displays. */
        ::-webkit-scrollbar-thumb {
          background-color: ${theme.scrollbar.thumb};
          background-clip: padding-box;
          border: 2.5px solid transparent;
          border-radius: 999px;
        }
        ::-webkit-scrollbar-thumb:hover { background-color: ${theme.scrollbar.thumbHover}; }
        ::-webkit-scrollbar-thumb:active { background-color: ${theme.scrollbar.thumbActive}; }
        /* The note's bar starts below the chrome row (NotePath's sticky band,
           measured from the scroller's own top), never behind the ···. */
        .editor-scroll::-webkit-scrollbar-track { margin-top: ${CHROME_TOP + CHROME_BTN}px; }
        /* Sidebar-only scrollbar geometry. Same 7px
           visible pill as the global bar, but beside the divider: 3px border
           on the content side, 2px on the edge side, so the ink sits 2px off
           the line (the divider's grab area takes the nearer pixel). Same
           colours as the global bar. Pairs with ROW_INSET_RIGHT in Sidebar.jsx. */
        .sidebar-scroll::-webkit-scrollbar-thumb {
          border-left-width: 3px;
          border-right-width: 2px;
        }
        `
        }
        /* Note-row ··· reveal. Hidden at rest and on a merely-selected row;
           row hover or keyboard focus shows muted dots; hovering the control
           itself lifts them to primary ink. The slot takes NO width at rest so
           a long title truncates against the full row, and re-truncates only
           20px + the row gap shorter while the dots are revealed. Width snaps
           (a sliding re-truncation reads worse than an instant one) — only
           the ink transitions. An open menu holds the slot via
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
          transition: opacity var(--motion-fast), color var(--motion-fast);
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
        /* A folder row's trailing New note and ···: the note
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
          transition: opacity var(--motion-fast);
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
          transition: color var(--motion-fast);
        }
        .sidebar-folder-action:hover { color: ${theme.TEXT.primary}; }
        /* The sidebar's rows: the neutral pill on hover and while held (the
           open note, a selection, a row whose menu is up: .is-held); ink
           lifts to primary on hover where the row's label is muted
           (.lift-ink). A drag's drop paint is inline, so it still wins. */
        .sidebar-row {
          background-color: transparent;
          transition: background-color var(--motion-fast), color var(--motion-fast);
        }
        .sidebar-row:hover, .sidebar-row.is-held { background-color: ${theme.BG.hover}; }
        .sidebar-row.lift-ink:hover, .sidebar-row.lift-ink.is-held { color: ${theme.TEXT.primary}; }
        /* A row renaming stands down: no pill under the field, however it is
           hovered, active or selected, and no trailing actions, whose only
           effect would be to blur the field. The selected name is the whole
           signal. */
        .sidebar-row.is-renaming { background-color: transparent; }
        /* A row the app has just made or moved (Duplicate folder, Move to…)
           wears the pill for NEW_ROW_MS, so it is found among its alphabetical
           neighbours instead of announced in a message. */
        .sidebar-row.is-new { background-color: ${theme.BG.hover}; }
        .sidebar-note.is-renaming .sidebar-note-more,
        .sidebar-folder.is-renaming .sidebar-folder-actions {
          opacity: 0 !important;
          width: 0 !important;
          pointer-events: none;
        }
        /* The Notes row's New folder and Sort: hidden at rest,
           revealed muted while the pointer is on the row or a focus is in it
           (the folder rows' own grammar), each full ink on its own hover.
           .menu-open on the row holds the pair while the Sort menu is up,
           and .is-active is the control whose menu it is. Only the ink
           fades; the slot keeps its width, so the label never re-truncates. */
        .sidebar-section-action {
          background: transparent;
          color: ${theme.TEXT.secondary};
          opacity: 0;
          transition: background var(--motion-fast), color var(--motion-fast), opacity var(--motion-fast);
        }
        .sidebar-section-header:hover .sidebar-section-action,
        .sidebar-section-header:has(:focus-visible) .sidebar-section-action,
        .sidebar-section-header.menu-open .sidebar-section-action {
          opacity: 0.55;
        }
        /* The phone has no hover. The Notes row's New folder and Sort show at
           rest; a row's own ··· and New note never do (a long-press opens the
           row's menu); and a tapped row keeps no pill, since a touch leaves
           :hover on whatever it last touched. */
        html.is-phone .sidebar-section-action { opacity: 0.55; }
        html.is-phone .sidebar-note-more, html.is-phone .sidebar-folder-actions { display: none !important; }
        html.is-phone .sidebar-row:hover:not(.is-held) { background-color: transparent; }
        /* The phone's header has room for some 22 letters: once the folders
           have given way, a name too long for one line takes a second rather
           than losing its end, so two notes that differ late still read
           apart. Two lines at most; the row grows with them (NotePath). */
        html.is-phone [data-title] {
          white-space: normal !important;
          overflow-wrap: anywhere;
          text-align: center;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
        }
        html.is-phone [data-title]:focus { -webkit-line-clamp: unset; }
        /* The vault's name: muted at rest, and the controls' own grey and
           ink on hover, keyboard focus, or while its menu is open. */
        .sidebar-vault-label {
          background: transparent;
          color: ${theme.TEXT.muted};
          transition: background var(--motion-fast), color var(--motion-fast);
        }
        .sidebar-vault-label:focus-visible,
        .sidebar-vault-label.is-open {
          background: ${theme.BG.hover};
          color: ${theme.TEXT.primary};
        }
        @media (hover: hover) {
          .sidebar-vault-label:hover {
            background: ${theme.BG.hover};
            color: ${theme.TEXT.primary};
          }
        }
        .sidebar-section-header .sidebar-section-action:focus-visible,
        .sidebar-section-header .sidebar-section-action.is-active,
        .sidebar-section-header .sidebar-section-action:active {
          background: ${theme.BG.hover};
          color: ${theme.TEXT.primary};
          opacity: 1;
        }
        @media (hover: hover) {
          .sidebar-section-header .sidebar-section-action:hover {
            background: ${theme.BG.hover};
            color: ${theme.TEXT.primary};
            opacity: 1;
          }
        }
        /* The phone's press, one look for everything a finger can tap: the
           row grey, in the control's own shape, while the finger is down
           (Chromium shows :active only once a touch is not a scroll). No
           system tap flash over it, and no hover left behind (hover rules
           sit under @media (hover: hover); JS hover returns on fromTouch).
           A control that refuses the touch (the key bar) is pressed by its
           data-pressed instead, since no :active follows.
           !important: menu and list rows set their background inline. */
        html.is-phone * { -webkit-tap-highlight-color: transparent; }
        ${PHONE_PRESSABLE}:active:not(:disabled):not([aria-disabled="true"]),
        html.is-phone .press[data-pressed]:not(:disabled):not([aria-disabled="true"]) {
          background-color: ${theme.BG.hover} !important;
          transition: none !important;
        }
        /* The press comes at once and leaves slowly: a quick tap holds :active
           for a few frames, too short to see, so the grey fades out after it. */
        ${PHONE_PRESSABLE} {
          transition: background-color var(--motion-enter), color var(--motion-fast),
            opacity var(--motion-fast) !important;
        }
        /* A window drag region takes the press before the page sees it, so
           while the path's folder popup is open every drag region stands down
           and a press on the empty top row closes the popup instead.
           !important, because the regions are set inline. */
        html.popup-open [data-drag-region] { -webkit-app-region: no-drag !important; }
        input::placeholder { color: ${theme.TEXT.muted}; }
        /* The app font on the body too, so a surface portalled to it (the
           table's cell menu) inherits Inter rather than the browser's serif
           The app root sets the same stack. */
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        [contenteditable]:focus:not(:focus-visible) { outline: none; }
        *:focus-visible { outline: 2px solid var(--boojy-focus-ring); outline-offset: 2px; border-radius: 2px; }
        [contenteditable]:focus-visible { outline: none; }
        /* Skip to content: off-screen until the first Tab of a session, then a
           quiet chip centred at the top, clear of the traffic lights and the
           wordmark; never the browser's blue link. */
        .skip-link {
          position: fixed; top: 8px; left: 50%; translate: -50% -200%;
          padding: 6px 12px; border-radius: 8px;
          background: ${theme.BG.elevated}; color: ${theme.TEXT.primary};
          border: 1px solid ${theme.BG.divider}; box-shadow: ${theme.floatShadow};
          font-size: 13px; font-weight: 500; text-decoration: none;
        }
        .skip-link:focus { translate: -50% 0; }
        .sidebar-action-row:focus-visible { border-radius: 12px; }
        .sidebar-section-action:focus-visible { border-radius: 6px; }
        /* Tree rows touch their neighbours, so the ring sits inside the pill. */
        .sidebar-note:focus-visible, .sidebar-folder:focus-visible {
          outline: 2px solid var(--boojy-focus-ring); outline-offset: -2px;
        }
        /* Focus a click gave keeps no ring when a lone modifier is pressed
           (utils/focusRing). After every ring rule, so it outranks them. */
        [data-pointer-focus]:focus-visible { outline: none; }
        /* The press squeezes the drawn box; the hit area around it never
           transforms. On .checkbox-box itself the scale would pull the
           element's edges in from under the pointer, and a press near an edge
           would release onto the row. */
        .checkbox-box {
          transition: background var(--motion-fast) var(--ease-enter),
            border-color var(--motion-fast) var(--ease-enter),
            transform var(--motion-fast) var(--ease-enter);
        }
        .checkbox-hit:active .checkbox-box { transform: scale(0.85); }
        /* Unticking is not the draw run backwards: the tick and the fill fade
           out together, ease-out (a leaving curve starts slow, and on 100ms
           that read as a lag and then a snap). The stroke is put back only
           once it has faded, unseen. */
        .checkbox-hit[aria-checked="false"] .checkbox-box {
          transition-duration: calc(var(--motion-fast) * 1.2);
        }
        /* The tick is a stroke that draws itself: it waits for the box to
           fill, then runs in over the arrival clock. */
        .checkbox-tick {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          opacity: 0;
          transition: opacity calc(var(--motion-fast) * 1.2) var(--ease-enter),
            stroke-dashoffset 0s calc(var(--motion-fast) * 1.2);
        }
        .checkbox-tick[data-checked="true"] {
          stroke-dashoffset: 0;
          opacity: 1;
          transition: stroke-dashoffset var(--motion-enter) var(--ease-enter)
              calc(var(--motion-fast) * 0.5),
            opacity 0s calc(var(--motion-fast) * 0.5);
        }
        /* A press is answered on the contents, never the box: scaling the
           button itself pulls its edges in from under the pointer, as above,
           and a press near an edge would release onto its neighbour. So the
           glyph dips, and the whole button is a shade deeper (instant: a press
           is answered before it is finished). Only an icon-only control dips:
           beside a label, an icon shrinking alone reads as two things
           moving, so a labelled row (New note) only shades. .press is the
           opt-in for a control that has none of its own; one that refuses
           the touch itself (the phone's key bar) marks the press with
           data-pressed, since no :active follows a refused touchstart. */
        .press:active:not(:disabled):not([aria-disabled="true"]),
        .press[data-pressed]:not([aria-disabled="true"]),
        .theme-pill:active,
        .sidebar-action-row:active,
        .sidebar-section-action:active { filter: brightness(0.93); }
        .press svg, .sidebar-section-action svg {
          transition: scale var(--motion-fast) var(--ease-enter);
        }
        .press:active:not(:disabled):not([aria-disabled="true"]) svg,
        .press[data-pressed]:not([aria-disabled="true"]) svg,
        .sidebar-section-action:active svg { scale: var(--press-icon-scale); }
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
        @media (hover: hover) {
          [data-block-id] a:hover {
            text-decoration-color: ${theme.link.color};
            background: ${theme.link.hoverBg};
            border-radius: 2px;
          }
        }
        [data-block-id] .external-link-icon {
          font-size: 0.65em;
          opacity: 0.5;
          vertical-align: super;
          user-select: none;
          pointer-events: none;
          margin-left: 1px;
        }
        @media (hover: hover) {
          [data-block-id] a:hover .external-link-icon {
            opacity: 0.8;
          }
        }
        /* The strike is drawn in the text's own colour, never the accent:
           struck words are no inline format with a colour of its own. */
        [data-block-id] del {
          text-decoration: line-through;
          text-decoration-thickness: 1.5px;
          color: inherit;
        }
        /* Bold inside a heading is one step heavier than the heading. Left to the browser, "bolder" on a 600 or 700 heading
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
        @media (hover: hover) {
          [data-block-id] .wikilink:hover {
            text-decoration-color: ${theme.wikilink.color};
          }
        }
        /* Selected text in the note wears the selection's one colour, the
           band a selected block wears (utils/selectionBand). */
        [data-editor] ::selection {
          background: ${bandFill(theme.ACCENT.primary, theme.name)};
        }
        /* The words a search matched, as the note opens from Search: a
           highlight painted over the text, never written into it, faded by
           stepping through the names (utils/searchHighlight). */
        ${SEARCH_HIT_STEPS.map(
          (name, i) =>
            `::highlight(${name}) { background-color: ${withAlpha(
              theme.ACCENT.primary,
              SEARCH_HIT_ALPHA[theme.name === "night" ? "night" : "day"][i],
            )}; }`,
        ).join("\n        ")}
        /* A misspelled word's line (hooks/editor/useSpellingMarks): laid
           over the text, as Chromium drew its own (2px dots, about 2px apart,
           touching the letters); the hook places and spaces each one. */
        .spelling-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }
        .spelling-layer > i {
          position: absolute;
          height: 2px;
          /* One dot at the start of each tile; the tile is the hook's pitch. */
          background-image: radial-gradient(circle at 1px 1px, ${theme.SEMANTIC.misspelled} 1px, transparent 1px);
          background-repeat: repeat-x;
          background-position: 0 0;
        }
        /* The words the link picker will link, while it holds focus: the
           selection's colour, standing in for it, unwrapped before the block
           is read back (useLinkPicker). Never the saved ==highlight==. */
        [data-block-id] mark.link-picker-wash {
          background: ${bandFill(theme.ACCENT.primary, theme.name)};
          color: inherit;
          border-radius: 2px;
        }
        [data-block-id] .wikilink-broken {
          color: ${theme.wikilinkBroken.color};
          text-decoration-style: dashed;
          text-decoration-color: ${theme.wikilinkBroken.underline};
        }
        @media (hover: hover) {
          [data-block-id] .wikilink-broken:hover {
            color: ${theme.wikilinkBroken.hoverColor};
            text-decoration-color: ${theme.wikilinkBroken.hoverUnderline};
          }
        }
        /* A $$ block (MathBlock): the content hover while the pointer is on
           it or its source is open; a selection's band, drawn inline, wins. */
        .math-block { transition: background-color var(--motion-fast); }
        @media (hover: hover) { .math-block:hover { background: ${theme.BG.surface}; } }
        .math-block-open { background: ${theme.BG.surface}; }
        .math-render .katex-display { margin: 4px 0; }
        /* An inline formula: one character to the caret, drawn by KaTeX. Its
           box grows with what it draws, so the hover covers a tall fraction. */
        [data-block-id] .inline-math {
          display: inline-block;
          padding: 0 2px;
          border-radius: 4px;
          cursor: text;
          transition: background-color var(--motion-fast);
        }
        @media (hover: hover) { [data-block-id] .inline-math:hover { background: ${theme.BG.surface}; } }
        [data-block-id] .inline-math[data-editing] { background: ${theme.BG.surface}; }
        .inline-math-error { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.88em; color: ${theme.TEXT.muted}; }
        .math-source textarea::placeholder { color: ${theme.TEXT.muted}; }
        @media (hover: hover) { .math-done:hover { background: ${theme.BG.surface} !important; } }
        .math-done:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--boojy-focus-ring); }
        .code-block {
          position: relative;
          background: ${theme.codeBlockBg};
          border: 1px solid ${theme.codeBlockBorder};
          border-radius: 8px;
          margin: ${rhythm.blockGap}px 0;
          /* The top keeps the toolbar's row, so the first line never sits under it. */
          padding: 28px 16px 14px;
          transition: border-color var(--motion-fast);
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
        .code-textarea::placeholder {
          color: ${theme.TEXT.muted};
          -webkit-text-fill-color: ${theme.TEXT.muted};
          opacity: 0.75;
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
        /* The Markdown view (SourceView): a transparent field over a painted
           layer, one font, one size, the two boxes laid out alike so every
           line of the layer sits under the same line of the field. */
        .source-view {
          position: relative;
        }
        .source-field,
        .source-layer {
          display: block;
          width: 100%;
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          border: none;
          font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 14px;
          line-height: 1.75;
          tab-size: 4;
          white-space: pre-wrap;
          overflow-wrap: break-word;
          word-wrap: break-word;
        }
        .source-field {
          position: relative;
          z-index: 1;
          min-height: 200px;
          background: transparent;
          color: transparent;
          -webkit-text-fill-color: transparent;
          caret-color: ${theme.caretColor};
          outline: none;
          resize: none;
          overflow: hidden;
        }
        .source-field::selection {
          background: ${theme.codeSelection};
          -webkit-text-fill-color: transparent;
        }
        /* A figure in the file's controls (the zoom, the page count) takes the
           room of its widest value, drawn unseen behind it, so the controls
           keep their width and the centred path beside them never moves. A
           pseudo-element, so the text read is only the figure. */
        .held-figure {
          display: inline-grid;
        }
        .held-figure::before {
          content: attr(data-widest);
          visibility: hidden;
        }
        .held-figure::before,
        .held-figure > * {
          grid-area: 1 / 1;
        }
        /* A PDF page's words, laid invisibly over its picture so they can be
           selected and copied (PDF.js's TextLayer, its own rules trimmed to
           what this app draws: no search highlights). Each span is placed and
           sized by the variables PDF.js writes; the page sets
           --total-scale-factor. The selection is the note's teal. */
        .pdf-text {
          position: absolute;
          inset: 0;
          overflow: clip;
          line-height: 1;
          text-align: initial;
          letter-spacing: normal;
          word-spacing: normal;
          text-size-adjust: none;
          forced-color-adjust: none;
          transform-origin: 0 0;
          z-index: 0;
          --min-font-size: 1;
          --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
          --min-font-size-inv: calc(1 / var(--min-font-size));
        }
        .pdf-text :is(span, br) {
          color: transparent;
          position: absolute;
          white-space: pre;
          cursor: text;
          transform-origin: 0% 0%;
          user-select: text;
        }
        .pdf-text > :not(.markedContent),
        .pdf-text .markedContent span:not(.markedContent) {
          z-index: 1;
          --font-height: 0;
          font-size: calc(var(--text-scale-factor) * var(--font-height));
          --scale-x: 1;
          --rotate: 0deg;
          transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
        }
        .pdf-text .markedContent {
          display: contents;
        }
        .pdf-text span[role="img"] {
          user-select: none;
          cursor: default;
        }
        .pdf-text ::selection {
          background: ${bandFill(theme.ACCENT.primary, theme.name)};
          color: transparent;
        }
        .pdf-text br::selection {
          background: transparent;
        }
        .source-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: transparent;
          color: ${theme.TEXT.primary};
          overflow: hidden;
        }
        .source-layer .md-mark { color: ${theme.TEXT.muted}; }
        .source-layer .md-meta { color: ${theme.TEXT.secondary}; }
        .source-layer .md-strong { font-weight: 600; }
        /* One toolbar on every code block (CodeBlock), top right: shown on
           the pointer or while the block has focus, held while its language
           menu is open. The language, then icons, copy always last; a diagram's
           \`</>\` sits between them, lit while its code is open, as the
           header's is for the Markdown view. */
        .code-tools {
          position: absolute;
          top: 4px;
          right: 4px;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 2px;
          opacity: 0;
          pointer-events: none;
          transition: opacity var(--motion-fast);
        }
        .code-block:hover .code-tools,
        .code-block:focus-within .code-tools,
        .code-tools-held {
          opacity: 1;
          pointer-events: auto;
        }
        .code-tool {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          height: 26px;
          min-width: 26px;
          padding: 0 6px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: ${theme.TEXT.muted};
          font: 500 12px 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          cursor: pointer;
          transition: background-color var(--motion-fast), color var(--motion-fast);
        }
        .code-tool svg { width: 15px; height: 15px; flex: none; }
        @media (hover: hover) {
          .code-tool:hover { background: ${theme.BG.hover}; color: ${theme.TEXT.primary}; }
        }
        /* The language, in the code's own quiet face. */
        .code-lang {
          font: 11.5px 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
          user-select: none;
        }
        .code-lang svg { width: 12px; height: 12px; }
        .code-lang-open { background: ${theme.BG.hover}; color: ${theme.TEXT.primary}; }
        .code-copied { color: ${theme.ACCENT.text}; }
        .code-show[aria-pressed="true"] {
          background: ${tagPillGround(theme)};
          color: ${theme.ACCENT.text};
        }
        @media (hover: hover) {
          .code-show[aria-pressed="true"]:hover { background: ${tagPillGround(theme, true)}; }
        }
        /* A \`\`\`mermaid block: its code above, growing open on the small
           clock; the drawing below on the code block's ground, a wide one
           shrunk to fit (\`fitToColumn\`), then scrolling. The scroller
           reaches the block's sides and bottom, so a drawing scrolls to the
           edge and the scrollbar sits on the border; the side padding is two
           spacers, which a scroller's own end padding wouldn't be. */
        .diagram-view {
          overflow-x: auto;
          cursor: text;
          margin: 0 -16px -14px;
          padding-bottom: 14px;
          border-radius: 0 0 7px 7px;
        }
        .diagram-render { display: flex; }
        .diagram-render::before, .diagram-render::after { content: ""; flex: none; width: 16px; }
        .diagram-render svg { display: block; flex: none; margin: 0 auto; width: calc(100% - 32px); }
        .diagram-code {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows var(--motion-enter) var(--ease-enter);
        }
        .diagram-code[data-open] { grid-template-rows: 1fr; }
        .diagram-code-inner { position: relative; min-height: 0; overflow: hidden; }
        .diagram-code[data-open] .diagram-code-inner {
          border-bottom: 1px solid ${theme.codeBlockBorder};
          margin: -28px -16px 14px;
          padding: 28px 16px 12px;
        }
        @media (prefers-reduced-motion: reduce) { .diagram-code { transition: none; } }
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
          margin: ${rhythm.blockGap}px 0;
        }
        @media (hover: hover) {
          .callout-icon-btn:hover {
            background: ${theme.calloutIconHover} !important;
          }
        }
        .callout-title[data-empty]::before {
          content: attr(data-placeholder);
          opacity: 0.35;
          pointer-events: none;
        }
        .callout-body[data-empty]::before {
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
           signal, as in a paragraph. */
        .table-outer {
          position: relative;
          outline: none;
        }
        /* Shrink before you scroll, the way Chrome's tabs do: auto layout
           shares the column's width between the columns in proportion to
           their content and wraps text, down to a 72px floor per cell (about
           six characters); only past that does the scroller take over. The
           240px minimum is the table's, not the cells', so an empty 2×2 still
           reads as a small grid while eight empty columns fit the column. */
        .table-block {
          width: auto;
          min-width: 240px;
          table-layout: auto;
          border-collapse: collapse;
          font-size: 14px;
        }
        /* One grid, one thickness: the cells' collapsed 1px borders are the
           whole grid, outer edge included (no border on the scroller, which
           would double the edge), and no rounded corners, as Obsidian's. */
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
        /* A row or column carried by its grip leaves an empty slot: the grid
           lines stay, its contents go (TableHandles). */
        .table-block .table-cell-lifted {
          color: transparent !important;
          caret-color: transparent;
        }
        .table-block .table-cell-lifted * { visibility: hidden; }
        /* The add-row and add-column boxes, Obsidian's: a bordered box the
           grid's height at its right edge and its width under its bottom
           edge, sharing the grid's own border line, with a Plus centred.
           Hidden at rest and shown only while the pointer is past that edge,
           on the box itself (reveal is CSS, never a JS hover state). */
        .table-add-bar {
          opacity: 0;
          transition: opacity var(--motion-fast);
          color: ${theme.TEXT.muted};
        }
        @media (hover: hover) {
          .table-add-bar:hover {
            opacity: 1;
            color: ${theme.TEXT.primary};
          }
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
          transition: color var(--motion-fast);
        }
        @media (hover: hover) {
          .frontmatter-header:hover { color: ${theme.TEXT.secondary}; }
        }
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
        /* The paragraph pitch (rhythm.paragraphGap): a soft break is
           line height alone, Enter adds this, an empty row adds a whole line.
           A paragraph after a list item is its own structure now (the file
           has a blank line between them) and gets the same gap above it,
           which the list's tight row padding does not give. */
        p[data-block-type="p"] {
          margin: 0 0 ${rhythm.paragraphGap}px;
        }
        [data-block-type="bullet"] + p[data-block-type="p"],
        [data-block-type="numbered"] + p[data-block-type="p"],
        [data-block-type="checkbox"] + p[data-block-type="p"] {
          margin-top: ${rhythm.paragraphGap}px;
        }
        .empty-block {
          position: relative;
        }
        /* Placeholder shows only while the note is one empty line: the
           first block holds no text (\`data-empty\`, kept by EditableBlock
           from the live DOM, so it hides on the keystroke, never the
           debounced block.text, which lingered) and no block follows it, so
           an empty first line above a written one carries no hint.
           Not \`:has(> br:only-child)\`: a soft break is one <br> too. */
        .empty-block[data-empty]:not(:has(~ [data-block-id]))::before {
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
           an empty heading is otherwise an invisible row. */
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
           never empties follows its text. The field fits
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
