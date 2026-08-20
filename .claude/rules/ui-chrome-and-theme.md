# UI chrome, theme tokens and icons

Durable conventions + live gotchas for the visual layer. Read before touching `themes.js`,
`Icons.jsx`, the top bar, or anything that paints a surface.

## The light theme is `DAY`, and it is NOT the old blue-sky theme

`DAY` is the first-run fallback only when `boojy-theme` has no saved `themeMode`. Existing saved
`day`, `night` and `auto` choices always win.

`DAY` used to be a saturated sky-blue theme with a **gold** accent (`#E8C020`) — a near-collision
with sibling app Picito's brand gold. It was replaced with a neutral, warm-biased light palette
using Picito's neutral ramp as the family reference, keeping Boojy's cyan identity.

Surface roles (`DAY`), in the order light → dark. **Use them by role, not by "which grey looks
right"** — the previous eight-greys-named-by-darkness scheme is what made every region read as a
separate boxed panel:

| Token | Light | Role |
|---|---|---|
| `BG.editor` | `#FFFFFF` | the writing sheet |
| `BG.elevated` | `#FFFFFF` | raised: menus, popovers, modals |
| `BG.darkest` | `#FCFCFC` | app ground |
| `BG.dark` | `#F9F9F9` | chrome: mobile toolbar, slash-menu chips |
| `BG.standard` | `#F9F9F9` | sidebar |
| `BG.surface` | `#F4F4F5` | **content** hover |
| `BG.hover` | `#ECECEC` | **row/tab** hover AND selected |
| `BG.divider` | `#E9E9E9` | border (ink @ 8%) |

Text: `TEXT.primary` `#14110F` (18.3:1) / `TEXT.secondary` `#47403A` (9.9:1) / `TEXT.muted`
`#7A736C` (4.6:1). Accent `#2A737D` (5.3:1 on ground, 4.6:1 on a selected row) with
`ACCENT.onAccent` for text/icons sitting *on* an accent fill.

**Interaction grammar is two-tier:** content hovers to `BG.surface`; rows, tabs and menu items hover
*and* select to `BG.hover`, so hover previews selection. When adding a hover state, decide which of
the two it is.

**The accent is theme-scoped, and must stay that way.** `#A4CACE` (NIGHT) is ~1.7:1 on a light
ground — it is a dark-mode-only value. Never use one accent constant across both themes.

**Accent is never a surface.** It's identity, focus rings, 2px markers, wikilinks, caret. Selected
rows are neutral. The one live exception is the sidebar's `selectionStyle` A/B setting, which still
tints selection with `${accentColor}15/30` — a deliberate, pending-judgement divergence.

### Known remaining leaks (not yet fixed)

- `theme.overlay(a)` returns `rgba(0,0,0,a)`, not ink-tinted; ~40 leaf tokens (`inlineCode`,
  `tableTh`, `frontmatter`, `codeCopy`, `codeLang`, `codeSelection`, `wikilinkBroken`,
  `calloutIconHover`) still use their own `rgba(0,0,0,…)` literals instead of routing through it.
- Callout (11 × 3 values) and syntax (8) colours are still hand-picked per theme, not derived.
- `StarField.jsx` hardcodes `#FFFFFF` ×8, so the starfield can't work on a light ground
  (`DAY.starField: false` keeps it dormant).
- `Toast.tsx` and the `danger` branch of `ConfirmDialog` keep `color: "#fff"` — text on SEMANTIC
  status colours, deliberately out of the accent scope.

`src/constants/colors.js` (a dead duplicate of NIGHT's palette) was deleted in the 2026-08-19
dead-code sweep — `themes.js` is the only colour authority.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react` behind the historic export names, so call sites keep
`<SearchIcon />`, `<FolderIcon open …/>`, `<FileIcon active …/>` etc. Sizes are two-tier (judged
live 2026-08-19, "icon system C"): **16px** repeated list glyphs (folder rows, search results, menu
items) and **18px** navigation tier — the New note / Search action glyphs AND the standalone
controls (panel toggle, editor ···, `ICON_CONTROL`); mobile top-bar controls stay 20px explicitly.
Stroke is also two-tier: **1.5** for editor/content icons (Lucide's default 2 reads busy at 16px
among prose) and **2** (`navBase` / `ICON_STROKE_NAV`) for navigation chrome — Search, NewNote,
NewFolder, Folder, SidebarToggle and MoreHorizontal (···) — the heavier stroke balances nav icons
against their 14px labels. Control hit boxes are **32px** (`CHROME_BTN`; toggle + ···) and the New
Folder header button is 28px filling its 28px header. Always `currentColor`. Don't flatten the
tiers in either direction: rendered line weight is `stroke × size/24`, so equal strokes at equal
sizes is what keeps the ink uniform.

This replaced 19 hand-rolled SVGs drawn at **seven sizes and six stroke weights** — that
inconsistency, not the glyph shapes, is what made the UI read as assembled. Don't reintroduce a
hand-drawn icon unless Lucide genuinely lacks it.

Icons inherit colour from the parent's `color`. If you place one in a container that sets no `color`,
set one — `SearchIcon` (sidebar search) and `BreadcrumbChevron` (EditorArea) each needed an explicit
`color: TEXT.muted` on their wrapper for this reason.

## Minimal chrome + single-active-note — CURRENT STATE

There is **no desktop top bar**, and as of the single-active-note refactor (2026-08-18) there are
**no tabs and no split view at all**. Navigation state is one string: `useActiveNote` in
`src/hooks/useActiveNote.js`; opening a note replaces the current one. `useSplitView`, `useTabDrag`,
`PaneContainer`, `PaneTabBar`, `TopBarDesktop`, `SplitDivider` and `tabBarHitTest` are **deleted**
(git history has them) — restoring tabs means reverting that refactor, not remounting a component.

Things a future change will trip over:

- **Persistence migration lives in `resolveInitialActiveNote()`** (`useActiveNote.js`): old
  `boojy-ui-state` blobs with `splitState`/`tabs` are still read — active pane's note wins,
  left/top/right/bottom fallback — but only `{ activeNote, expanded }` is written now. Don't
  "clean up" the read side; it's three lines and keeps old installs safe forever.
- **Cmd-click on a wikilink = plain click** (it used to open a split). `handleWikilinkCmdClick`
  is an alias of `handleWikilinkClick` in `useWikilinkHandlers.js`.
- **Deleting the open note lands on an empty draft** (desktop) or the sidebar (mobile) — there is
  no tab list to fall back to. A back-history / Recents / Quick Open is a candidate follow-up,
  not built.
- **Sidebar drag onto the editor opens the note** — the tab-bar-insert and edge-split drop
  branches are gone from `useSidebarDrag.js`.
- **Help is unreachable.** `HelpDropdown.jsx` was deleted in the 2026-08-19 dead-code sweep;
  git history has its curated shortcut-reference content (the `SECTIONS` data) if Help returns —
  re-verify the shortcuts against `useAppKeyboard` before reusing it. Settings ends in a one-line
  version/credit footer, no Help.
- **The wordmark opens Settings directly**: clicking the sidebar wordmark calls
  `setSettingsOpen(true)` (testid `wordmark-settings-button`). There is no app-level dropdown,
  separate About destination or Recently Deleted surface.
- **Settings is a single pane** (`settings/SettingsModal.jsx`): Appearance + (desktop) Storage +
  Updates + quiet version footer. `settingsTab` no longer exists in `SettingsContext` — don't
  reintroduce it in mocks. The parked sign-in/sync surface (`ProfileTab.jsx`, `OnboardingToast`,
  `PersistenceWarning`, `useWebNags`) was deleted in the 2026-08-19 dead-code sweep — git history
  is the parking lot; a returning sync UI gets rebuilt against the current Settings grammar.
  `EditorTab` was deleted (git history) — its Updates half became `UpdatesTab.jsx`; spell check
  has no UI but still applies from the stored Electron setting, and UI scale is
  keyboard-only (`Cmd+Plus/Minus/0` in `useAppKeyboard`).
- **Delete follows the platform**: Electron sends each indexed Boojy-managed `.md` file to the
  OS Trash/Recycle Bin; web deletion remains permanent behind confirmation. Folder deletion never
  removes or trashes the physical folder, so unsupported sibling files stay put. The retired private `.trash`
  gets one conservative startup migration: recognized notes are copied under readable,
  collision-safe names before the OS-trash operation, and the legacy source is removed only after
  that succeeds. Ambiguous/failed contents remain untouched and trigger a native warning — shown
  once per distinct problem set (`legacyTrashWarnedSignature` in settings.json), not per launch;
  OS cruft (`.DS_Store` etc.) is ignored outright. Deleting a note that never reached disk is a
  benign no-op (`missing: true` from `trash-note`), and the watcher's unlink suppression is
  event-consumed, not timed, so a slow OS trash move can't fire a spurious `file-deleted`.
- **Word count is desktop-gone**, still present on mobile via `EditorMoreMenu`.
  `useNoteStats` still computes `charCountNoSpaces` / `readingTime`, which now have no consumer.
- The sidebar **drag handle is gated on `!collapsed`** — when it rendered unconditionally its 4px
  fill + 1px border left a hairline strip down the left edge instead of the sidebar disappearing.

Undo/redo still work — they're keyboard-only now (`useAppKeyboard.js`, Cmd/Ctrl+Z and
Cmd/Ctrl+Shift+Z). Cmd+Shift+\ (split) and Cmd+1/2 (pane switch) are gone with the feature.

## The panel toggle moves between states (deliberate, pending judgement)

The toggle is no longer pinned. **Expanded**: it lives in the sidebar's own header, top-right, 12px
in from the divider, opposite the wordmark. **Collapsed**: `EditorChrome` renders it fixed at the
viewport's top-left as before, guarded on `collapsed`. So it *does* jump position between states —
the earlier "must not move" rule was reversed on purpose to test whether the expanded header reads
cleaner as `wordmark … toggle`. `ChromeButton` is exported from `EditorChrome.jsx` so both sites
share one button. `CHROME_LEFT_GUTTER` is now unused, kept only for the revert path.

## Sidebar primary actions (Picito row treatment)

`New note` / `Search` sit directly under the wordmark as plain rows: 32px tall, 12px radius, hover
to `BG.hover` with `TEXT.primary` ink. The whole desktop sidebar sits on a two-column alignment
system (2026-08-19, "option C"): `SPINE = 12` carries the wordmark, action icons, section header
labels and folder icons; `TEXT_COL = 34` carries every label — action labels, folder names AND
root note titles. Action glyphs run 18px in an 18px box with a 4px gap (folder glyphs 16px, 6px gap) — both anchor
their left edge on the spine so labels stay on TEXT_COL. Root note rows are text-only, so a 22px
empty gutter sits left of their titles;
that gutter is deliberate TEXT_COL alignment, not a missing icon — don't "fix" it. Tree rows are
30px pills (12px radius, 4px side insets, 2px rhythm gap) with neutral `BG.hover` for hover,
selection and multi-select alike; the active note is weight + `TEXT.primary` ink, never accent. On
desktop this supersedes the `selectionStyle` A/B accent tints (mobile still uses them). Section
headers stay 13px/700 but in `TEXT.secondary`, one step quieter than row ink.
The desktop search *pill* is gone — clicking the Search row swaps it in place for the field at the
same geometry. `New Note` at the foot of the tree is now mobile-only. The rest of the sidebar
(note rows) still uses the older tree grammar, so the two grammars coexist.

## Sidebar sections: `Folders` and `Notes`

The desktop tree is split by two section headers sharing one `SectionHeader` component in
`Sidebar.jsx`: **`Folders`** (with a trailing `FolderPlus` — this is where New Folder lives now,
the old `+ New Folder` tree row is mobile-only) and **`Notes`** over the loose root notes, with no
trailing action because New note is already a primary row. Neither collapses, so neither has a
chevron. One spacing rule for both: **12px above the header, 28px header, 4px down to its first
row** — `Folders` takes its 12px from the action group's bottom padding. Both headers scroll with
their content rather than being pinned above it; a pinned `Folders` goes on lying about the rows
under it once the list scrolls.

**The desktop sidebar has TWO trees, not one** — `role="tree" aria-label="Folders"` and
`role="tree" aria-label="Notes"` — with the headers as siblings between them, inside the plain
scroll container. A section header (and the New folder `<button>` inside one) is not a legal child
of `role="tree"`: a single tree fails axe's `aria-required-children` at **critical** impact, which
the Playwright a11y gate in `e2e/app.spec.js` catches. Mobile has no headers, so it keeps one tree
wrapping its own inline `New Folder` / `New Note` rows. `sidebarScrollRef` and the pointer-down
handler stay on the outer scroller, so `useSidebarDrag`'s `[data-note-id]` queries are unaffected.

`Notes` hides when there are no loose root notes; `Folders` always shows, since it carries the only
desktop affordance for creating one. That pair of rules replaced an earlier zero-folder gap hack
(16 → 24px) — a labelled section does that job properly.

## Only structure and actions get a glyph

Note rows carry **no file icon** at any depth — the repeated document glyph was ~13 of the ~30
glyphs on screen and communicated nothing the row's position didn't already. Folders now carry
**only the folder icon**: the permanent disclosure chevron was removed too (2026-08-18) — the
whole row toggles, the open-folder glyph + indented children carry the state, and
`aria-expanded` is always set (it's the only programmatic signal left). Deliberate experiment:
collapsed vs expanded has no other permanent indicator, and no hover chevron yet — judge the
calm version first; the revert path is commented at the render site. The removed FileIcon's
width is still folded into each note row's left padding, minus the chevron allowance that came
back out of both row kinds, so titles keep their column under the folder names — don't
"simplify" that padding away. `FileIcon` still ships in search results, which are not tree rows.

## The slash menu is tiered

`/` opens on **eleven** commands, not fourteen. `advanced: true` in `SLASH_COMMANDS` keeps
Callout, File attachment and Embed note off that opening screen; the moment anything is typed after
the slash, the search runs over **everything**, so `/call` still finds Callout. Nothing was deleted
— the tier only decides what greets a new user.

**The tier rule lives in one place: `filterSlashCommands()` in `constants/data.js`.** Both
`SlashMenu.jsx` and the arrow-key navigation in `useKeyboardHandlers.js` call it. They used to carry
duplicate `.filter()` calls, which is how you get Enter inserting a different block than the one
highlighted — never reintroduce a second copy.

Order is deliberate and is the menu's only structure (no group labels at eleven rows): headings,
lists, then **Table and Image** — the two commands with no typed-markdown shortcut in
`useInputHandler.js`, which makes the menu their only comfortable route — then code and quote, with
**Divider last** because `---` is faster to type than the menu is to open. Ten of the fourteen
commands have live typed shortcuts (`# `, `## `, `### `, `- `, `1. `, `[] `, `> `, `---`, ```` ``` ````),
so weigh that before promoting anything.

Rows are 34px (20px glyph + 7px above/below) in a 300px menu: **bare Lucide glyph** in a 20px
column, muted at rest and accent when selected, no chip, no border, and no markdown-syntax column.
`desc` still records each block's markdown in the data — it is just not rendered. The shadow is
`theme.modalShadow`; it used to be a hardcoded `0 8px 32px rgba(0,0,0,0.5)`, a NIGHT value that
bruised the white DAY sheet.

Positioning is viewport-aware (2026-08-18): `positionMenu()` in `src/utils/menuPosition.js` +
`useMenuPosition` give SlashMenu, ContextMenu (incl. the top-right ··· note-actions menu) and
any future popover one rule set — honour the anchor, 8px viewport margin, flip past the anchor's
other side when the preferred side overflows, clamp as the last resort. The slash producer passes
the block's full rect so a flipped menu sits above the line, not over it. Route new menus through
this instead of writing a fresh clamp.

Slash-menu selection is keyboard-first: opening `/` and changing its filter reset to index `0`.
Rows update that selection on actual mouse movement, not `mouseenter`; a newly mounted or flipped
menu can appear beneath a stationary pointer, which must not steal the initial Heading 1 selection.

## Testing note

`TopBar.test.jsx` now asserts the desktop bar renders *nothing*; the controls that moved are covered
in `EditorChrome.test.jsx` (which asserts the toggle is absent when expanded and pinned left when
collapsed) and `Sidebar.test.jsx` (header toggle + action rows + direct wordmark-to-Settings +
no-chevron assertions). Navigation state is covered by `useActiveNote.test.js` (migration rule)
and `useAppPersistence.test.js` (write shape); `osTrash.test.ts` covers conservative legacy
migration and managed-file-only deletion. The e2e settings flow clicks
`wordmark-settings-button` directly. `SlashMenu.test.jsx` guards the keyboard-first selection
against stationary-pointer hover. Theme-mocking tests need `ACCENT.onAccent` in their mock or components using it throw;
the `activeTabBg` token and `settingsTab` context field no longer exist — don't reintroduce
either in mocks.
