# Boojy Notes — Backlog

Direction, what is left to do and what is known to be broken, checked against master on
2026-09-06. Shipped work goes in `CHANGELOG.md`, never here. The philosophy: finish Beta,
daily-drive Boojy Notes, and let observed friction decide what deserves to exist next. Nothing
is added because it sounds plausible.

Three tiers, kept apart. **Release requirements** are what Beta waits for. **Beta candidates**
are optional; each is judged on its own and may be declined. **Future** is everything after
Beta, recorded so a preference and its open question are not lost. Last reviewed: 2026-09-06.

## Direction

Boojy Notes sits between Apple Notes, Obsidian and Notion: approachable writing, ordinary
Markdown files, lightweight organisation and easy movement between apps. All three audiences
inform the defaults; Notion's editing convenience is the reference and its clutter the thing to
avoid. Bring existing notes in, create and edit without ceremony, find them again, keep the
files. Migration quality, editing comfort and access across devices are expected to matter
more than any feature nobody else has. That is a product hypothesis, not validated demand.

- **Beta is desktop-first**: local files, no account, no sync. Web, mobile, accounts and cloud
  come after desktop; their sequence is undecided. Personal tools only; collaboration is
  excluded.
- **Everything is free, including cloud sync and storage when they exist.** Limits, if any,
  reflect hosted resources (file size, total storage, retained history); no quota is chosen.
  Sustainable hosting is unresolved and is measured on a prototype before any public limit.
  The suite-level decision is in the suite root's `VISION.md`: Boojy Cloud returns free-only
  if it returns. There is no paid tier, planned or as a fallback.
- **Obsidian compatibility and Notion-first import are complementary.** Existing Markdown
  folders, Obsidian vaults included, open as they are (the spec's support levels). Notion is
  the first migration priority; Apple Notes follows.
- **One visible note and one New Note workflow.** Opening a note replaces it; no tabs, no
  split view. Every entry point (the button, Cmd+N, a folder's menu, any later global shortcut
  or share action) runs the same creation; there is no separate quick-note type.
- A small interface can still carry power through search, context menus and shortcuts. The
  subtraction pass of 2026-09-05 (`CHANGELOG.md`, Removed) is the standard for what stays.

## Open decisions

Product calls for Tyr; each trades conventional Markdown meaning against byte preservation.

- **A paragraph typed straight after a quote is folded into the quote by other readers.** A lazy
  line read from a file stays its own paragraph so its bytes survive (quote lines are written
  with `> `), which means no blank line can be written before a paragraph after a quote. Fixing
  it needs a way for a quote to remember a lazy line without hidden per-block state. On record as
  one `it.fails` in `tests/utils/markdownInterop.test.js`.
- **Blank lines around headings, lists, fences and quotes are empty rows.** Only the blank line
  between a paragraph or list item and the paragraph or divider after it is structure; every
  other blank is a visible row, so an Obsidian-style note, which puts a blank line around nearly
  every heading, reads airy in the editor. The blank *after* a divider is the same case (the one
  before it became structure on 2026-09-05, because without it `---` is a heading underline).
  Making one such blank structural too keeps the common form tidy but needs a per-block "written
  tight" record to keep the rarer tight form byte-identical.
- **A `---` directly under a paragraph line is read as a divider, not a setext heading.** To
  every other reader `hello` / `---` is a heading called "hello"; Boojy Notes shows a paragraph
  and a rule, and its first save writes the blank line that makes the file a divider everywhere
  (a sanctioned byte change, see the spec). Reading it as a heading would be right and needs a
  setext heading form the serializer can write back byte-exact. On record as one `it.fails` in
  `tests/utils/markdownInterop.test.js`.

## Beta: release requirements

Beta starts when the local desktop app feels complete enough for ordinary daily use that
missing core features no longer limit it. Worked one item at a time, each judged live. This
list is the product scope the release waits for; the CI gates and any serious data-loss bug
found on the way gate it as well, without needing a line here.

- [ ] **Tables** — finished-feeling basic interaction: visible cells, caret in the first cell,
  Tab to the next cell, whole-table delete. Not started; Tyr gives the go. Arrow-key movement
  between cells is an extension to judge then, not a requirement.
- [ ] **Copy pass on Quote and Checklist.** The rest of the subtraction pass landed on
  2026-09-05 (`CHANGELOG.md`, Removed).
- [ ] **Preservation blockers** — the two first-edit mutations marked under Data safety below.
- [ ] **Visual polish and a Windows smoke test.**
- [ ] **Publish the tested build.** Testers and the website only ever see the last *published*
  release, never the daily-driver build, so a Beta that lives only in `/Applications` is not
  released. `CHANGELOG.md` Unreleased holds the notes; the release runs the docs pass in
  `AGENTS.md` and the draft-release steps in the CI rule.

## Beta: candidates

Optional. Each is considered on its own, judged by daily-drive friction, and may be declined;
none blocks the release. The shared question comes first because three candidates wait on it.

- **Where app metadata lives.** Favourites, folder appearance and any later archive state need
  something the Markdown cannot hold. The spec permits app metadata outside the note (the note
  index already lives in userData). Options: userData (per machine, lost with the vault) or a
  dotfile in the vault such as `.boojy/` (travels with a provider-synced folder, visible to
  other tools). Still to weigh: how an entry follows a folder or note through the app's own
  moves and through external renames, and whether losing it on an external rename is
  tolerable. Two fixed requirements: losing it must never damage a note, and existing
  `.boojy-meta.json` files stay untouched and unread. Decide once.
- **Note information** at the bottom of the note's ··· menu: "428 words · Edited today at
  11:37", exact timestamp on demand, counting written content rather than Markdown punctuation.
  Edited follows the sort's recency rule (rename and move count; opening never does); imports,
  external changes and appearance changes need the same rule stated once.
- **Favourites.** A Favourite action; a Favourites list that appears with the first favourite
  and disappears when empty; the note stays in its folder and the list is a second route to it.
  One concept, not Favourite and Pin. Open: ordering, placement (a sibling list above the vault
  header keeps the one-tree rule), whether folders qualify. Needs the metadata decision.
- **Folder colours and icons.** Colour the folder glyph, keep the label and row neutral; Light
  and Dark variants; selection never colour-only; a reset to the default folder. The reference
  used outline icons, not emoji, roughly 25–30 icons and 7–8 colours; the catalogue is
  undecided (a smaller first set drawn from Lucide is one option). Never renames a
  directory or adds emoji to its name. Needs the metadata decision. Not approved: per-note
  icons (small optional icons beside titles if ever revisited, never page covers), and
  arbitrary text or background colour inside notes (no portable Markdown syntax; word-level
  colour stored outside the file breaks when another editor changes the text; `==highlight==`
  is already an extension).
- **Editable Markdown source view** from the ··· menu and a shortcut; no permanent toggle. Two
  views of one note, one visible at a time. Switching alone never changes bytes; both views
  edit the same document with no lost pending change; undo and the caret behave coherently
  across a switch; unsupported syntax is visible and preserved; source mode is identifiable
  with an obvious way back. It is the one UI the preservation promise has, the tool for
  checking what an import did, and useful for unfamiliar syntax. A first version may commit
  source edits as one history entry on the way back.
- **Notion import.** The first migration priority; whether it ships in Beta is undecided.
  Notion exports Markdown and CSV in a ZIP. Proposed flow: pick the ZIP, preview the
  conversion, choose a destination, review a report that counts notes and attachments and
  lists what was skipped or simplified. Must handle page hierarchy, duplicate titles,
  attachments and internal links; databases need an explicit policy (simple tables, or folders
  of notes with an index, keeping the CSV). Sources stay untouched; duplicate detection on
  repeated imports is worth considering. No live databases, relations or Notion layouts, ever.
  Next step, which sets the scope: gather representative exports and study what they contain;
  proving the conversion as a script over fixtures before any UI is one way to do that.
  Distinct from the File menu
  Import removed on 2026-09-05: a one-time journey with a report, not a converter.
- **Visible Undo and Redo controls.** Keyboard-only on desktop; the touch toolbar already
  carries them at its fixed left edge (see Technical debt for the rule that says otherwise).
  Desktop and touch are judged separately, and the answer may be no. For reference: Apple shows a button on iPhone and iPad, Notion keeps them in its
  mobile ··· menu, Obsidian is keyboard-only.
- **Move to…** for a single note: a destination without dragging (drag and the bulk menu cover
  it today).
- **Back and Forward** through recently open notes, remembering caret and scroll position.
  Controls unchosen; Cmd+[ and Cmd+] is the convention.
- **Context menu on plain text** and **rich paste** are listed under Known issues; promoting
  either is a candidate call, not a fix.
- **A Recent list** in the empty search palette, if the last-touched note proves hard to get
  back to. **A muted "N other files" hint** on folders holding files the app cannot open
  (Reveal in Finder answers it for now).
- **More New Note entry points** (a global shortcut; a share action on mobile later) run the
  same workflow. Initial focus, location and the moment an empty note becomes a file are
  undecided for every entry point. Not accepted: deriving the title from the first line.

## Known issues

### From the September 2026 review

Still reproduce on master, in the review's order. None blocks Beta on its own.

- [ ] **New note writes `Untitled.md` at once** — `createNote` makes a real note, so the sidebar's
  New note and Cmd+N reach disk within a second even if nothing is typed; only the empty-state
  draft waits for content (`useNoteCrud.js`). Cmd+N reuses an active draft where the button
  creates a real note: the one inconsistency in the New Note workflow, to be resolved with the
  focus and empty-file questions above. Prior art: at v0.2.0 an empty note reached disk only
  when something was typed.
- [ ] **A new folder's name is not selected** — the inline input autofocuses but does not select
  "Untitled Folder", so typing appends (`Sidebar.jsx`); note rows do select.
- [ ] **No context menu on plain text** — the editor's right-click handles links only and Electron
  supplies no default menu, so cut, copy and paste have no menu on desktop (`EditorArea.jsx`).
- [ ] **Rich paste is flattened** — paste reads `text/plain` only, so links and formatting from a
  browser or another app are dropped (`usePasteHandler.js`).
- [ ] **Sidebar drag needs a 400ms hold** before a note lifts (`useSidebarDrag.js`); no hint until
  the third attempt.
- [ ] **A cleared title shows a blank sidebar row** until the next write adopts `Untitled`.

### Data safety / reliability

**First-edit mutations.** Fine on open; the first edit of an affected note rewrites third-party
content. `KNOWN_FAILURES` in `tests/utils/preservation.test.js` is the full list; these two block Beta.

- [ ] **Tilde fences (`~~~`) parse as paragraphs** — the fence lines round-trip byte-exact, but
  the content renders as live blocks, so interacting with it rewrites code, and content that
  matches a normalising construct (tables, `- [X]`, `[!NOTE]`, bare `>`) is rewritten on any
  save. The fence matcher in `markdown.js` is backtick-only.
- [ ] **Table `:---` separators normalise to `---`** on first edit.

**Lost edits and filesystem.**

- [ ] **Concurrent flushes are not serialised** — blur, quit and the write-debounce timer can
  each run `flush` at once (`useFileSystem.js`, `useQuitFlush.js`). A flush now cancels the
  pending timer, so what remains is a redundant write when two overlap, and a theoretical
  mid-write kill if the quit handshake completes while a blur write is in flight (the atomic
  rename keeps the last complete file).
- [ ] **Rename crash window** — a crash between unlink and index save re-IDs the note; a crash
  before unlink leaves a visible duplicate that needs manual cleanup.
- [ ] **Double-close races** — `ipcMain.once` flush listeners accumulate on rapid Cmd+W then
  Cmd+Q; no renderer-alive check before the flush IPC, so a crashed renderer burns the 2s cap.
- [ ] **Orphaned `.*.tmp` files** after a crash followed by a rename.
- [ ] **Numbered lists keep their parsed number after an in-app reorder** — dragging item 3
  above item 1 saves `3. 1. 2.`; lossless on round-trip, wrong in any other renderer
  (`markdown.js` `numCounter`).
- [ ] **Wikilink rename does not update referrers** — silent link breakage.
- [ ] **Search index goes stale on text-only edits**, and results cap at 20.
- [ ] **Unparseable files vanish from the sidebar** silently.

### Accessibility

E2E axe only catches critical violations on the initial screen. Known gaps below that:

- [ ] **Sidebar focus ring is invisible** — inline `outline:none` overrides the global ring, and
  the global ring is 25% opacity (`Sidebar.jsx`, `GlobalStyles.jsx`).
- [ ] **Context menus are `<div onClick>`** (Link/Table/Image/Slash/CalloutPicker): not
  keyboard-reachable, no roles or focus traps. SlashMenu's `aria-selected` on `menuitem` is
  invalid.
- [ ] **NIGHT `TEXT.muted` fails AA contrast** (`themes.js`); DAY was fixed, NIGHT was left for
  a later pass.
- [ ] **Sidebar tree has no arrow-key navigation** and lacks `aria-level`/`setsize`/`posinset`
  (`Sidebar.jsx`).

### Technical debt

- **`useIsMobile` → `useIsTouch`** — the hook answers "is this a touch device", not "is the
  window narrow"; `useSidebarFits.ts` already owns the fit question.
- **Playwright shells out to npm** — `playwright.config.js` runs `npm run build && npm run
  preview`, so CI builds twice and the pnpm repo logs an unknown-config warning. Use pnpm.
- **`tests/electron/markdown.test.js` is misfiled** — it tests `src/utils/markdown.js`; move it
  beside `tests/utils/markdown.test.js` (no overlapping test names).
- **`ExportTab.jsx` renders Storage** — export was removed; rename to `StorageTab`.
- **`ci.yml` push trigger never matches** — it watches `feature/**`, branches are `feat/…`;
  the PR trigger covers everything. Fix the glob or drop the push trigger.
- **`engines.node` says `>=18`** — Vitest 4 needs 20, Electron 42 needs 22.12, CI pins 22.
- **Block IDs are minted on every re-parse** — `markdownToBlocks` uses a module-global counter,
  so a re-sync remounts every block and loses the caret. Fix is content-stable IDs; non-trivial.
- **`TagMenu` swallows the space that ends a tag** — `preventDefault` on space-dismiss.
- **The UI rule's "Undo/redo are keyboard-only" line is wrong for touch** — the touch toolbar
  (`MobileToolbar.jsx`) shows Undo and Redo at its fixed left edge. The rule should say
  desktop. The rest of the touch layout's grammar (two screens, fixed-edge toolbar, long-press
  FAB, bottom-sheet menu) is recorded nowhere in the rules either; the archived
  `docs/private/archive/mobile-spec.md` header lists it. Write both up in
  `.claude/rules/ui-chrome-and-theme.md` the next time a change touches the touch layout.
- **`[perf]` warnings ship in production** — `console.warn('[perf] …')` timing lines remain in
  `EditorArea.jsx`, `useAppPersistence.js` and `useHistory.js`; gate them or remove them.
- **A failed update check is swallowed** — `autoUpdater.checkForUpdates().catch(() => {})` in
  `electron/settingsManager.js` hides the failure from the user; the other empty catches are
  localStorage guards and are fine.

## Future, after Beta

Recorded so a preference survives; nothing here is scheduled, and nothing here is an
instruction to start. Each line carries the direction taken and what is still open. The dated
research behind these (checked 2026-09-06, with links and cost tables) is the archived
discussion record in `docs/private/archive/`.

### Migration and portability

- **Obsidian: open the files.** Conventional Markdown, lists, tables and alignment, relative
  attachment paths, wikilinks and aliases, heading links, callouts, frontmatter, and
  preservation of everything else. Compatibility with a document never requires the feature
  that produced it; plugin syntax stays preserved source, never executable. Graph, Canvas and
  plugin configuration are outside the promise.
- **Apple Notes.** The Mac exports Markdown per note (File → Export as → Markdown); dropped
  into the vault, that works today, and bulk export is the gap. A later Mac importer could
  follow the route Obsidian's Importer proves (images, scans, PDFs, note links; locked notes
  unlocked first): evidence of feasibility, not a decision to reuse it. Good formatted paste
  helps with a few notes. Attachments, dates and formatting need tested policies.
- **Export.** Desktop already exposes the files. A web or mobile build must offer a folder or
  ZIP of Markdown and attachments with working relative links. Importing converts; editing an
  existing Markdown folder preserves.
- **Copy as Markdown and as formatted text.** Useful clipboard representations for moving
  content between apps. Define selection, whole-note and attachment behaviour. Whole-note
  Markdown is the file itself; how rich text is produced is open.

### Editor and organisation

- **Heading navigation or folding**, without another permanent panel. No choice yet between a
  heading picker (an `@` mode in the search palette would add no panel) and folding.
- **Archive.** "Keep it, remove it from everyday browsing", with no expiry. A real Archive
  directory is preferred (visible to Finder and other editors, ordinary files) over status
  stored separately (stable paths, simple unarchive, invisible to other apps). Costs of the
  preferred route: moves affect links and attachments, and restoring to the original place
  needs remembered information. Open: search scope, hierarchy inside the archive, unarchive
  destination, links into archived notes. Opening an archived note never restores it. Normal,
  archived and deleted stay three distinct states; no archive or Trash surface is authorised
  by the preference alone.
- **Version history**, which is not undo. Undo reverses recent actions with sensible
  boundaries for typing, pasting, formatting and moving blocks, and its scope across notes and
  sidebar operations must be explicit so it never silently alters an unseen note. History
  recovers older saved states: preview, restore safely, restore as a copy, and a restore
  preserves the current version. Local snapshots could come before cloud history; the
  mechanism is undesigned and is to be designed carefully when the work is active. For
  reference, Obsidian keeps local snapshots five minutes apart for seven days, both
  configurable; Notion gives 7/30/90 days by tier; Apple offers 30-day deleted-note recovery
  and no general version browser was found. Open: retention, attachment recovery, storage
  budget, a readable comparison. Neither sync nor history replaces an independent backup.
- **Conflict handling.** Competing edits must be understandable and recoverable; keeping both
  versions is the fallback; automatic merging needs carefully defined limits. One person on two
  offline devices is enough to cause it.
- **Open a single Markdown file** through Open With, without importing it or choosing a vault.
  Open: how to return to the usual collection, and how links and search behave with one
  document. One option to evaluate is opening the file's folder as a temporary vault, which
  widens the experience from one file to a folder and may not be wanted.
- Deferred, neither approved nor ruled out: custom CSS, a plugin system, elaborate page covers.

### Platforms, sync and accounts

- **Sync: provider-synced folders first.** Evaluate Google Drive for desktop and iCloud Drive
  holding the vault locally, with the provider transferring files while the app edits them,
  before any Connect button or account. Offline placeholders, external changes, conflicts,
  renames and deletion need verification per provider; mobile access varies. One sync mechanism
  per collection, never overlapping. A direct Drive integration (authorisation, transfer,
  change tracking, recovery) is a larger later feature that free Boojy Cloud may make
  unnecessary; Drive authorisation is distinct from Google sign-in. CloudKit is an architecture
  to assess for Apple devices, not general access to iCloud Drive folders.
- **Web storage** needs its own design discussion. User-selected local folder (real files where
  the browser supports it; support and permission persistence vary, not a foundation for
  mobile, Safari or Firefox), browser-managed storage (offline without a folder; not visible,
  quota-bound, lost with site data), or cloud with offline storage (consistent across devices;
  needs accounts, sync, conflict recovery and a service). Cloud with offline capability was
  recommended; local-file behaviour is explicitly deferred. The spec keeps web outside the
  product promise until then.
- **Mobile shell** unchosen. One relationship to keep in view: the editor is `contentEditable`
  on the browser's Selection and Range APIs, so a shell that keeps the browser DOM (Capacitor
  and the like) can reuse it, and a shell that does not (full React Native, Flutter) means
  rebuilding the editor. Which of those to accept is part of the unchosen decision. Keyboard,
  selection, attachments, filesystem access and background sync need real-device evaluation. Drawer versus two-screen navigation was explored on 2026-04-06 and left
  undecided; the two-screen touch layout in `src/components/mobile` stands. The earlier
  Capacitor spec, mobile spec, navigation exploration and release strategy are archived in
  `docs/private/archive/` as reference, not plan.
- **Accounts: email-only** when accounts are needed (codes or links; session length open).
  Local desktop use never requires one.
- **Encryption undecided.** End-to-end (privacy; against it, recovery, new-device setup,
  browser access and implementation cost, and an email recovery flow cannot recover a lost key)
  against service-managed (simpler; more provider access and trust). No privacy or recovery
  promise before the approach is chosen and verified.
- **Free hosting.** When a quota is reached: local writing continues, nothing is deleted, the
  app distinguishes saved locally from synced. Still needed: account management, abuse
  controls, history accounting, a sustainable hosting budget. The September 2026 research put
  storage at about $0.015 per GB-month on R2 and the whole service at an illustrative $10–30 a
  month for 100 users up to $250–600 for 10,000, on stated assumptions; measure a prototype
  before setting any limit.
- **Deletion in the cloud.** A recoverable deleted state that needs no desktop Trash, plus a
  record of deletions so offline devices cannot resurrect notes.

## Not doing

No AI features or agents; no collaboration; no calendar; no Inbox; no daily-note feature; no
templates; no tabs or split view; no separate quick-note workflow; no paid tier. The spec
additionally excludes layouts and blocks that cannot round-trip to readable Markdown.
