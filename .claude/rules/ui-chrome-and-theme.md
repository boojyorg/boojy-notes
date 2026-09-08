# UI chrome, theme and icons

Design intent and the non-obvious constraints of the visual layer. The code owns the exact
implementation; this file owns the rules a change must not break, and, where a rule looks like
a mistake, the one reason it is deliberate. History is in git and `CHANGELOG.md`.

## Theme and colour

`src/constants/themes.js` is the only colour authority. Never hardcode a hex in a component.

- **Product terminology is Light / Dark / System.** The stored preference keys stay
  `day` / `night` / `auto`, and the theme objects stay `DAY` / `NIGHT`; renaming either would
  orphan saved preferences for no user benefit. Copy changes, keys don't. System (`auto`)
  follows the OS appearance and nothing else; the time-of-day schedule that used to sit under
  it was removed on 2026-09-05, and a saved `autoMethod` is ignored.
- Light is the first-run default when nothing is saved; a saved choice always wins.
- Electron's first-paint `backgroundColor` is Light's ground, so a Dark user sees one brief
  light flash at launch. Wiring the saved theme back to the main process is the fix if it ever
  grates.
- The palettes are neutral, with sibling app Picito's neutral ramp as the family reference and
  Boojy Notes' cyan as its own identity. Don't introduce gold; it is Picito's brand accent.
- There is no decorative background. The Dark star field was removed on 2026-09-05 (git has
  it, tag-free); the editor ground is the theme's `BG.editor` and nothing else.

**Surface roles, Light, in order light → dark.** Use them by role, not by which grey looks
right; naming greys by darkness is what makes every region read as a separate boxed panel.

| Token | Role |
| --- | --- |
| `BG.editor` | the writing sheet |
| `BG.elevated` | raised: menus, popovers, modals |
| `BG.darkest` | app ground |
| `BG.dark` | chrome: mobile toolbar, slash-menu chips |
| `BG.standard` | sidebar |
| `BG.surface` | **content** hover |
| `BG.hover` | **row/menu** hover AND selected |
| `BG.divider` | border, ink at 8% |

Text is three steps (`TEXT.primary` / `secondary` / `muted`), all clearing AA on the ground;
`ACCENT.onAccent` is for anything sitting on an accent fill (the Updates "Restart & Update"
button and the auto-update switch's on-state knob were hardcoded white until 2026-09-07,
unreadable on Dark's pale accent; the off-state knob is `TEXT.secondary`, since a white dot on
the 6% track was invisible in Light).

- **Interaction grammar is two-tier.** Content hovers to `BG.surface`; rows and menu items
  hover *and* select to `BG.hover`, so hover previews selection. Every new hover state is one
  or the other.
- **Accent is theme-scoped.** Dark's accent is illegible on a light ground. Never share one
  accent constant across themes.
- **Accent is never a desktop surface.** It is identity, focus rings, 2-3px markers, wikilinks
  and the caret. Desktop selected rows are neutral. The one sanctioned tint is the selected
  divider's band, a transient selection state and closer to a focus ring than a surface: accent
  at 10% in Light, 18% in Dark, judged 2026-09-05 against a recoloured rule (which read as "a
  styled line", not "a selected object") and a neutral `BG.hover` band (which swallowed the
  rule, two greys three steps apart). Mobile note rows keep a compact
  accent-tinted pill because the denser layout needs it; that is fixed styling, not an option.

Known leaks, not yet fixed: `theme.overlay()` and about forty leaf tokens use plain black
alphas rather than ink-tinted ones; callout and syntax colours are hand-picked per theme;
`Toast` and the danger `ConfirmDialog` keep `#fff` on semantic status colours, deliberately
outside the accent scope; `UpdatesTab` no longer does.

## Scrollbars

- **Never set `scrollbar-width` or `scrollbar-color` on a bare selector.** Chromium ignores
  every `::-webkit-scrollbar-*` rule on an element that sets either, silently. The standard
  properties live only inside `@supports not selector(::-webkit-scrollbar)`, which Chromium
  skips and Firefox takes.
- The thumb is a slim pill inside a wider transparent-bordered track (`background-clip:
  padding-box`), so the grab target is generous without thickening the ink. State rules set
  `background-color`, never the `background` shorthand, which resets the clip and makes the
  thumb jump to full width.
- Sidebar and editor share one grammar, visible at rest with a three-step rest → hover →
  drag ramp per theme. The sidebar thumb hugs the divider (asymmetric border split), pairing
  with tree pills that stop 2px short of the gutter. No overflow means no gutter; accepted,
  `scrollbar-gutter: stable` is the fix if it grates.
- `.editor-scroll` stays as a class: `CalloutBlock`, `TableContextMenu` and `useSidebarDrag`
  query it as a DOM hook.
- Styled webkit bars are non-overlay on macOS and take layout width. Check that before widening
  the track.

## Icons: Lucide only

`src/components/Icons.jsx` wraps `lucide-react` behind the historic export names. Always
`currentColor`. Don't hand-roll an SVG unless Lucide genuinely lacks it; a hand-drawn set at
mixed sizes and strokes is what made the UI read as assembled. Known exceptions, not yet
replaced: the hand-drawn arrows in `FindBar` and two inline SVGs in `CodeBlock` (one with a
hardcoded green); swap them for Lucide when touching those files.

- **Two size tiers:** 16px for repeated list glyphs (folder rows, search results, menu items),
  18px for navigation (the New note / Search glyphs and standalone controls). Mobile top-bar
  controls are 20px.
- **Two stroke tiers:** 1.5 for content (Lucide's default 2 reads busy at 16px among prose),
  2 for navigation chrome (`ICON_STROKE_NAV`), which balances against 14px labels. The slash
  menu's glyphs take the navigation stroke at 16px (see the slash menu section).
- Control hit boxes are 32px (`CHROME_BTN`). Don't flatten the tiers in either direction:
  rendered weight is `stroke × size / 24`, so equal strokes at equal sizes keeps the ink even.
- Icons inherit `color`; a wrapper that sets none needs one.

## Window chrome and navigation

- **No desktop top bar, no title bar.** The window is `hiddenInset`; on macOS Electron the
  traffic lights sit inline in the sidebar header, and the wordmark shifts by
  `MAC_TRAFFIC_INSET` to clear them (move one, re-judge the other, **at 100% page zoom only**:
  the lights are native and never scale with the page, and macOS 26 draws them 14px on a 23px
  pitch, so they end at 75px). The header is the window
  drag region; the wordmark and chrome buttons opt out. Collapsed, a thin invisible strip along
  the viewport top keeps the window draggable and deliberately stops above the note label's
  line box so it never steals label clicks. Web and non-mac Electron render none of this.
- **One active note.** Opening a note replaces it; no tabs, no split view. Restoring tabs means
  reverting the refactor, not remounting a component. Old persisted `boojy-ui-state` blobs
  with pane state still migrate in `resolveInitialActiveNote()`; leave that read path alone.
- Cmd-click on a wikilink is a plain click. Deleting the open note lands on an empty draft
  (desktop) or the sidebar (mobile).
- **The wordmark opens Settings directly** (testid `wordmark-settings-button`). There is no app
  dropdown, About page, Help entry or Recently Deleted surface.
- **Settings is a single pane:** Appearance, Storage (desktop), Updates, a one-line version
  footer. `settingsTab` does not exist; don't reintroduce it in mocks. Spell check has no UI
  but applies from the stored Electron setting; UI scale is keyboard-only (`Cmd+Plus/Minus/0`).
  Appearance is the theme picker alone: the font-size row (`settingsFontSize`, 10–24) was
  removed on 2026-09-05 because the scale shortcuts already size everything, and body text is
  the fixed `EDITOR_FONT_SIZE` in `EditableBlock`. Don't reintroduce `settingsFontSize` in mocks.
- **One zoom system: the app's own UI scale.** The View menu carries no `zoomIn` / `zoomOut` /
  `resetZoom` roles, because a menu role takes the shortcut before the renderer sees it, so the
  app's scale never fired and Chromium's page zoom ran instead, persisted per origin in the
  profile and leaving the native traffic lights behind. `main.js` resets Chromium's zoom level
  to 0 on every `dom-ready` so a stale profile can't reintroduce it. If a dev window ever looks
  bigger than the installed app, that is page zoom; judge chrome geometry only after Cmd+0.
- **Edit → Undo / Redo keep their menu roles, and Cmd+Z is the app's own undo.** Checked live
  in the installed build on 2026-09-07: the keystroke reaches the renderer's `useAppKeyboard`
  handler (one repaint per step), and the native menu item is a no-op in the editor. Wiring the
  menu item to the app's undo is unscheduled; don't drop the roles on reasoning alone (Cut, Copy,
  Paste and Select All must stay in any case).
- **Delete follows the platform.** Electron sends the `.md` files Boojy Notes manages to the OS Trash;
  web deletion is permanent behind confirmation. Folder deletion never touches a file that is not
  a note; the directory itself goes only once nothing is left in it (OS cruft such as `.DS_Store`
  does not count), and a folder that keeps other files stays, with a toast saying so. **Desktop
  asks only when the action is more than one recoverable file:** a single note goes at once with
  a quiet toast; a folder with notes and a bulk selection confirm first, worded as `Move N notes
  to the Trash?` with the promise that non-note files stay and the folder goes only if emptied; a
  folder with no notes asks nothing. The desktop wording lives
  in one place, `utils/deletionPrompt.ts`; don't add a second phrasing (the touch ··· menu still
  carries its own confirm copy, listed as debt in the backlog). No undo or recovery UI, by
  decision: the OS Trash is the recovery surface. The retired private `.trash` gets one
  conservative startup migration into the OS Trash: recognised notes are copied under
  collision-safe names before the source is removed, ambiguous items are left untouched and
  reported once per distinct problem set, OS cruft is ignored. Deleting a note that never
  reached disk is a benign no-op, and the watcher's unlink suppression is event-consumed rather
  than timed so a slow trash move can't fire a spurious `file-deleted`.
- **The watcher drops only an event it can trace to the app's own operation** (2026-09-08).
  Three claims, one per kind of operation, each held until the event that explains it; nothing
  about a note file is decided on the clock alone. `write-note` hands `claimWrite(path, body)`
  the text it has just written; the watcher hashes it, and any later `change`/`add` whose file
  still holds exactly those bytes is dropped as that write's echo, however late. The claim ends
  at the first event showing other bytes there (the change is delivered) or the file gone (any
  unlink), so an outside change *back* to those bytes (`git checkout`, Undo in Obsidian, a sync
  restore) and a note put back from the Trash with the bytes the app last wrote are real and
  shown; before this the claim lived forever, both were dropped, and the next save wrote the
  outside version over the revert. An unlink the app causes itself (a Trash move, the old path
  of a rename, the old name of a case-only rename, which chokidar reports as unlink plus add) is
  claimed once with `claimUnlink` and consumed by the one unlink it produces; an unclaimed unlink
  is a real delete however soon after the app's own save it lands, because the app's writes
  never unlink the path they write (before this a 1.5 s per-path timer dropped it). macOS sends
  a second `change` for one write 1.5–2.7s later (same mtime and size, only ctime moved:
  metadata settling), which no fixed window can cover; before the hash check every one of them
  rebuilt the note from disk mid-typing, caret to the first block, keystrokes since the save
  lost. Don't replace the bytes with a timer. The one clock-decided suppression left is a folder
  rename or removal (`claimTree`, 1.5 s over the old and the new directory, which also ends the
  bytes claims under the old one): an event that escapes re-reads what is already true, and the
  residue is an outside change under that folder inside the window of the user's own rename of
  it. `watcher-ownership.spec.ts` proves the revert, the delete inside the old window and both
  restores in the real app.
- **A note renamed or moved outside the app is the same note, pending edits included**
  (2026-09-08, review §2.9). The disk's own identity for a file is its inode: a rename or move
  within the volume keeps it and nothing else in the vault has it. `noteFileManager` records it,
  with the hash of the bytes read or written, for every note it parses or writes (`_identity`,
  in memory only: pending edits never outlive a session), and consults it in one place,
  `relocateNote`, when the watcher reports an unlink of an indexed path that no claim explains.
  Found elsewhere in the vault, the index entry follows, the watcher sends `file-moved` with the
  note as the disk now holds it, and `useFileSystem` adopts the title and folder as a change of
  record (`adoptNoteData`, the path the filename a write produced takes) and leaves the text
  alone: a note with edits pending keeps its dirty mark and the ordinary flush writes them at
  the new path (`write-note` already knows it); one with nothing pending is not rewritten,
  stamped or moved in the sort. The `add` the rename produces is claimed as the bytes it holds
  when they are still the ones the app last read or wrote, so it is dropped as the nothing-new it
  is; a file that also changed is delivered as the change it is (a conflict copy if edits are
  pending, as any outside edit). Before this the unlink was a delete, the rebuild kept the note
  because edits were pending, the flush found no index entry and `write-note` recreated the old
  file, or the old folder, beside the renamed one, holding the pending edit while the renamed
  file kept the old text. Identity that cannot be established stays the delete it looks like:
  nothing in the vault holds the inode (a real delete, a move done as copy and delete, a move
  across volumes, a sync client that recreates files), and the standing rebuild writes the
  pending edits back under the old name, which loses nothing. A file moved *over* another note
  (`mv -f`) belongs to the note whose inode it holds; the note it displaced is reported deleted.
  Not a content match: bytes are compared only to decide whether the add carries news, never to
  decide identity. `external-rename.spec.ts` proves the rename after a save, the rename before
  the session's first save, the folder move and the clean rename in the real app.
- **An outside edit is never silently overwritten** (2026-09-06). The watcher asks the bytes,
  not the clock: a claimed hash that differs is a real change however soon after the app's
  own save it lands, one that matches is an echo however late, and a path with no claim is
  the app's only under a directory it is renaming or removing.
  In the renderer every note that arrives from disk goes through one path,
  `applyExternalNote` (useHistory), which updates the history ref and state together; the
  raw setter is not used for it, because a text commit pending for another note republished
  the stale ref and wrote the old bytes back over the edit. "Same" is judged by the writer
  itself (`persistedEquals`: `blocksToMarkdown` plus title, folder and line-ending style),
  never by a field list. A change to a note that is not open, or to the open note with
  nothing pending, is taken at once, and the editor repaints only when it is the open note (a
  repaint while typing elsewhere would paint lagging state over the live DOM). A change to the
  open note while edits are pending keeps both: the outside bytes stay under the note's name,
  the local version, pending text included, is written first as `Title (conflicted copy
  YYYY-MM-DD)` through the ordinary write path, and only once that write has succeeded is
  the disk version adopted, the copy adopted (dirty, so the ordinary flush rewrites it with
  any keystrokes typed during the write), and the editor moved to the copy with the caret's
  block and offset carried through the focus refs. A failed copy replaces nothing and says so
  once. The note is remembered as conflicted (`conflicted` in `useFileSystem`) from the moment
  the conflict is seen, before the copy's write begins and not only once it has failed
  (2026-09-08, review §2.9): from then on every flush, the debounce, the 5 s retry, blur and
  quit alike, writes it as the copy and never under its own name, until a copy write succeeds,
  and a flush that lands while the copy is being written waits for that write (`copyInFlight`)
  instead of starting a second copy. Before this the entry was made on failure alone, and a blur
  or quit inside the copy's ~10 ms write re-marked the note from the quit/blur net and wrote the
  local version over the outside edit. **Once a conflict has been detected, the local version
  never goes over the outside edit's path.** The one residual: if the copy
  still cannot be written inside the 2 s the main process holds a quit, the local version is
  lost with the quit, as any unsaved work is; it is never resolved by overwriting the file.
  No merging, by decision. Undo entries for a note replaced from disk are dropped. Not
  covered: the app's own debounced write landing over an outside write before the watcher
  reports it (the last-writer race), which needs instrumenting under a sync provider first.
- **A dirty mark is cleared only by a write of the version the note holds now** (2026-09-07).
  `flush` in `useFileSystem` writes dirty notes one after another; after each write it clears
  the note's mark only if the object written is still what state (`noteDataRef`) or the
  keystroke ref (`latestNoteDataRef`) holds, and it reads each note as its own turn comes,
  never from a snapshot taken before the loop. Before this, an edit that landed while the
  note's own write, or the writes of notes ahead of it in the same flush, was in flight had
  its mark cleared by the returning write, and the flush that edit had scheduled found
  nothing to write: newer text on screen, older on disk, until blur or quit (the
  `unflushedNotes` net) or the next edit to that note. A single write is ~10ms; a bulk move
  widens it to seconds, which is how `write-in-flight.spec.ts` reproduces it (150 notes
  dragged into a folder, a keystroke while they are still being written; it failed three of
  three before the fix). The retry after the loop covers a kept mark with no timer pending.
- **To see what the editor is doing, trace it, don't theorise.** `BOOJY_TRACE=/path/to/log
  node_modules/.bin/electron .` (after `pnpm build`; it uses the real profile and vault) appends
  one line per watcher event, save, external reload, keystroke target, caret move between blocks
  and block repaint from both processes on one clock (`electron/trace.js`, `src/utils/trace.js`).
  Everything is a no-op unless the variable is set. Quit the installed app first; two instances
  share the profile.
- **`syncGeneration` is editor plumbing, not cloud sync.** It tells uncontrolled blocks when to
  repaint from state. Don't remove it on the strength of its name.
- Word count is mobile-only. Undo/redo are keyboard-only on desktop; the touch toolbar carries
  Undo and Redo buttons at its fixed left edge.
- The sidebar drag handle is gated on `!collapsed`; unconditional, it leaves a hairline down
  the left edge.

**The panel toggle moves between states on purpose.** Expanded, it sits in the sidebar header
opposite the wordmark, so the header reads `wordmark … toggle`. Collapsed, `EditorChrome`
renders it fixed at the viewport's top-left. Both use the exported `ChromeButton`.
**The note label steps around the collapsed toggle by `COLLAPSED_TOGGLE_CLEARANCE`**
(`EditorChrome`: the toggle's left, `MAC_TRAFFIC_INSET` or `CHROME_INSET`, plus its box plus
8px of air), and only while the sidebar is hidden; the body column never moves. The reserve
was once counted from `CHROME_INSET` alone, so on macOS the glyph sat on the first letters of
the name at every width (2026-09-07). Keep the clearance next to the toggle's position; the
two must move together. `collapsed-toggle.spec.ts` measures it in the real app.

## Sidebar

### Alignment and rows

- **The chrome row is `wordmark … Search, toggle`** (2026-09-05). Search is a `ChromeButton`
  beside the panel toggle that opens the search palette; the desktop panel never shows a
  field or results, so the vault header is always the first line of the panel. **New
  note lives above the editor** (`EditorChrome`, beside the note's ···), Apple Notes style:
  the sidebar's row is for finding and hiding, the editor's for making and managing, and the
  button is still there with the sidebar collapsed. Cmd+N is unchanged. The `New Note` and
  `New Folder` tree rows are mobile-only.
- **Wordmark at 18px, one asset per theme, drawn in the theme's ink** (`Wordmark.tsx`,
  2026-09-07; mobile draws the same component at 30px). At 20px it out-shouted the note's
  H1. The artwork is two colours, the cyan N (the same in both themes) and "otes" in
  `TEXT.primary`; before this the black master was drawn in both themes at 0.92 opacity, and
  in Dark "otes" was near-black on the dark ground. A CSS `invert()` was rejected because it
  would also turn the N into its complement. The master `assets/boojy-notes-wordmark.png` is
  never drawn; the two drawn files are generated from it, alpha untouched, and regenerated
  whenever a theme's `TEXT.primary` moves:
  `magick assets/boojy-notes-wordmark.png \( +clone -alpha extract \) \( -clone 0 -alpha off
  -fill "<TEXT.primary>" -opaque black \) -delete 0 +swap -alpha off -compose CopyOpacity
  -composite assets/boojy-notes-wordmark-<light|dark>.png`.
  The chrome row's controls sit 6px from the divider (`HEADER_RIGHT_INSET`); the
  vault header's share that right edge (`SECTION_HEADER_RIGHT` = 6 + 7 − 8) and the 2px step.
- **Indent guides**: a 1px `BG.divider` line drops from each open folder's glyph centre through
  its children (`SPINE + SPINE_ICON / 2 + depth × 20`). In one mixed tree, root notes have no
  glyph and sit on the folder-label column, so without the line they read as children of the
  last open folder; the line ending is what says "this folder ends here". No breath before the
  root notes: the row rhythm stays even. Tree rows are 28px with a 2px gap.
- **The action group is a sticky block inside the sidebar's single scroll container.** Every
  sidebar state shares that one scroller so the search field never remounts (and drops focus)
  mid-typing; don't split states back into separate scrollers. Rows slide under the sticky
  block with no separator; a scrolled-only hairline is the fix if that reads smudgy.
- **Two-column alignment:** `SPINE` carries the wordmark, action icons, section labels and
  folder icons; `TEXT_COL` carries every label. Root note rows are text-only, so an empty
  gutter sits left of their titles. **That gutter is alignment, not a missing icon. Don't fix
  it.**
- Tree rows are pills with neutral `BG.hover` for hover, selection and multi-select alike. The
  active note is primary ink at normal weight; the pill alone carries "active", never bold,
  never accent. Mobile keeps its accent pill and bold title.
- **Only structure and actions get a glyph.** Note rows carry no file icon. Folders carry only
  the folder icon: no chevron, the whole row toggles, the open-folder glyph plus indented
  children carry the state, `aria-expanded` is the programmatic signal. Note-row padding still
  reserves the removed icon's width so titles keep their column under folder names; don't
  simplify it away. `FileIcon` still ships in search results, which are not tree rows.

### Note rows: trailing ··· and inline rename

- Desktop note rows carry a trailing ··· that opens the same menu as right-click, growing
  rightward into the editor. Right-click keeps cursor placement.
- **The ··· slot is zero-width at rest** so a long title truncates against the full row width;
  it re-truncates only while the dots are revealed (row hover/focus, or its menu open). The
  width change is instant and only the ink fades; a sliding re-truncation reads worse than a
  snap. Muted on row hover, primary when the dots themselves are hovered. All CSS
  (`.sidebar-note-more`); the row that opened the menu holds its state until it closes.
- The dots are a `span role="button"` with `tabIndex={-1}`: a real button nested in the treeitem
  button fails axe `nested-interactive`. The row stays the keyboard path.
- A pointer-opened menu shows no focus ring on its first item (initial focus parks on the menu
  container) because Chromium treats script focus as `:focus-visible`. Keyboard navigation
  still indicates normally. Single-note menu items carry glyphs; folder and bulk menus are
  text-only.
- **Double-click renames inline**, notes and folders alike, with the same in-place input. A
  note's name is selected Finder-style; the folder input only autofocuses with the caret at the
  end, so typing appends (a known gap in the backlog; the intent is Finder-style for both). The
  ··· Rename falls back to the editor title only when the sidebar is hidden. A folder's first click still toggles it; the double-click just skips the
  second toggle rather than delaying single-click to disambiguate.

### The vault header and its one tree

- **One header, named after the vault folder** (`vaultName`, the basename of the notes
  directory; `Notes` on web), replaces the `Folders` and `Notes` sections (2026-09-05). Row
  height, row size (14px), weight 500, `TEXT.muted`: a label for the list, not a heading over
  it (judged live against 15px/600/primary, which fought the wordmark). 10px below the chrome
  row, 2px to the first row. It does not collapse, so no chevron. It scrolls with the tree; a
  pinned header lies about the rows under it once the list scrolls. It is hidden with the tree
  while a search shows results or none.
- **The header carries New folder and the ··· menu, hover-revealed at the 16px row tier**
  (`SectionAction`, `.sidebar-section-action`, reveal on header hover or focus-within, all
  CSS). 16px so they read with the folder glyphs below, not with the 18px chrome row above;
  two rows of 18px glyphs stacked read as two toolbars, which is why New note left the header.
  **Never a third glyph here.** New folder is also the first item of the ··· menu, the
  standing hint for a hover-revealed control and the keyboard path. Sort and Reveal in Finder
  follow (`VaultMenu.tsx`, keyboard grammar as `ContextMenu`); anything rarer goes there too,
  never onto the header. Not in the menu, by decision (2026-09-05): Collapse all folders
  (folders toggle on click and persist as left) and Change vault folder, which is Settings →
  Storage only, beside the path it changes. The
  `--visible` variant of `SectionAction` exists for a control that must show at rest; nothing
  uses it today.
- **One `role="tree"`, the header a sibling above it, never inside it.** A header inside a tree
  fails axe `aria-required-children` at critical impact, which the E2E gate catches. The tree
  element exists only when it has rows, because an empty tree fails axe too; the header stays
  regardless, since it is the root drop target and the home of New note. Folders come first,
  alphabetical; root notes follow in the sort preference, exactly as inside a folder. **The
  root is a folder.** Mobile has no header and keeps its own inline rows.

## Search is a palette, not a panel

- **On desktop, search is `SearchPalette.tsx`**: Cmd+K (the convention) or Cmd+P (the habit
  this app taught before), the chrome row's Search glyph, or a click on an inline `#tag`. A
  560px dialog in the top third of the window over a dimmed scrim, results growing downward.
  Search only: no commands, no recent list, nothing before you type. Escape, Enter or a click
  outside closes it; closing clears the query.
- **Version B of the three judged on 2026-09-05**: title hits show the match in the accent and
  nothing else, even when the body also matched; a body hit shows one muted line of context
  under the title with the word in the accent; every row carries its folder path, muted, on
  the right, with ` / ` between segments. No grouping by folder (the path carries that at a
  quarter of the ink), no "title match" note. A `#` with no results shows the tag chips.
- **One search, two faces.** The palette reads and writes the sidebar's search state
  (`SidebarContext`: `search`, `searchResults`, `activeResultIndex`, `navigateResults`), so
  Enter opens the highlighted result and jumps to its matched block exactly as the sidebar
  did. The sidebar tree filters behind the scrim while you type; closing clears it. The mobile
  layout keeps its field and inline results (`isMobile`-gated in `Sidebar.jsx`); the chips and
  highlighters they share live in `SearchParts.tsx`. Cmd+F in-note find is separate (`FindBar`).

## Note order is a preference, not a stored arrangement

- One global control orders every list, root and folders alike: Most recent / Alphabetical,
  persisted in `boojy-note-sort`, default recency. It lives in the vault header's ··· menu as
  a pair of radio items with the current mode marked; a preference flipped a few times a month
  does not earn a standing glyph, and the menu has room for a third mode if one ever earns it.
- **"Most recent" means most recently modified, never opened: `max(edited here this session,
  file mtime)`** (`recencyOf()` in `utils/noteSort.js`). The file's mtime is the durable truth
  and orders the vault at launch; it is also the only signal that sees an edit made in another
  app, which the watcher delivers live. Because the app's own writes don't refresh
  `lastModified` in state, `useFileSystem` stamps a note in an in-memory "edited at" map the
  moment it becomes dirty (typing after its commit, a checkbox, a rename, a move, a new or
  duplicated note). Nothing is persisted by the app and nothing is written to the user's files;
  the old `boojy-note-opened` key is no longer read.
- **Opening, selecting or reading a note has no effect on order.** The list never reshuffles
  under the pointer, which is what makes double-click rename safe in recency mode. Don't
  reintroduce an open-stamp for any reason.
- Rename and move count as modification because they rewrite the file; accepted for Beta rather
  than adding filesystem work to preserve the old mtime.
- A pure `touch` with no content change does not refresh the order (`onFileChanged` bails when
  nothing differs; deliberate anti-churn). Notes with no timestamp at all sort alphabetically at
  the back.
- `sortNoteIds` returns the same array reference when already ordered, because the sidebar's
  memo chain compares identities. Alphabetical mode doesn't subscribe to timestamps.

### Drag means location, not order

- Dragging a note moves the real `.md` file: onto a folder files it there, onto the vault header
  or the empty space under the tree moves it back out. Drag never sets a position; sort decides
  display order. Folders are always alphabetical.
- The ghost is a title-only pill that lifts in; releasing anywhere that isn't a folder or the
  root area flies it back and nothing changes. **Dropping over the editor does not open the
  note**; drag never navigates. Every drag ends by suppressing the trailing click so it can't
  open the lifted row.
- **Dragging a folder moves its directory**: onto another folder nests it, onto the vault
  header or the space under the tree moves it back to the root. Never into itself or its own subtree (those rows are not
  targets; the pointer falls through to the root). Same lift, ghost and cancel grammar as notes.
- Existing `.boojy-meta.json` files are left untouched; nothing reads their ordering keys.
  Don't tidy them and don't reintroduce a reader.

### Folders are directories

- **A folder in the sidebar is a directory in the vault**, the way Finder and Obsidian treat it,
  not "where a note happens to be". Every subdirectory shows, empty or not (your `Resources` of
  PDFs is a folder); dot-directories and `attachments` are skipped at any depth, matching the
  note walk. The list comes from `read-folders` at load, after any external delete, on
  `folders-changed` (chokidar `addDir`/`unlinkDir`, coalesced) and when the vault changes; the
  new vault's directories replace the old vault's. Web keeps folders in memory (`useNoteCrud`'s
  fallback); nothing on web makes a directory.
- **The main process is the only place that knows a folder's final name**, `electron/folders.ts`,
  the same rule as `write-note` for a note's basename: a *new* last segment is sanitised and
  de-duplicated (`-2`), a moved folder keeps the name the disk holds (see "A name the app makes is
  sanitised" under the title rule), a leading dot and the reserved name `attachments` become `_…` because
  the walk would skip the directory and hide every note in it (2026-09-06), a case-only rename
  is a rename, a path can never escape the vault, and
  every operation answers with the vault-relative `/` path the disk holds. The renderer adopts
  the answer; no input sanitises a folder name.
- **New folder makes the directory at once** (root from the header, `New folder inside` from a
  folder's menu), opens the parent, and opens the inline rename. The rename input commits once:
  Enter unmounts it and the blur that can follow must not rename the moved directory again.
- **Rename and move are one `renameSync` of the directory**, so notes, subfolders and non-note
  files travel together. Pending edits under the folder are flushed first, or a late write would
  land at the old path. The note index is rewritten under the old prefix so IDs (and the open
  note) survive; the notes' `folder` fields then follow through `remapNoteFolders` (useHistory).
  Undo never restores a folder (see "One owner for note state"), so no snapshot is rewritten and
  a later undo of a text edit cannot move a file back into a recreated old directory. Not an
  edit: nothing becomes dirty, no file is rewritten, no mtime moves, and the rename itself is not
  undoable. The watcher claims
  both directories for a short window (`claimTree`); an event that escapes re-reads what is
  already true.
- **Delete waits for the Trash.** The notes are removed from state, the debounced flush trashes
  them, and `afterNextFlush` then asks the main process to remove the directory, which it does
  only if nothing but OS cruft is left. A folder with no notes skips the flush and goes at once.
- **A folder outlives its notes** (decision D8, 2026-09-07). Moving the last note out, or
  deleting it, leaves the directory where it is; only Delete folder removes one. `write-note`
  used to remove an emptied parent directory, so dragging the last note to the root deleted
  the folder it came from. `folders.spec.ts` drags the last note out and expects the row.
- **A chosen vault that is missing is never recreated** (2026-09-07). `getNotesDir` makes
  only the default vault under Documents; a configured path that is not there (an unmounted
  volume, a folder moved in Finder) opens empty, every write refuses with the ordinary
  "Failed to save" toast, and nothing is written to the boot disk. Before this, `read-all-notes`
  and the watcher each recreated it and new notes went quietly into the empty twin. No
  "folder not found" surface yet; Settings → Storage is the way out. `vault-root.spec.ts`.

## A note's title is its filename

- **For every persisted desktop note, the title shown equals the Markdown basename.** Drafts are
  excluded until they become files. The rule is enforced from the persistence side: `write-note`
  in `electron/noteFileManager.js` is the only place that knows the final name (collision suffix,
  invalid characters to `_`, trimmed edges, `Untitled` for a blank name, a leading dot to `_`
  because the vault walk and the watcher skip dot-entries and `.env.md` vanished at the next
  restart (2026-09-06), the volume's own casing)
  and answers every write with it. `useFileSystem` hands a differing answer to `useResolvedTitle`,
  which adopts it into state (`adoptNoteData`: no history entry, so Cmd+Z undoes the rename
  itself) and repaints the editor's title field, caret preserved when the user is still in it.
  Nothing in the UI second-guesses filename rules; don't add a sanitiser to an input.
- **A name the app makes is sanitised; a name the disk holds is kept** (2026-09-08, review
  §2.3). `noteToFilePath` sanitises the title only when it differs from the basename the note's
  own file already has (the index entry), so `Why?.md` stays `Why?.md` on every save and only a
  title the user typed is rewritten. It never touches the folder: a note's `folder` is always a
  path the disk holds (the folder walk, or a folder operation's answer), so it is only checked to
  lie inside the vault (`insideVault`; a write outside refuses). `renameFolder` follows the same
  split: the last segment is sanitised only when it differs from the old name, so a drag keeps a
  Finder-made `Work: Client` as it is, and only a rename is the app's to spell. Before this every
  save mapped the title and every folder segment through the sanitiser, so the first edit of a
  note in `Work: Client` wrote `Work_ Client/Plan.md`, unlinked the original and left the renderer
  holding `folder: "Work: Client"`; a `Draft ` folder and a `Why?.md` went the same way.
  `disk-names.spec.ts` proves the save, the move into such a folder, the folder drag and a
  restart in the real app.
- **The name is a quiet file label, not a title.** A `#` heading in the body is body text: it
  never names the file, and the filename is never written into the note as a heading. Decided
  because altitude implies rank, and a filename cannot hold title rank.
- **A note's own file is never a collision.** `ensureUniqueFilePath(target, ownPath)` returns the
  own path when it is the first free candidate, so a note already at `-2` stays at `-2`. Every
  other file on disk is a collision, indexed or not.
- **A blank title under the caret is left alone.** The placeholder already reads `Untitled`, and
  filling it in would land in front of whatever is typed next; it resolves on the next write, or
  when the note is next opened. The emptied field's own `<br>` reads as "\n"; `titleFieldText()`
  is the one reading of the field, shared by the input handler and the adoption hook.
- The editor title repaints from state when the field is not focused (a sidebar rename of the
  open note); while focused the field is ahead of state and is never repainted from it.
- No inline "a note with this name already exists" validation, by decision; correctness first.

## Block drag: the gutter handle, never the text

- **Text never starts a block drag.** Text is for writing and selecting; a hover-revealed grip
  in the left gutter moves blocks. That separation is what removes the race where a pause
  before a drag-to-select reordered the block instead. Keyboard reorder
  (`Cmd/Ctrl+Shift+↑/↓`) remains the non-pointer path.
- There is **one floating handle** for the whole editor, not one per block, because every block
  root is a contentEditable and a control inside it would be inside the text. It sits in the
  column's existing left padding, so it **never overlaps prose and never shifts layout**, and it
  centres on the block's first line so it lands where the eye reads first for headings, list
  rows and multi-line paragraphs alike. Desktop only.
- **The editor stays clean at rest.** The grip is invisible until its block is hovered, hides
  on keydown and during a drag, and doesn't exist at all with fewer than two blocks. Hovering
  the grip lifts its ink and nothing else: **no hover surface**, so the gutter stays part of
  the page rather than a control strip. Reveal is CSS; don't add JS opacity handlers. The
  handle is `aria-hidden`, a pointer-only affordance with the keyboard shortcut as the
  accessible path.
- **The drag commits on drop.** While the pointer is down the note does not change: the grabbed
  block stays put at full opacity, a quiet translucent copy (no card, shadow or lift) follows
  the pointer, and a 3px accent insertion marker shows where release would put it. Release
  reorders once, as one history entry, and only if the order changed. Escape, window blur, or
  release over the sidebar cancel with nothing to undo.
- The marker sits centred in the gap between blocks, never touching prose. **The no-op position
  is drawn above the grabbed block**, never through it and never just below it, since "just
  below" reads as moving down one. The marker holds there until the pointer passes the middle
  of the next block.
- A multi-block selection containing the grabbed block drags as one run. The sidebar note pill
  is the thing that lifts with `theme.dragShadow`; the block ghost deliberately does not.
- **Deliberately absent, don't add:** a "+" beside the grip (the slash menu creates blocks), a
  click menu on the grip, a handle on mobile, an always-visible handle. The editor must keep
  reading as a document, not a block-management surface.

## Links: the caret stays outside, the tooltip waits for a rest

- **A caret at the end of a link's text is placed just after the link, on a zero-width space**
  (`CARET_ANCHOR` in `utils/domHelpers.js`, applied inside `placeCaret`). Chromium canonicalises a
  caret at a link's edge, or at the boundary before following text, to *inside* the link, and the
  next keystroke then rewrote a `[[wikilink]]`'s alias; the zero-width space is the one anchor it
  honours (probed in the real app; an empty text node is not). The anchor is scaffolding: both
  DOM→Markdown walkers drop it, `getCaretOffset` and `placeCaret` don't count it, and a repaint
  from state wipes it. Don't add a second caret placement path that bypasses `placeCaret`.
- **The browser's own caret is caught at the keystroke, not at the move** (2026-09-06). End, a
  click past a link or on its right edge, and ArrowRight all leave Chromium's caret at the last
  offset of the link's text node, inside the span, which `placeCaret` never sees; `See
  [[Welcome]]` + End + ` after` was saved as `See [[Welcome|Welcome after]]`. A native
  `beforeinput` listener (`useEditorFocusUX`) runs `caretOutOfLinkEnd` before any insertion
  outside an IME composition: a collapsed caret at the end of a link's last text node moves onto
  the same anchor, and the text lands outside. It is deliberately not a `selectionchange`
  normaliser: probed live, that would re-anchor the caret after every ArrowLeft back into the
  link (the anchor is one arrow step, then the link's text) and after the Backspace that
  removes the anchor, so neither could ever reach the link's last character. Nothing about
  where the caret may rest changed; only where typed text goes.
- Links only (`a`, `.wikilink`). Bold, italic and tags keep the browser's own edge behaviour, so
  typing at the end of bold text extends it, as in every editor.
- **A backslash escape is shown as written** (`\*not italic\*` reads exactly so on screen, never
  as italic), the way Obsidian's live preview shows it. The renderer once hid the backslash; the
  DOM walkers read text back verbatim, so the escape was gone on the first edit and the text
  became italic on the next repaint (2026-09-06). Don't hide it again without teaching both
  walkers to put it back.
- **The hover tooltip is `useLinkHoverTooltip`**: half a second at rest on a link shows its URL or
  `[[target]]`; the pending hover is an object holding the timer and the URL, and the callback
  checks it is still current before showing anything. Never hang data off a timer handle; it is a
  number in the browser and the assignment throws in strict mode.

## The slash menu is tiered

- `/` opens on eleven commands. `advanced: true` in `SLASH_COMMANDS` keeps Callout, File
  attachment and Embed note off the opening screen; typing anything after the slash searches
  everything, so `/call` still finds Callout.
- **The tier rule lives in one place, `filterSlashCommands()`**, used by both the menu and the
  keyboard navigation. A second copy is how Enter inserts a different block than the one
  highlighted.
- Order is the menu's only structure (2026-09-07): the Markdown blocks first, roughly by reach
  (headings, lists, Quote, Code block, Divider), then Table and Image, whose triggers are the
  app's own, at the foot. `data.test.js` guards the split.
- **Each row carries its typed shortcut as a muted hint on the right** (`hint` in
  `SLASH_COMMANDS`, 12px mono, `TEXT.muted`, muted on the selected row too; only the glyph takes
  the accent). The hint is what `useInputHandler` turns into the block at the start of an empty
  block, never the Markdown the block saves as: the old `desc` column showed `| | |` and
  `![]()` and was removed as noise. Nine hints are plain Markdown (`#`, `-`, `[]`, `>`, `---`,
  three backticks). **Two are Boojy's own quick keys**, decided 2026-09-07 because no editor
  has a typed table or image trigger and Tyr wants the menu to be optional: `|||` makes the
  menu's two-by-two table at once (the three-of-a-symbol grammar of `---` and the backticks;
  a hand-typed table never starts with three pipes, an empty first cell is `| |`), and `![]`
  plus a space opens the menu's image picker (the box rhyme with `[]`; it waits for the space
  so `![alt](url)` can still be typed through it). Both run the menu's own command through
  `executeSlashCommand`, handed into the input handler, so there is one table shape and one
  picker path. Tier-2 blocks have no trigger and an empty hint.
- Labels are plain words, not markup terms: Quote, not Blockquote; To-do list, not Checkbox
  (the block is a list, and the row then reads with Bullet list and Numbered list). Rows are a
  Lucide glyph at the navigation stroke (2, at 16px: the glyph is the row's identity beside a
  500-weight label and the mono hint, and 1.5 read thin against both, judged live 2026-09-07),
  a label and the hint: no chip, border or group heading. The shadow is `theme.modalShadow`.
- Menus position through `positionMenu()` / `useMenuPosition`: honour the anchor, keep a
  viewport margin, flip to the other side on overflow, clamp last. Route every new popover
  through it rather than writing a fresh clamp.
- Selection is keyboard-first: opening and filtering reset to the first row, and rows take the
  selection on actual mouse movement, not `mouseenter`, because a menu can mount under a
  stationary pointer.

## One edit, one block root

The editor is a single contentEditable wrapping every block root, so Chromium is willing to
merge, split or format across two React-owned roots; the next React commit then meets DOM it
did not make and throws (the "Something went wrong" screen), or the screen and the file
quietly part ways. The rule (2026-09-07): **an edit whose reach is not confined to one block
root is the app's, made through state; Chromium never mutates across roots.**

- **The seam is the native `beforeinput` on the editor root** (`useCrossBlockEdit`), because it
  is the one event that says which roots an edit is about to touch (`getTargetRanges()`): a
  forward Delete at the end of a block reports a range into the next block, and a Backspace
  beside a code block reports a range that swallows it, neither visible at keydown. Every
  native edit reaches it, whatever produced it (a key, Cut, a menu, autocorrect, a drop). A
  target range inside one root is left to Chromium; anything else is cancelled and, where it
  has a meaning in the block model (delete, typed text, Enter, Shift+Enter), made in state.
  Formatting, history and composition across roots are refused. React's `onBeforeInput` is
  synthesised from other events and cannot stand in for it.
- **`execCommand` fires no `beforeinput`**, so every script mutation asks which roots the
  selection touches first (`scopeOf`, the same resolver): inline formatting is applied to each
  block within itself and each block alone is read back; Cut is copy plus the owned deletion;
  a paste across blocks is the owned replacement; a link needs one text block. Don't add an
  `execCommand`, `surroundContents` or `insertNode` on a selection whose scope has not been
  checked.
- **A block that owns its own field owns its edits.** A selection inside a table cell, a
  callout or a code block's textarea is that block's; the editor's key, paste, cut and
  re-read paths keep out (a block with no registered element is never read back into
  state). A selection reaching from a text block into one of them is refused, nothing
  changes; deleting the run is not attempted (backlog).
- **A collapsed Delete or Backspace reaching into a neighbour** merges only with an adjacent
  text block, selects an adjacent divider or image (the next key removes it), and refuses
  anything else, so a code block or table beside the caret is never swallowed. Keydown's own
  Backspace-at-start rules (indent, divider, step over) still run first and prevent the
  default; the guard sees what escapes them.
- Proven in `cross-block-ownership.spec.ts` (the real app) and the unit tests beside the two
  modules. Known residue: an IME composition begun over a cross-block selection cannot be
  cancelled (`insertCompositionText` is not cancelable); a text drag across blocks copies
  rather than moves (`deleteByDrag` is refused so the text is never lost between the owned
  delete and Chromium's insertion); Cmd+B across blocks toggles per block.

## Menus own their keys; the editor keeps the caret

- **A key a menu has already consumed never reaches the editor** (2026-09-07).
  `handleEditorKeyDown` returns on `defaultPrevented`. The tag and wikilink menus take Enter,
  the arrows and Escape in a capture-phase `window` listener and prevent the default; before
  the guard the editor's own Enter handler still ran on the DOM text and split the block under
  a tag suggestion instead of completing it. One rule for every menu, in place of the
  wikilink-only guard it retired. Don't add a per-menu special case.
- **A completion made from a native listener commits structurally and repaints the block
  itself** (`handleTagSelect`, `handleWikilinkSelect`). The debounced text commit leaves React
  state behind, and the menu's own close re-renders the editor, whose `syncGen` repaint then
  paints that stale text back over the block (disk `#review`, screen `#rev`). `commitNoteData`
  publishes at once; the direct `innerHTML` write is the paint (editor gotcha 2). One undo
  entry per completion.
- **The caret after a completed tag is parked on a `CARET_ANCHOR` past the ending space.**
  The space that ends the tag is the block's last character, and under `white-space: normal` a
  trailing space collapses: a caret placed in it has no width, and Chromium moved the next
  character into the tag span (`#reviewd`). Typed on the anchor, text lands after the space and
  outside the tag, and the walkers drop the anchor as they do after a link. The tag handler
  queues nothing for the focus effect when it painted the block itself, because a repaint and
  re-placement from state would put the caret back in the collapsed space. Probed and rejected
  (2026-09-07): a non-breaking space after or inside the span reached the file as U+00A0, and
  `pre-wrap` would change how every run of spaces renders.
- **Tab and Shift+Tab keep the caret on its character.** `updateBlockIndent` reads
  `getCaretOffset` inside the commit, before state changes; the focus effect's default of
  offset 0 put the next keystroke in front of the item. Re-indenting changes the box, not the
  text, so the offset is always valid.
- **The click's caret rescue never takes focus back** (`useMouseHandlers`). A frame after a
  click or a focus, the editor puts the caret in the nearest block when the selection landed
  outside any. If something the click opened holds focus by then (a tag click opens the search
  palette), the rescue steps aside: the palette's field was focused for one frame and Escape
  and the arrows then went to the editor. Focus resting on the body still gets the rescue.

## One owner for note state

Note state has two copies by design: React state, and `useHistory`'s keystroke ref, which runs
ahead of state for the 300 ms text-commit debounce and is then published over it. The ref stops
syncing from state while a commit is pending, so a change written to state alone in that window
was reverted when the commit fired, and left no undo entry. The rule (2026-09-08): **every
change to note state goes through a `useHistory` action, which applies it to the ref and state
together; the raw setter is not exposed.** Six actions, one per kind of change; a seventh is a
smell.

| Action | For | Undo entry |
| --- | --- | --- |
| `commitTextChange` | typing (debounced publish), into a paragraph or a special block's own field; ends a draft at its first character | one per 500 ms burst |
| `commitNoteData` | a user edit: a block, a checkbox, a rename, a new or deleted note, a block drop | yes |
| `adoptNoteData` | a change of record: the filename a write produced, a move between folders (drag, Move to) | no |
| `applyExternalNote` | one note as the disk holds it: an outside edit, a conflict copy | drops the note's entries |
| `remapNoteFolders` | a directory rename or move | no |
| `replaceNoteData` | the whole vault as the disk holds it: the initial load, a vault switch, the rebuild after an outside delete | keeps entries for notes that still exist |

- **History is the editor's.** A snapshot restores the title and the blocks and keeps the live
  `folder`, so undoing the typing that followed a move never writes the file back to its old
  place; a move is therefore not itself undoable, like a move in Finder is not undoable from
  inside a document. Undo never conjures a note: entries for a note that is gone (deleted here,
  or left in another vault) are discarded on the way to the next live one, and a vault switch
  drops them outright. The OS Trash is the recovery surface.
- **A draft is a note that has never held text, and it ends in the ref at the keystroke that
  first gives it a title or a character of body** (2026-09-08, review §2.6). `commitTextChange`
  strips `_draft` from the active note as soon as it has text, so everything that reads the ref
  inside the commit window sees a note: the switch that discards a draft (`discardDraft`), the
  quit and blur flush that skips one, the rebuild after an outside delete. Before this an effect
  on React state promoted the draft up to 300 ms after the keystroke, and one character typed
  then a click on another note, or Cmd+Q, deleted it with no undo. Only the *last* keystroke of
  a burst is inside that window (a second keystroke publishes the first at once), which is why
  the review traced it and nobody hit it typing a sentence. Undo keeps the live draft state as
  it keeps the live folder: undoing a written note's first character never makes it a draft
  again for the next switch to discard while its file stays on disk. There is no `promoteDraft`;
  `createDraftNote` and `discardDraft` are the whole lifecycle, and a draft with no text is still
  never written or trashed. `pending-edits-lifecycle.spec.ts` proves the name, the body and the
  quit in the real app.
- **The rebuild after an outside delete keeps what exists only here**, taken from the keystroke
  ref: drafts, and every note with edits not yet written, whether its write is scheduled or its
  keystrokes are still inside the text commit. Those are marked dirty and written; a note
  deleted outside while its edits were unsaved comes back as a file rather than being lost, and
  a clean one goes. A note the user has deleted whose Trash move is still pending stays deleted.
  Before this, the rebuild inside a pending commit put the deleted note back, dropped
  keystrokes, and rewrote every note in the vault.
- **A vault switch flushes, empties, then switches.** `changeNotesDir` writes the old vault's
  pending edits (the keystroke ref's version) before the picker opens, and the picker is modal;
  once a folder is chosen the old notes leave state (`replaceNoteData({})`) and the dirty,
  deleted, conflicted and retry bookkeeping is cleared before the new vault is read, so nothing
  of the old vault can be written into the new one. What could not be written before the switch
  is left behind, as at quit.
- **A version that has been written is not written again.** The flush records the object it
  wrote as the last version accounted for (`prevNoteData` in `useFileSystem`), so the text
  commit that later publishes that same object marks nothing dirty. Before this, a blur or quit
  flush was followed by a second identical write when the commit fired, and after a vault
  switch that second write would have landed in the new vault.
- Proven in `note-ownership.spec.ts` (the real app: undo after a move, a block drop inside the
  commit window, an outside delete while typing, a vault switch with pending edits) and the
  unit tests beside `useHistory` and `useFileSystem`.

## The paragraph model

Blocks are Markdown structure, not source lines (`structureParagraphs` in `utils/markdown.js`).

- **A paragraph block holds every adjacent plain line**, joined by `\n`; a plain line directly
  under a list item is the item's lazy continuation, unless the item is empty (an empty item
  has no paragraph to continue, so `- ` over `foo` is an empty item and then a paragraph, as
  CommonMark reads it). Enter makes a new paragraph, which the
  serializer separates from a paragraph or list item above it with one blank line. Shift+Enter
  inserts a soft break (`insertLineBreak`, so Chromium fires `input` and the normal commit path
  stores it) in paragraphs, list items and quotes, and acts as Enter in a heading.
- **One blank line is structure, not a row**, only between a paragraph or list item and the
  paragraph after it, and only when every blank in the run is exactly empty. Every other blank
  line, including a run holding a whitespace-only line, is an empty paragraph block, a visible
  row; the file's final newline is the empty last row. Nothing is recorded that the file does
  not say: no per-block join state, no note-level framing.
- **Quotes and callouts do not absorb.** A lazy line under a quote stays its own paragraph and
  gets no separator, because quote lines are written with `> ` and joining it would change bytes
  on save. That cost, and the blank-line rule's effect on Obsidian-style notes, are the open
  decisions in `docs/BACKLOG.md`.
- **On screen a newline is a `<br>`, and a `<br>` reads back as a newline.** `inlineMarkdownToHtml`
  gives a trailing newline a second `<br>` so the empty last line stays reachable; both
  DOM→Markdown walkers ignore a block's final `<br>`. Caret arithmetic (`getCaretOffset`,
  `placeCaret`, `caretLength`) counts a soft-break `<br>` as one character and the trailing one
  as none; never clamp a caret to `textContent.length`.
- **Three pitches, in order** (`PARAGRAPH_GAP` in `EditableBlock`, applied in `GlobalStyles`): a
  soft break is line height alone; Enter adds 12px after a paragraph or quote; an empty row adds
  a whole line, so Enter twice is twice a paragraph break. A paragraph after a list item gets the
  same 12px from a sibling rule on `data-block-type`, which every block root carries; the
  paragraph's margin lives in the stylesheet so that rule can win. The geometry test in
  `paragraph-model.spec.ts` guards the order, not the pixels.

- **One blank line before a divider is structure too**, after a paragraph or a list item: dropped on
  read, written on save, the same run rule as the paragraph separator (`takesSeparator`). Without
  it `---` under a line of text is a setext heading underline to every other reader, so the
  paragraph became a heading and the rule vanished. A blank *after* a divider stays an empty row
  (backlog: blank lines around headings). A file with the tight form still opens as a divider and
  gains the blank on its first save; sanctioned in the spec.

### A special block's field is a real field

A table cell, a callout's title or body and a code block's textarea are the block's own
fields: the editor keeps out of them (above), and each behaves like a paragraph's
contentEditable rather than like a form control bolted on. The rule (2026-09-08, review
§1.3, §1.4, §3.1, §3.2, §3.4, §3.8): **what the field holds is what state holds, at the text
grain, and the file never holds a byte sequence the block's syntax cannot.** Four parts, one
hook for the paint half (`useOwnedField`), the ordinary text action for the commit half.

- **Read with the editor's reader, commit on every input through `commitTextChange`.** A
  cell and a callout body are read back with `domNodeToMarkdown`, the textarea by its value;
  a callout title is plain text. `updateBlockText` serves the code textarea and the callout
  body as it serves a paragraph; `updateCalloutTitle` and `updateTableCell` are the same
  action for the other two fields. So the keystroke ref runs ahead of state, undo takes a
  500 ms burst rather than a character, and the editor skips its render (the comparator
  ignores code text; it repaints a code block's language and a callout's type and title).
  Before this, the callout committed `innerText` on blur, which stripped every `**bold**`,
  `[[link]]` and backtick from a body on the first click in and out; the table committed on
  blur alone; the code block committed every keystroke as a structural change, one undo
  entry per character and a render of every block.
- **A field is painted only when it does not already hold the latest committed text, and
  the keystroke ref decides, never the render** (`useOwnedField`: `latest()` reads the block
  from `noteDataRef` by id). A text commit publishes in a transition, which React may finish
  after the next keystroke, so a render can carry a text one keystroke behind the field;
  judged against that text the cell was repainted and the keystroke lost (`Tea leavs`, seen
  in the real app while writing the spec). Painted: on mount, when a row is inserted above a
  cell, when a type change renames a callout, and, forced, on a `syncGen` bump, the one case
  where the same text must still be repainted. Never on a render that merely caught up with
  the keystrokes. The code block's textarea is uncontrolled and its highlight overlay is
  painted from the input handler; a controlled `value` held the field to the state the
  commit debounce is behind, and the render path once stripped the fence's blank first and
  last lines, which made Enter at the end of the block a no-op (the newline was written and
  stripped back) and lost a fence's own blank lines at the first keystroke.
- **A structural operation on the block is a function of the block as the ref holds it.**
  `updateTableRows(noteId, blockIndex, reshape)` applies `reshape(rows, alignments)` inside
  the commit, so a cell edit still pending is inside the rows it reshapes. Before this, every
  row and column operation computed new rows from the rendered ones and wrote them, and text
  typed into a cell was gone the moment the cell's own context menu inserted a row (the menu
  keeps focus in the cell, so it never blurred). `useTableInteractions` reads `dataRef` for
  geometry and focus only, never for the rows an operation writes.
- **The serializer enforces the syntax.** A row is one line: a newline inside a cell is
  written as `<br>`, the line break GitHub and Obsidian read in a cell, and `parseTableRow`
  maps that exact form back (`<br/>` and `<br />` stay the text they are, so their bytes
  hold; `table-line-breaks.md` in the preservation corpus). A newline in a callout title is
  written as a space. Written raw, a cell's newline broke the row and every row below it
  into a paragraph on the next open. In the cell, Enter moves down a row (a new one after the
  last) and Shift+Enter is the browser's line break; in the callout title, Enter and
  Shift+Enter both move to the body.
- Proven in `special-block-fields.spec.ts` (the real app: the cell line break through a
  restart, the callout click-through and edit, Enter at the end of a fence with undo by burst,
  the pending cell edit through a menu row insert) and the unit tests beside the three
  components, the hook, the serializer and the comparator. Not changed here: slash insertion
  still lands the caret in the paragraph after a new table, code block or callout (review
  §1.5); Cmd+Z inside a code block's textarea reaches the app's undo as any Cmd+Z does.

### Tables are ragged on disk and stay ragged

- **A row holds exactly the cells its Markdown line holds** (2026-09-07). The parser neither
  slices a row wider than the header nor pads a shorter one, and the serializer writes each
  body row with its own cells; the separator row alone follows the header's width. Before
  this, `| 1 | 2 | 3 |` under a two-column header was written back as `| 1 | 2 |` on any save
  (review H9), and every short row was rewritten. A GFM reader ignores the extra cells and
  pads the short rows itself, so the file's meaning outside is unchanged either way; the
  bytes are what this rule protects.
- **The grid is drawn as wide as the widest row** (`tableColumnCount` in
  `utils/tableShape.ts`), header included, and a cell a row does not reach is drawn empty.
  A row gains cells only when one is written into it (`withCell` pads that row up to the
  written column and no further). **An explicit column operation may pad a row to the
  operated visual column, a passive open or save never pads anything**: adding or inserting a
  column makes that column in every row, so a short row is padded up to it first
  (`withColumnInserted`; `| Milk |` in a three-wide grid becomes `| Milk |  |  |  |` when
  column four is added), and a column drag moves what a short row has without leaving a
  hole (`moveCell`).
  Don't reintroduce a pad-on-read or a slice-to-header anywhere; keep the table's shape
  arithmetic in `tableShape.ts` rather than in the component or the hook.

### Dividers are selectable blocks

- **A divider (or an image) is addressed as a whole, Notion-style** (`isSelectableBlock` in
  `utils/domHelpers.js`; the state is `selectedBlockId`, one for both). A click selects it and a
  band appears around it, the block's own box with a 4px radius reaching 4px past the text
  column each side, accent at 10% (Light) / 18% (Dark), the rule inside lifted to accent at 40%
  so it stays visible in the tint; Backspace or Delete removes it; Enter opens a paragraph under
  it; Escape deselects and moves nothing; a printable character deselects and types where the
  caret already is. No hover state, default cursor: the editor stays clean at rest, and the block
  never changes height. The alphas live in `SpacerBlock`, theme-scoped by `theme.name`.
- **The arrow keys stop on it, and Backspace from the block below selects it first.** ArrowDown
  from the last line above selects the divider, ArrowDown again puts the caret at the start of the
  next text block; ArrowUp mirrors it. Backspace at the start of the block below (empty or not)
  selects the divider instead of merging text across a line the user can see; the second Backspace
  removes it and lands the caret at the start of the next text block (the end of the previous one
  if there is none), so a third Backspace merges as it always did. Code, table, callout and file
  blocks are still stepped over (`landingBefore` / `landingAfter` in `useKeyboardHandlers`).
- **The divider's root registers itself in the block ref map** from its own effect, so the gutter
  grip can lift it and drop geometry sees it; the grip centres on the rule itself
  (`firstLineRect` in `BlockDragHandle` takes a block's `hr` as its line), where the text-line
  fallback sat it 8px low. It must not share `EditableBlock`'s `elRef`: that
  ref's repaint effect would replace the rule with a `<br>` (a parsed divider carries `text: ""`).
  `findNearestBlock` skips non-editable blocks so the mouse-up caret never lands in it.
- Forward Delete at the end of the block above selects the divider first, as Backspace from
  below does; the second Delete removes it (the block-root rule, above).
- Deliberately absent: a hover treatment on the rule, a block menu, Duplicate or Turn into.

## Paste keeps the block you are in

The rule lives in `utils/pasteBlocks.ts`, shared by the internal (`text/boojy-blocks`) and
external multi-line paste paths; single lines paste inline.

- **A block holding text never changes type on paste.** Plain text merges at the caret and keeps
  the block's type, checked state and indent; plain lines with no blank line between them stay
  together as soft breaks inside that block, and a blank line in the clipboard starts a new
  block; structured Markdown becomes its own block beside it
  (in front when the caret is at the start, splitting the text in the middle). Only an *empty*
  block is taken over, and only by structure such as `## Heading` or `- [ ] task`. A single
  structured line does that too; anywhere else a single line pastes inline as text.
- **One terminal line ending on the clipboard is incidental** and is stripped (LF or CRLF). Most
  apps copy a whole line with its break, which is why pasting used to look random. A deliberately
  copied blank line still arrives as a block.
- **A selection inside one block copies as text**, as in every other editor; structure travels
  only when the selection spans two or more blocks (a triple-click that ends at the very start of
  the next block still counts as one). Copying a list item's text and pasting it on a blank line
  therefore gives the text without the list. That looks like a missing feature; it is deliberate.
- **A paste that keeps a block's id and type must repaint that element directly**
  (`repaintKeptBlock`). The editor skips React renders for text-only changes, so a state-only
  write reaches disk but never the page, and the next keystroke writes the stale page back over it.

## Narrow desktop is still desktop

**Width changes how much room Boojy Notes has, not what it is.** The mobile navigation model is a
touch-device thing, not a width thing. Three separate questions drive layout: is this a touch
device (`useIsMobile.ts`, misnamed; rename in the backlog), does the sidebar fit
(`useSidebarFits.ts`), is the sidebar open. On a narrow desktop window the sidebar floats over
the editor as an overlay; that is the app making room, not switching identity. Narrowing a
desktop browser therefore does not preview the mobile layout; use device emulation.

## Testing notes

- `Sidebar.test.jsx` asserts the CSS reveal hooks (class names, tabIndex) rather than computed
  opacity, because jsdom can't evaluate the GlobalStyles stylesheet. Its note-row test allows
  the ··· svg and forbids only the file icon.
- `useActiveNote.test.js` guards the persistence migration; `osTrash.test.ts` the legacy
  `.trash` migration and managed-file-only deletion; `SlashMenu.test.jsx` the keyboard-first
  selection against stationary-pointer hover.
- Theme mocks need `ACCENT.onAccent` or components using it throw. `activeTabBg` and
  `settingsTab` don't exist; don't reintroduce them in mocks.
