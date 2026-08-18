# UI chrome, theme tokens and icons

Durable conventions + live gotchas for the visual layer. Read before touching `themes.js`,
`Icons.jsx`, the top bar, or anything that paints a surface.

## The light theme is `DAY`, and it is NOT the old blue-sky theme

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

`src/constants/colors.js` is dead (zero importers) and duplicates NIGHT's palette as standalone
exports. **Don't import from it** — anything that does becomes theme-blind. It should be deleted.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react` behind the historic export names, so call sites keep
`<SearchIcon />`, `<FolderIcon open …/>`, `<FileIcon active …/>` etc. Rules: **16px** inline
(sidebar rows, menu items), **20px** standalone controls, **stroke 1.5** (Lucide's default 2 reads
busy at 16px in a writing app), always `currentColor`.

This replaced 19 hand-rolled SVGs drawn at **seven sizes and six stroke weights** — that
inconsistency, not the glyph shapes, is what made the UI read as assembled. Don't reintroduce a
hand-drawn icon unless Lucide genuinely lacks it.

Icons inherit colour from the parent's `color`. If you place one in a container that sets no `color`,
set one — `SearchIcon` (sidebar search) and `BreadcrumbChevron` (EditorArea) each needed an explicit
`color: TEXT.muted` on their wrapper for this reason.

## Minimal-chrome experiment — CURRENTLY LIVE, and it breaks things

There is **no desktop top bar**. `TopBar.jsx` returns `null` for desktop; `TopBarDesktop.jsx` and
`PaneTabBar.jsx` are intentionally **left on disk, unmounted** so the strip can be restored in one
line. Tab/pane *state* is untouched and still live in `BoojyNotes.jsx`.

Consequences a future change will trip over:

- **Drag-to-tab-bar is dead.** `findTabBarUnderCursor` queries `[data-pane-tab-bar]`, which no longer
  exists in the DOM, so `useTabDrag.js` and `useSidebarDrag.js` always take the null branch. Tab
  reorder, drag-into-a-specific-pane, and Option+drag duplicate silently do nothing.
- **Edge-drag split is disabled** (2026-08-18): `EDGE_SPLIT_ENABLED = false` in
  `useSidebarDrag.js` — dragging a note to an editor edge now just opens it. It used to create a
  split with no per-pane UI to show or undo it. `useSplitView` and the wikilink "open in split"
  path are untouched; flip the flag to restore edge-drop. Split view is parked per
  `docs/PHILOSOPHY.md`.
- **There is no way to close a note.** The `×` lived on the tab and there is no Cmd+W binding in
  `useAppKeyboard.js`. Tabs accumulate invisibly.
- **Help is unreachable.** The `?` was its only entry point; `HelpDropdown.jsx` is unmounted, and
  Settings has an About tab but no Help.
- **Word count is desktop-gone**, still present on mobile via `EditorMoreMenu`.
  `useNoteStats` still computes `charCountNoSpaces` / `readingTime`, which now have no consumer.
- The sidebar **drag handle is gated on `!collapsed`** — when it rendered unconditionally its 4px
  fill + 1px border left a hairline strip down the left edge instead of the sidebar disappearing.

Undo/redo still work — they're keyboard-only now (`useAppKeyboard.js`, Cmd/Ctrl+Z and
Cmd/Ctrl+Shift+Z). Only the buttons were removed.

## The panel toggle moves between states (deliberate, pending judgement)

The toggle is no longer pinned. **Expanded**: it lives in the sidebar's own header, top-right, 12px
in from the divider, opposite the wordmark. **Collapsed**: `EditorChrome` renders it fixed at the
viewport's top-left as before, guarded on `collapsed`. So it *does* jump position between states —
the earlier "must not move" rule was reversed on purpose to test whether the expanded header reads
cleaner as `wordmark … toggle`. `ChromeButton` is exported from `EditorChrome.jsx` so both sites
share one button. `CHROME_LEFT_GUTTER` is now unused, kept only for the revert path.

## Sidebar primary actions (Picito row treatment)

`New note` / `Search` sit directly under the wordmark as plain rows: 32px tall, 12px radius, fixed
32px centred icon column, 8px left / 3px right inset, hover to `BG.hover` with `TEXT.primary` ink.
The desktop search *pill* is gone — clicking the Search row swaps it in place for the field at the
same geometry. `New Note` at the foot of the tree is now mobile-only. The rest of the sidebar
(note rows, Trash) still uses the older tree grammar, so the two grammars coexist.

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
glyphs on screen and communicated nothing the row's position didn't already. Folders keep chevron +
icon because those mean "this opens" and "this contains"; indentation alone distinguishes a nested
note. The removed glyph's width is folded into each note row's left padding (+21 desktop / +29
mobile) so titles keep their column under the folder names — don't "simplify" that padding away.
`FileIcon` still ships in search results and the trash list, which are not tree rows.

Childless folders' chevron placeholder is `ICON_INLINE` (16px), matching a real chevron; it was
14px, which left those rows 2px out of column.

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

Known gap: `SlashMenu` positions at `slashMenu.rect.top` with **no viewport clamp or flip**, so a
`/` near the bottom of the window still opens a menu that runs off-screen. Eleven rows (~390px)
makes it rarer than fourteen (~516px) did; it does not fix it.

## Testing note

`TopBar.test.jsx` now asserts the desktop bar renders *nothing*; the controls that moved are covered
in `EditorChrome.test.jsx` (which asserts the toggle is absent when expanded and pinned left when
collapsed) and `Sidebar.test.jsx` (header toggle + action rows). Theme-mocking tests need
`ACCENT.onAccent` in their mock or components using it throw.
