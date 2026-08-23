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
| `BG.hover` | `#ECECEC` | **row/menu** hover AND selected |
| `BG.divider` | `#E9E9E9` | border (ink @ 8%) |

Text: `TEXT.primary` `#14110F` (18.3:1) / `TEXT.secondary` `#47403A` (9.9:1) / `TEXT.muted`
`#7A736C` (4.6:1). Accent `#2A737D` (5.3:1 on ground, 4.6:1 on a selected row) with
`ACCENT.onAccent` for text/icons sitting *on* an accent fill.

**Interaction grammar is two-tier:** content hovers to `BG.surface`; rows and menu items hover
*and* select to `BG.hover`, so hover previews selection. When adding a hover state, decide which of
the two it is.

**The accent is theme-scoped, and must stay that way.** `#A4CACE` (NIGHT) is ~1.7:1 on a light
ground — it is a dark-mode-only value. Never use one accent constant across both themes.

**Accent is never a desktop surface.** It's identity, focus rings, 2px markers, wikilinks, caret.
Desktop selected rows are neutral. Mobile note rows intentionally retain a compact accent-tinted
pill (`${accentColor}18` selected, `${accentColor}30` active) to make the current note clear in the
denser layout; this is fixed product styling, not a runtime option.

## Scrollbars: never set `scrollbar-width`/`scrollbar-color` globally

Chromium 121+ **ignores every `::-webkit-scrollbar-*` rule on any element that sets
`scrollbar-width` or `scrollbar-color`.** A `* { scrollbar-width: thin; scrollbar-color: ... }`
therefore silently killed the whole webkit block in Electron and Chrome for months — no hover
state anywhere, `.editor-scroll`'s hide-at-rest behaviour dead, `scrollbar.thumb`/`thumbHover`
dead tokens, and the intended 5px bar rendering as Chromium's ~11px `thin`. Nothing errored;
the CSS just stopped existing.

So the standard properties now live **only** inside `@supports not selector(::-webkit-scrollbar)`
— Chromium supports that selector and skips the block, Firefox doesn't and takes it. Don't hoist
them back out to a bare `*`.

The thumb is `12px` of track carrying a `7px` visible pill: a `2.5px solid transparent` border
plus `background-clip: padding-box` pads the *grab target* without thickening the ink (fractional
borders are exact on retina; a 1× display may round the two sides a device pixel unevenly). State
rules use `background-color`, never the `background` shorthand — the shorthand resets
`background-clip`, and the thumb jumps to full track width on hover.

**The sidebar bar is the same 7px pill, but hugging the divider** (judged live 2026-08-23):
`.sidebar-scroll::-webkit-scrollbar-thumb` re-splits the border 4px content-side / 1px edge-side,
so the ink's outer edge sits 1px off the divider instead of centred. The class lives on the one
sidebar scroller in `Sidebar.jsx` (see the sticky-actions note below — since 2026-08-23 a single
scroll container serves every sidebar state). It pairs with `ROW_INSET_RIGHT = 2`: tree pills keep
the 4px left inset but stop only 2px short of the scrollbar gutter. The action rows live inside
the same scroller now, so every pill shares one right boundary beside the gutter; the action
group's own right inset stays 4px against the tree pills' 2px — a 2px difference judged fine
live. With no overflow there is no gutter (accepted; `scrollbar-gutter: stable` is the fix
candidate if it ever grates).

Ramp is three steps, rest → hover → `:active` (drag): DAY `#E9E9E9` → `#C9C7C5` → `#A8A5A2`,
NIGHT `#3A3D4A` → `#4A4D5A` → `#5A5D6A`. DAY's `thumb` deliberately equals `BG.divider` — that is
the resting grey the app was *actually* rendering while the token was dead, and it was kept on
purpose; don't "restore" the old `#DCDBDB`. Sidebar and editor share one grammar (both visible at
rest); the old `.editor-scroll` hide-at-rest and the `.tab-scroll` rules (tabs are deleted) are
gone. `.editor-scroll` stays as a **class** — `CalloutBlock`, `TableContextMenu` and
`useSidebarDrag` query it as a DOM hook.

Styling `::-webkit-scrollbar` makes macOS bars non-overlay, so they take layout width: measured
12px, against 11px for the `thin` they replaced. Near-identical, but it is a real cost — check it
before widening the track.

### Known remaining leaks (not yet fixed)

- `theme.overlay(a)` returns `rgba(0,0,0,a)`, not ink-tinted; ~40 leaf tokens (`inlineCode`,
  `frontmatter`, `codeCopy`, `codeLang`, `codeSelection`, `wikilinkBroken`,
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
  reintroduce it in mocks. Sign-in, cloud sync, their backend and related UI were deleted — Git
  history is the parking lot; a returning sync feature gets rebuilt against the current Settings
  grammar rather than keeping dormant code in the product.
  `EditorTab` was deleted (git history) — its Updates half became `UpdatesTab.tsx`; spell check
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
  `useNoteStats` computes only the word and character counts that surface consumes.
- **`syncGeneration` is editor plumbing, not cloud sync**: it tells uncontrolled
  `contentEditable` blocks when to repaint from React state after structural or external-file
  changes. The cloud sync engine, secure credential IPC, sync animation CSS and `_syncVersion`
  metadata are deleted; don't remove the DOM repaint mechanism based on its name.
- The sidebar **drag handle is gated on `!collapsed`** — when it rendered unconditionally its 4px
  fill + 1px border left a hairline strip down the left edge instead of the sidebar disappearing.

Undo/redo still work — they're keyboard-only now (`useAppKeyboard.js`, Cmd/Ctrl+Z and
Cmd/Ctrl+Shift+Z). Cmd+Shift+\ (split) and Cmd+1/2 (pane switch) are gone with the feature.

## The panel toggle moves between states

The toggle is no longer pinned. **Expanded**: it lives in the sidebar's own header, top-right, 12px
in from the divider, opposite the wordmark. **Collapsed**: `EditorChrome` renders it fixed at the
viewport's top-left as before, guarded on `collapsed`. So it *does* jump position between states —
the earlier "must not move" rule was reversed because the expanded header reads more cleanly as
`wordmark … toggle`. `ChromeButton` is exported from `EditorChrome.jsx` so both sites share one
button.

## Sidebar primary actions (Picito row treatment)

`New note` / `Search` sit directly under the wordmark as plain rows: 32px tall, 12px radius, hover
to `BG.hover` with `TEXT.primary` ink. **Since 2026-08-23 the action group lives INSIDE the
sidebar's single scroll container as a `position: sticky` block** (opaque `chromeBg` ground,
zIndex 1): the scrollbar track spans from New note down, the actions never scroll away, and the
search field keeps one DOM position across search-mode flips so it cannot remount (and drop
focus) mid-typing — that no-remount guarantee is WHY every sidebar state shares one scroller;
don't split the branches back into per-state scrollers. Entering/leaving search resets scrollTop
(the old per-branch scrollers got that by remounting). Rows slide under the sticky block with no
separator — judged fine; a scrolled-only hairline is the fix if it ever reads smudgy. The whole desktop sidebar sits on a two-column alignment
system (2026-08-19, "option C"): `SPINE = 12` carries the wordmark, action icons, section header
labels and folder icons; `TEXT_COL = 34` carries every label — action labels, folder names AND
root note titles. Action glyphs run 18px in an 18px box with a 4px gap (folder glyphs 16px, 6px gap) — both anchor
their left edge on the spine so labels stay on TEXT_COL. Root note rows are text-only, so a 22px
empty gutter sits left of their titles;
that gutter is deliberate TEXT_COL alignment, not a missing icon — don't "fix" it. Tree rows are
30px pills (12px radius, 4px left inset / 2px right, 2px rhythm gap) with neutral `BG.hover` for
hover, selection and multi-select alike; the active note is `TEXT.primary` ink at **normal
weight** — the pill alone carries "active" (bold dropped, judged live 2026-08-23), never accent.
Mobile intentionally retains its accent-tinted selected-note pill AND its bold active title.
Section headers stay 13px/700 but in `TEXT.secondary`, one step quieter than row ink.

**Desktop note rows carry a trailing ··· action** (2026-08-23) opening the same note menu as
right-click, anchored `NOTE_MENU_GAP` (4px) below the row with its left edge `NOTE_MENU_SHIFT`
(8px) left of the button, growing rightward into the editor — both tunables sit with the row
constants in `Sidebar.jsx`; right-click keeps cursor placement. The 24px slot always renders so
the reveal never shifts the title; visibility is CSS (`.sidebar-note-more` in GlobalStyles):
hidden at rest and on a merely-selected row, muted on row hover/focus, primary ink when the dots
themselves are hovered. The row that opened the menu holds its pill and dots until it closes.
It is a `span role="button"` with `tabIndex={-1}` — a real button nested in the treeitem button
is invalid HTML and fails axe `nested-interactive`; the row stays the keyboard path. The single-
note menu items carry 16px nav-stroke glyphs (Pencil/Copy/Trash2, inheriting item ink so Delete's
goes red); folder and bulk menus stay text-only. A pointer-opened menu shows no focus ring on its
first item: `useFocusTrap` takes `initialFocus: "container"` and ContextMenu parks initial focus
on the menu container (`tabIndex={-1}`, `outline: none`) — Chromium treats script focus as
`:focus-visible`, which used to ring "Rename" on every ···-click. Keyboard Tab/arrows still move
real focus and indicate normally.
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

**Both headers always show** — `Folders` because it carries the only desktop affordance for creating
one, `Notes` because it is both the visible root drop target and the home of the sort control, and
both are wanted precisely when every note has been filed into a folder. The one case `Notes` hides
is a search that matches no root note. (`Notes` used to hide whenever there were no loose root
notes; that reversed when the sort control moved onto it.) The `role="tree"` under it stays
conditional — an empty tree fails axe's `aria-required-children`. This replaced an earlier
zero-folder gap hack (16 → 24px); a labelled section does that job properly.

## Note order is a preference, not a stored arrangement

One control decides how every note list in the panel is ordered — root notes and folder contents
alike. `Most recent` (Clock3) / `Alphabetical` (ArrowDownAZ), global, persisted in
`boojy-note-sort`, defaulting to recency. It sits on the `Notes` header as a **click-to-flip
toggle** (judged live 2026-08-23 — two modes made the old `SortMenu` popover pure ceremony;
SortMenu is deleted, git history has it). Convention, deliberate: the glyph shows the CURRENT
mode, the tooltip/aria-label's tail says what a click does ("Sorted by most recent — switch to
alphabetical"). If a third sort mode ever lands, the toggle breaks and a menu returns — that is
the accepted bet, not an oversight.

**"Most recent" is last *touched*: `max(last opened here, file mtime)`** — `recencyOf()` in
`utils/noteSort.js`. Neither half works alone, and the reason is worth keeping. Opening a note never
writes to disk, so mtime alone can't see reading. And last-opened alone starts *empty* on any
existing vault, which meant "Most recent" and "Alphabetical" produced identical lists until you had
clicked around — judged live 2026-08-22, and it reads as a broken control, not as a quiet default.
mtime is what gives a vault meaningful order on first launch, and it is the only half that can see
an edit made in another app.

`parseNoteFile` populates `lastModified` (one `statSync` on a file it is already reading). Until
2026-08-22 that field was a **phantom**: declared in `types/notes.ts` and read by `search.js` as a
score tiebreak, but never written by anything, so that comparison was always 0 against 0. Populating
it fixed search's tiebreak as a side effect. **Web has no filesystem and therefore no mtime**, so
web notes still rely on last-opened alone.

Last-opened lives in `boojy-note-opened` (localStorage), never in the user's files — stamping a file
on open would corrupt the very mtime the sort depends on. Consequences worth knowing: that half is
per-machine, and a vault opened elsewhere regenerates note IDs, so it starts over — but mtime
carries the order in the meantime, so a moved vault no longer looks unsorted. Notes with **neither**
timestamp sort alphabetically at the back.

A pure `touch` with no content change does *not* refresh the order: `onFileChanged` in
`useFileSystem.js` bails early when blocks, title and folder all match, which is deliberate
anti-churn. Boojy's own writes don't refresh it either, and don't need to — the note you are editing
was stamped by `openNote` when you opened it, and disk mtime catches up on the next load.

`useNoteSort` prunes the map against the live note store when it writes, rather than hooking the
delete paths: one rule covers deletions, files removed outside Boojy, and regenerated IDs. **The
empty-store guard in that effect is load-bearing** — `noteData` is `{}` until notes finish loading,
and writing then would erase every timestamp on launch.

Recency is stamped in `openNote` (BoojyNotes) **and** in `useNoteCrud`'s `createNote` /
`duplicateNote` / `createDraftNote`. Miss the creation sites and a note you just made sorts into
the never-opened tail — a new "Zebra" lands at the bottom of "Most recent". Any future site that
makes a note active needs the same stamp.

`buildTree` takes an optional `sortNotes`; `sortNoteIds` returns the **same array reference** when
the order is already correct, because the sidebar's memo chain compares identities to decide
whether to rebuild the tree. In `SidebarContext` the comparator reads titles from `noteDataRef`,
not from `noteData` in the dep list — depending on the store directly would rebuild the tree on
every keystroke and undo the text-only bail-out. Alphabetical mode deliberately does not subscribe
to the timestamps, so opening a note doesn't re-sort a list that can't change.

### Drag means location, not order

Dragging a note moves the **real `.md` file**: onto a folder row files it there, onto the
`Notes`/root area moves it back out. It never sets a hand-arranged position — sort decides
display order, drag decides where the note lives. Folders are always alphabetical, with no
control to change that.

**Folder rows are not draggable at all.** The sibling-reorder half retired with manual ordering,
and the nest/reparent half never existed — dropping a folder onto a folder highlighted the
target and then silently did nothing. Genuine folder nesting is a future feature, not a
regression to restore.

Existing `.boojy-meta.json` files are **left untouched on disk**. Nothing reads or writes their
`noteOrder`/`folderOrder` keys any more, so an old arrangement stays recoverable — don't "tidy
them up", and don't reintroduce a reader for them.

## Section-header controls: hidden at rest, revealed by the header

`SectionAction` in `Sidebar.jsx` is the one component for a header's trailing control (New folder,
Sort): 28px box, 16px nav-tier glyph. Since 2026-08-23 it follows the note-row ··· grammar —
**invisible at rest**, revealed at 0.55 by hovering the header (`.sidebar-section-header`) or by
keyboard focus (`:focus-within`), lifted to full `TEXT.primary` ink + `BG.surface` when the
control itself is hovered/focused. All states are CSS (`.sidebar-section-action` in GlobalStyles)
— don't reintroduce JS opacity handlers, they permanently override the class rules after first
hover. Touch devices keep the controls always visible (`@media (hover: hover)` guards the hiding).
An open menu holds its control at full ink via the `active` prop (inline opacity beats the class).
This reversed the earlier "quiet, never hidden" rule; what that rule actually protected — keyboard
reachability — is preserved, because focus always reveals. The 0.55 revealed ink keeps its old
rationale: the faintest composite clearing ~3:1 on the DAY ground (0.4 does not). Known tradeoff,
accepted single-user: a mouse user gets no standing hint that New folder exists until they hover a
header.

## Only structure and actions get a glyph

Note rows carry **no file icon** at any depth — the repeated document glyph was ~13 of the ~30
glyphs on screen and communicated nothing the row's position didn't already. Folders now carry
**only the folder icon**: the permanent disclosure chevron was removed too (2026-08-18) — the
whole row toggles, the open-folder glyph + indented children carry the state, and
`aria-expanded` is always set (it's the only programmatic signal left). Collapsed vs expanded has
no other permanent indicator and no hover chevron; the calm row is the settled treatment. The removed FileIcon's
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

## Narrow desktop is still desktop

**Width changes how much room Boojy has, not what Boojy is.** A narrow desktop window must never
become the phone layout: the mobile navigation model is a *touch-device* thing, not a width
thing. One overloaded boolean was split into three separate questions — is this a touch device,
does the sidebar fit, is the sidebar open. Below ~780px the sidebar floats *over* the editor as
an overlay; that is the app making room, not switching identity.

Consequence for dev work: **narrowing a desktop browser no longer previews the mobile layout.**
Use DevTools device emulation, which emulates pointer type.

`useIsMobile.ts` is misnamed for what it now answers ("is this a touch device"); `useSidebarFits.ts`
carries the fit question. The rename to `useIsTouch` is outstanding — see `docs/BACKLOG.md`.

## Testing note

`TopBar.test.jsx` now asserts the desktop bar renders *nothing*; the controls that moved are covered
in `EditorChrome.test.jsx` (which asserts the toggle is absent when expanded and pinned left when
collapsed) and `Sidebar.test.jsx` (header toggle + action rows + direct wordmark-to-Settings +
no-chevron assertions). Navigation state is covered by `useActiveNote.test.js` (migration rule)
and `useAppPersistence.test.js` (write shape); `osTrash.test.ts` covers conservative legacy
migration and managed-file-only deletion. The e2e settings flow clicks
`wordmark-settings-button` directly. `SlashMenu.test.jsx` guards the keyboard-first selection
against stationary-pointer hover. `Sidebar.test.jsx`'s sort tests assert the toggle (flip both
ways, no menu role) and its header-control test asserts the CSS reveal hooks (class names +
tabIndex 0), not computed opacity — jsdom can't evaluate the GlobalStyles stylesheet. Its
note-row test allows the row's ··· svg and forbids only `lucide-file-text`. Theme-mocking tests need `ACCENT.onAccent` in their mock or components using it throw;
the `activeTabBg` token and `settingsTab` context field no longer exist — don't reintroduce
either in mocks.
