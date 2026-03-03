# Changelog

## Unreleased

### Features
- **Callout block rewrite** — Replaced emoji icons with Lucide line icons and native `<select>` with custom type picker dropdown (11 types with icons, colours, checkmark for active); switched from click-to-edit input/textarea to always-live `contentEditable` title and body; keyboard navigation: Enter in title focuses body, ArrowUp/Escape exits, Backspace on empty deletes block, ArrowUp/Down at body edges navigates between blocks
- **Callout alias resolution** — Obsidian aliases (`caution`, `hint`, `error`, `todo`, `faq`, `cite`, `tldr`, etc.) resolve to canonical types on parse while preserving the original alias in `calloutTypeRaw` for round-trip fidelity
- **Callout collapsible syntax** — `+`/`-` fold suffixes (`> [!note]+`) parsed and preserved in round-trip

### Bug Fixes
- **Callout type picker scroll jump** — Fixed page scrolling to top when opening the type picker; render picker via React portal to `document.body` instead of inside the scroll container; added scroll-save/restore guard via `useLayoutEffect` to prevent residual scroll resets caused by blur→commit→re-render and type-select→re-render paths
- **Consecutive callouts** — Fixed parser consuming the second callout's `> [!type]` line as body text of the first callout
- **Callout search indexing** — Callout title text now included in full-text search index

### Improvements
- **Callout visual tweaks** — Removed colored left border strip, increased background opacity from 6% to 20% for better visibility, aligned body text with icon (removed 31px left padding)
- **Code block — seamless card** — Removed inner box/border from `<pre>` overlay so the code block renders as one clean card
- **Code block — 4-space tabs** — Tab key now inserts 4 spaces (was 2); Shift+Tab removes 4 spaces
- **Code block — trimmed language list** — Removed Rust and Dart from dropdown; kept Plain, JavaScript, TypeScript, Python, HTML, CSS, JSON, Bash, SQL
- **Code block — removed indent guides** — Removed thin vertical indent guide lines for a cleaner look
- **Code block — language label dropdown** — Click the language label (bottom-right) to open a dropdown and change language; hover brightens the label; always shows "Plain" when no language is set
- **Code block — full language names** — Language label now shows "JavaScript", "Python", etc. instead of short codes like "js", "py"
- **Code block — stronger border** — Default border opacity increased from 6% to 10%, focus border from 10% to 18%

### Bug Fixes
- **Code block — blank first line & bracket artifact** — Stripped leading/trailing newlines from code display to fix empty first line and textarea/overlay misalignment; added `display: block` to `<code>` element to prevent anonymous block box rendering issues
- **Code block — overlay double-spacing** — Fixed double line breaks and blank top line in code overlay caused by `\n` between `display:block` spans inside `<pre>`; also removed trailing newline that added extra blank line at bottom
- **Code block — selection artifacts** — Fixed browser default highlight bleeding through textarea by adding `-webkit-text-fill-color: transparent` and custom `::selection` style

### Features
- **Code block rewrite** — Replaced header-bar + double-click UX with always-editable textarea + syntax-highlighted overlay; hover-only copy icon (SVG) with green checkmark feedback; bottom-right language label; right-click context menu with "Change Language" submenu (now includes Rust & Dart); Tab/Shift+Tab indent/dedent; Enter with auto-indent; Escape exits to next block; ArrowUp/Down at edges navigates between blocks; Backspace on empty deletes block
- **Link system** — External links render with ↗ icon in soft blue (#6ea8d8), wikilinks in teal (#A4CACE)
- **Single-click to open links** — External links open in browser, wikilinks open note (no modifier key needed)
- **URL hover tooltip** — Shows full URL after 500ms hover delay
- **Right-click context menu on links** — Open, Copy, Edit, Remove actions; broken wikilinks show Create Note option
- **Ctrl/Cmd+K link shortcut** — Insert or edit links via keyboard shortcut with inline popover; also available from floating toolbar
- **Smart paste** — Paste URL over selected text to create `[text](url)` link; paste standalone URL to create clickable link
- **Bare URL auto-detection** — Typed or pasted URLs auto-convert to clickable links with ↗ icon
- **Broken wikilink detection** — Links to non-existent notes rendered with dashed underline in muted color

### Features
- **Obsidian compatibility — code blocks** — Fenced code blocks (` ``` `) now parse, render with Prism.js syntax highlighting, and round-trip perfectly; supports 8 languages (JS, TS, Python, HTML, CSS, JSON, Bash, SQL); double-click or Enter to edit in monospace textarea; language selector dropdown; copy button; `/code` slash command; typing ` ``` ` auto-converts to code block
- **Obsidian compatibility — frontmatter** — YAML frontmatter (`---` at file start) now preserved as a collapsible block showing property count; click to expand and view key-value pairs; round-trips without data loss
- **Obsidian compatibility — callouts/admonitions** — `> [!type]` syntax renders as styled callout blocks with left border, icon, and title; 11 types supported (note, info, tip, warning, danger, success, question, quote, example, bug, abstract); editable title and body; type selector dropdown; `/callout` slash command
- **Obsidian compatibility — tables** — Markdown tables (`| ... |`) render as HTML tables with individually editable cells; Tab/Shift+Tab cell navigation; Enter in last row adds new row; hover toolbar with +Row, +Column, -Row, -Column buttons; `/table` slash command creates default 3x2 table
- **Obsidian compatibility — wikilinks** — `[[Note Title]]` and `[[Target|Display]]` syntax renders as dotted-underline links; Ctrl/Cmd+Click opens the target note or creates it if it doesn't exist; round-trips to markdown without data loss
- **Backlinks panel** — Below each note's content, a "Backlinks" section lists all notes that reference the current note via `[[wikilinks]]`; click to navigate directly to the source note
- **Strikethrough formatting** — `~~text~~` renders as strikethrough; `Cmd+Shift+S` keyboard shortcut; button in floating toolbar
- **Highlight formatting** — `==text==` renders as highlighted text with a subtle yellow background; `Cmd+Shift+H` keyboard shortcut; button in floating toolbar
- **Inline tags** — `#tag` renders in accent color (not confused with `#` headings at line start)
- **Multi-line markdown parser** — Rewritten parser from line-by-line `for` loop to stateful `while` scanner; correctly handles code fences, tables, callouts, and frontmatter spanning multiple lines

### Bug Fixes
- **Live file sync — editor blocks** — External file changes (terminal, Finder, other editors) now update the editor's contentEditable DOM by bumping a shared `syncGeneration` counter, ensuring `EditableBlock` re-syncs its innerHTML
- **Live file sync — title** — Renaming a note's `.md` file externally now updates the title bar; `useLayoutEffect` dependency includes the actual title text instead of only the active note ID
- **Live file sync — new folders** — Creating files in new folders externally now makes both the folder and note appear in the sidebar; `onFileChanged` adds unknown folders to `customFolders`, and `onFileDeleted` re-merges folders after re-read

### Features
- **Full-text fuzzy search** — Sidebar search now searches note titles AND body content with typo tolerance; results grouped by folder with highlighted snippets; keyboard navigation (arrows + Enter) scrolls to and briefly highlights the matching block in the editor; clear button and Escape to dismiss; 150ms debounced for snappy typing; custom fuzzy matching with score-based ranking (no external dependencies)
- **Integrated terminal** — Fully functional multi-instance terminal in the right panel powered by `node-pty` + `xterm.js`; tabbed interface matching the note tab design; spawn real PTY sessions (zsh/bash) with 256-color support; `Cmd+\` toggles panel, `Cmd+Shift+T` creates new terminal, `Cmd+Shift+W` closes active terminal, `Cmd+K` clears, `Cmd+F` searches output; tab context menu with Rename, Clear, Restart, Kill; clickable URLs open in browser; auto-resizes with panel; press Enter to restart exited processes; PTYs cleaned up on app quit
- **Draggable title bar** — Hold non-interactive areas of the top bar to move the window; buttons, tabs, and resize handles remain fully clickable
- **Trash / Recycling Bin** — Deleted notes move to a `.trash/` folder instead of being permanently destroyed; 30-day auto-purge on startup; collapsible Trash section in sidebar with age labels; right-click to Restore or Delete permanently; Empty Trash button; folder deletion moves all contained notes to trash individually; trash persists across restarts via `.boojy-trash-meta.json`
- **Block drag reordering** — Hold any block 400ms to drag and reorder; multi-block drag with text selection; Escape to cancel; auto-scroll near edges; Ctrl+Z reverts the entire drag
- **Sidebar drag reordering** — Hold notes/folders 400ms to reorder or move between folders; drop-into-folder with auto-expand; visual drop indicator line; order persists in `.boojy-meta.json`
- **Image blocks** — Insert images into notes via drag & drop from file explorer, clipboard paste (screenshots via Win+Shift+S / Cmd+Shift+4), or `/image` slash command with native file picker; images render inline with hover controls (accent border + delete button); stored as `![alt](.attachments/noteId/file.png)` in markdown for Obsidian/VS Code portability
- **Image storage** — Images saved to `.attachments/{noteId}/` directory inside the vault; `boojy-att:` custom protocol resolves paths efficiently without base64 overhead; attachment directories cleaned up automatically on note deletion
- **Inline formatting** — Bold (`Ctrl+B`), Italic (`Ctrl+I`), and Inline Code (`` Ctrl+` ``) via keyboard shortcuts or floating toolbar; stored as markdown tokens (`**bold**`, `*italic*`, `` `code` ``) in block text for full .md file compatibility
- **Floating toolbar** — Notion-style bubble toolbar appears above selected text with Bold, Italic, Code, and Link buttons; shows active format state; disappears on selection collapse
- **Links** — Markdown links `[text](url)` and bare `https://` URLs auto-render as clickable links; Ctrl+Click opens in browser; Link button in toolbar prompts for URL
- **Numbered lists** — Type `1. ` to create a numbered list; auto-numbering across consecutive numbered blocks; Enter continues the list; empty item + Enter converts to paragraph; `/numbered` slash command; persists as `1. text` in .md files
- **Rich paste** — Pasting HTML from web pages preserves bold, italic, and code formatting while stripping all other tags
- **Arrow key navigation between blocks** — ArrowUp/Down now moves the cursor between blocks when at the first/last line of a block (Obsidian-like behavior); ArrowUp from the first block still moves to the title; spacer blocks are skipped
- **Cmd/Ctrl+N** shortcut to create a new note from anywhere
- **Cmd/Ctrl+P** shortcut to open sidebar and focus search input

### Performance
- **Instant terminal startup** — Pre-spawns a warm PTY in the background 2 seconds after app launch; when the user opens a terminal, the already-running shell is claimed instantly instead of waiting 1-3s for `pty.spawn()` + shell init; pool auto-refills after each claim; falls back to normal spawn if no warm PTY is available; warm PTYs cleaned up on app quit

### Improvements
- **Codebase refactor** — Split monolithic `BoojyNotes.jsx` (~3,500 lines) into 17 focused files: 9 custom hooks (`useHistory`, `useNoteNavigation`, `useNoteCrud`, `useBlockOperations`, `useInlineFormatting`, `usePanelResize`, `useBlockDrag`, `useSidebarDrag`, `useEditorHandlers`), 2 utility modules (`domHelpers`, `sidebarTree`), and 5 components (`TopBar`, `Sidebar`, `EditorArea`, `ContextMenu`, `SlashMenu`); main file reduced to ~810 lines as a thin orchestrator
- Word count now strips markdown formatting tokens for accurate counts
- Inline code renders with monospace font, subtle background, and border
- Links render with accent color and subtle underline

### Bug Fixes
- Fix Enter on empty blocks appearing to do nothing — when `beforeText` is empty, `el.innerText = ""` stripped the `<br>` that gives empty blocks visible height, collapsing the old block to 0px; now sets `el.innerHTML = "<br>"` instead, keeping the block visible so the new line appears below
- Add missing app icon (`assets/icon.png`) and fix icon path in `electron/main.js` — the previous `build/icon.png` path was gitignored, so a fresh clone couldn't display the window icon
- Fix `setTabStyleB` crash on Ctrl+, — reference was stale after state rename to `tabFlip`
- Fix Settings crash when `storageLimitMB` is null/undefined — guard `storagePct` calculation and display
- Fix frontmatter parser not stripping surrounding quotes from YAML values
- Fix placeholder text ("Type / for commands...") never showing — `:empty` CSS pseudo-class doesn't match elements containing `<br>`; switched to `.empty-block` class driven by React state
- Fix font size setting not applying to editor — pass `settingsFontSize` through to `EditableBlock`
- Add delete confirmation dialog to prevent accidental note deletion

### Improvements
- Placeholder text ("Type / for commands...") now only appears on the first block of a note, reducing visual clutter on subsequent empty blocks
- Placeholder cursor now appears at the left edge instead of after the text — the hint renders as a faded overlay behind the blinking cursor
- Move brand assets (`boojy-logo.png`, `boojy-notes-text-N.png`, `boojy-notes.text-tes.png`) from repo root into `assets/`; delete unused `boojy-notes-full-name-text-logo.png` and `boojy-notes-settings-circle.png`; update all `<img src>` references
- Archive Flutter platform scaffolding to `flutter-templates` branch and remove local Flutter directories (`android/`, `macos/`, `windows/`, `ui/`, `.dart_tool/`, `build/`) from working tree
- Split `boojy-notes-mockup.jsx` monolith (3,344 lines) into focused modules under `src/`: constants (`colors.js`, `data.js`), utils (`colorUtils.js`, `storage.js`, `random.js`), components (`Icons.jsx`, `StarField.jsx`, `EditableBlock.jsx`, `SettingsModal.jsx`), and main component (`BoojyNotes.jsx`); no logic changes
- Gate dev tools (overlay, gear button, toast, Ctrl+. / Ctrl+,) behind `import.meta.env.DEV` — stripped from production builds
- Gate `console.warn` debug logging behind `import.meta.env.DEV`
- Remove unused icon imports (`NewNoteIcon`, `NewFolderIcon`, `TrashIcon`)
- Remove non-functional Trash button from sidebar (no trash feature exists)
- Remove non-functional help `?` button from top bar (no help content exists)
- Add click-outside dismiss for slash command menu
- Custom Electron menu — strips "Toggle Developer Tools" from production builds
- Set `app.setName("Boojy Notes")` for proper OS display
- Bump version to `0.1.0`; add `electron-builder` config for Windows/macOS/Linux packaging

### Bug Fixes
- Fix editor focus on new blank notes — cursor now appears reliably on first interaction; root cause was `placeCaret` mutating DOM (`<br>` → text node) during focus transitions, which destabilised browser selection state; `placeCaret` is now a pure selection operation (uses element-level `range.setStart(el, 0)` for `<br>` elements), `handleEditorKeyDown` recovers cursor when `rangeCount === 0` instead of silently swallowing keystrokes, removed `suppressEditorFocus` complexity in favour of a `mouseIsDown` ref that lets `handleEditorFocus` defer to `handleEditorMouseUp` during clicks, and added `console.warn` debug logging at all recovery points
- Fix block ID churn in Electron — `useFileSystem` now compares incoming blocks structurally (type, text, checked) and skips state updates when chokidar echoes back files we just wrote, preventing unmount/remount cycles that wiped focus
- Fix double-newline block separation in saved `.md` files — blocks now join with single `\n` (Obsidian-style), and parsing splits on single newlines so each line becomes its own block

### Improvements
- Remove YAML frontmatter from local `.md` files — notes are now clean markdown (Obsidian-style), with title derived from filename and folder from directory structure; note IDs persisted in `.boojy-index.json`

### Features
- **Notes folder chooser in Settings** — desktop (Electron) users can view and change their vault directory from Settings → Sync; default path changed to `~/Documents/Boojy/Notes/`
- **Electron desktop app** — notes stored as real `.md` files on disk (`~/Documents/Boojy/Notes/`), browseable and editable with Obsidian, VS Code, etc.
- Chokidar file watcher detects external edits and syncs them into the app in real-time
- `useFileSystem` hook for filesystem persistence with 500ms debounced writes
- Title/folder renames automatically move files on disk; deletes remove files
- One-time migration: existing localStorage notes written to disk on first Electron launch
- `dev:web` script preserves pure browser development without Electron
- Vault directory configurable via native folder picker

### Bug Fixes
- Fix cursor not appearing after Enter on title or clicking below editor — `mousedown` on the click-below area was defocusing the contentEditable editor before `onClick` could restore it; switched to `onMouseDown` with `preventDefault`; title Enter now explicitly focuses the editor div before placing the caret
- Fix editor body not accepting text input — empty blocks now use `<br>` for caret anchoring so Chromium places the cursor inside the block element
- Fix title→editor caret not appearing on Enter — replaced manual `focus()`/`placeCaret()` with the standard `focusBlockId`/`focusCursorPos` ref pattern to avoid race conditions with React's render cycle
- Fix click-below-editor focus using same ref-based pattern instead of `setTimeout`/`placeCaret`

### Features
- Store notes as portable markdown (`.md`) in R2 instead of JSON — YAML frontmatter for metadata, markdown body for content
- Backward-compatible pull: auto-detects legacy JSON vs new markdown format on sync
- `blocksToMarkdown()` / `markdownToBlocks()` converters for all block types (p, h1–h3, bullet, checkbox, spacer)

### Previous Bug Fixes
- Fix "New Folder" button hidden when no folders exist — button was gated behind `filteredTree.length > 0`
- Fix caret not appearing in Chromium/Electron browsers (Cursor) — ensure empty blocks have a text node for caret anchoring, use `requestAnimationFrame` for title→editor focus transition, and focus existing empty block on click-below
- Fix slash command menu not triggering in Chromium/Electron — strip leading/trailing newlines and trim whitespace before checking for `/`
- Fix Edge Function 401 "invalid JWT" — disable gateway JWT verification (functions verify auth internally)
- Keep settings panel open after OAuth login (Google/Apple redirect no longer closes it)
- Fix Enter key intermittently not creating new blocks in the editor
- Fix slash commands (`/`) not opening the command menu
- **Fix React/contentEditable race conditions** — `cleanOrphanNodes` was running on every render, destroying browser selection state; now only runs after structural ops (Enter/Backspace)
- **Fix focus placement timing** — ref registration and cursor placement now use `useLayoutEffect` (synchronous after DOM update), ensuring refs are ready before focus is placed
- **Fix blockRefs race condition** — parent `useEffect` was clearing all refs AFTER child components registered them
- **Fix duplicate block IDs** — `genBlockId()` now includes timestamp to avoid collisions with existing blocks from localStorage
- Strip trailing newline from `innerText` reads (browser `<br>` artifact)
- Prevent cursor from escaping block structure — guard keydown, input, and click events
- Improved `placeCaret` with `isConnected` check, return value, and fallback recovery
- Snap cursor to nearest block on clicks between or below blocks
- Suppress React `contentEditable` warnings on bullet/checkbox wrapper elements
- Fix sync parse errors for non-JSON remote notes (moved parsing outside React state updater)
- Fix title-to-editor focus transition — `placeCaret` now focuses the contentEditable ancestor before setting selection
- Fix click-below-editor not placing cursor in new block when editor wasn't previously focused

### Improvements
- Auto-select "Untitled" text when creating a new note — typing immediately replaces placeholder title
- Memoize `EditableBlock` with `React.memo` — prevents all blocks from re-rendering on every keystroke
- Stabilize `flipCheck` and `registerBlockRef` with `useCallback` for proper memoization

### Features
- Cloud sync via Supabase Edge Functions + Cloudflare R2 storage
- `sync-push`, `sync-pull`, `sync-delete` Edge Functions for note CRUD
- Client-side sync service with automatic change detection and debounced push (5s)
- `useSync` hook — watches noteData for changes, auto-syncs dirty notes
- First sync pushes all local notes to server; subsequent syncs are incremental
- Live sync status in Settings (Synced/Syncing/Error indicator, last synced time, storage bar)
- "Sync now" button for manual sync trigger
- Supabase Auth integration — real email/password sign-in and sign-up
- Google and Apple OAuth sign-in via Supabase
- Separate Sign In and Create Account flows (signin default, create via link)
- Display name field on account creation (stored in Supabase user metadata)
- Show/hide password toggle (eye icon) on both sign-in and create forms
- Post-signup "Check your inbox" screen with Resend button (Supabase Confirm email ON — blocks login until verified)
- Email auth form with inline validation and error display
- Auth state persists across page refreshes (Supabase session)
- `useAuth` hook for centralized auth state management
- Environment-based Supabase config (`.env.local`)
- Convert Settings from in-editor tab to glassmorphism modal overlay
- Settings modal with sidebar navigation and centered header
- Backdrop blur (8px) with click-outside and Escape key to close
- Accent-coloured section headers matching Boojy Suite design pattern
- Split Cloud section into Profile (account/auth) and Sync (status/storage)
- Sync section only visible when logged in (4 sidebar items vs 3)
- Sidebar active state changed from left border strip to pill highlight
- Fixed sidebar icon alignment with 20px icon area
- Mock sign-in/sign-out flow for prototyping
- Remove About section; branding moved to sidebar footer (logo + N●tes + version) and content footer (Made by Tyr @ boojy.org)
- Replace emoji sidebar icons with SVG line icons (profile, cloud, sun)
- Remove gear icon from settings header
- Reorder sign-in buttons: Email first, then Google, Apple
- Increase modal opacity to 0.95 to match app chrome
- Replace settings overlay modal with full Settings tab in editor area
- Settings opens via ● sync dot as a singleton tab (no duplicates)
- Settings page with three sections: Boojy Cloud, Appearance, About
- Boojy Cloud section with sign-in buttons (Google, Apple, Email) — visual only for now
- Appearance section with font size +/- controls and disabled spell check toggle ("coming soon")
- About section with N●tes wordmark, version + check for updates, Made by Tyr @ boojy.org
- Move New Note and New Folder creation into sidebar as inline "+ New Folder" and "+ New Note" buttons
- Add `createFolder` function with auto-rename mode and duplicate name handling
- Custom folders persist to localStorage and survive page refreshes

- Settings v2: card wrappers, smaller centered sign-in buttons, branded About section
- Per-note seeded star fields — each note has its own unique sky
- Star field no longer flashes on sidebar drag or window resize

### Improvements
- Shrink sidebar footer branding to watermark size (~12px) so it doesn't compete with nav items
- Add 7px breathing room above version text and content footer
- Bolder sidebar icons (strokeWidth 1.5 → 2)
- Simplify top bar right section — remove create buttons, keep only panel toggle, word count, and help
- Folder/note sections separated by spacing instead of divider line
- Create buttons hidden during search to avoid clutter
