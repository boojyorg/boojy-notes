# Changelog

## Unreleased

### Performance
- **Fix StarField animation bottleneck causing INP lag** — Cap canvas to viewport height (sticky positioning) instead of full scrollHeight (~64MB → ~5MB pixel buffer), replace expensive `ctx.shadowBlur` glow with cheap two-circle technique, cache layout dimensions to eliminate forced reflows from animation loop, replace continuous rAF with 5-second interval (near-zero CPU during typing), debounce ResizeObserver (200ms), wrap in `React.memo`. *(INP lag persists — additional bottlenecks remain elsewhere)*
- **Throttle localStorage persistence (web)** — Increased full noteData localStorage debounce from 300ms to 2000ms, reducing `JSON.stringify` calls ~7x during typing. Added `beforeunload` flush as safety net
- **Short-circuit EditorArea memo comparator** — Text-only edits now skip the O(n) block-structure comparison loop entirely via `textOnlyEdit` ref fast-path
- **Replace `structuredClone` with shallow block copy** — History snapshots use shallow spread + array copy instead of `structuredClone`, reducing snapshot time from ~2-5ms to ~0.5ms
- **Fix dead `textOnlyEdit` fast-path** — The EditorArea memo comparator fast-path was dead code because `noteTitlesKey` useMemo consumed and reset the flag before the comparator ran. Added separate `textOnlyEditForEditor` ref that EditorArea consumes independently
- **Optimize beforeunload effect** — Replaced `noteData`-dependent beforeunload effect with a ref-based approach, eliminating effect churn (listener teardown/re-register) on every noteData change
- **Add `[perf]` console diagnostics** — Temporary `console.warn` instrumentation on hot paths (cloneNote, localStorage writes, memo comparators, pointerDown) to identify INP bottlenecks in DevTools

### Bug Fixes (continued)
- **Fix service worker `Failed to fetch` error** — Added `.catch()` to background fetch in stale-while-revalidate strategy; added offline fallback response for API calls when both network and cache miss

### Improvements
- **Extract GlobalStyles component** — Moved the ~450-line global `<style>` block (keyframes, scrollbar styles, code block styles, link/wikilink styles, table styles, callout styles, Prism token colors) from `BoojyNotes.jsx` into a standalone `GlobalStyles` component
- **Extract DevOverlay component** — Moved the ~400-line dev tools overlay (color sliders, theme/style selectors, dev toast, gear button) into a lazy-loaded `DevOverlay` component that is tree-shaken from production builds via `React.lazy` + `import.meta.env.DEV` guard
- **EditorArea context migration** — `EditorArea` now reads `accentColor`, `editorBg` from `useLayout()` and `settingsFontSize` from `useSettings()` directly, removing 3 props from EditorArea and PaneContainer call sites and memo comparators
- **BoojyNotes reduced from 2,930 → 2,033 lines** (-897 lines, 31% reduction)

### Bug Fixes
- **Surface silent errors as toasts** — Added user-visible toast notifications for 5 previously silent error paths: trash loading failure, localStorage save failure (storage full), image save failure (`useBlockOperations`), image slash command failure, and file slash command failure (`useEditorHandlers`)

### Tests
- **53 new tests across 5 files** — `useNoteNavigation` (8 tests), `useSplitView` (24 tests), `useSearch` (13 tests), `TopBar` component (5 tests), `Sidebar` component (3 tests). Total: 348 → 412 tests, 20 → 25 test files

### Features
- **React ErrorBoundary** — New `ErrorBoundary` component catches unhandled React errors and shows a recovery UI with error details, stack trace, "Reload App" and "Copy Error" buttons. Automatically flushes `noteDataRef` to localStorage as emergency backup on crash
- **Toast notification system** — New `useToast` hook and `Toast` component for surfacing file operation errors (disk write failures, trash errors, directory changes) via dismissible bottom-left toast notifications with error/warning/info variants
- **Sync retry with exponential backoff** — Failed syncs now retry up to 3 times with exponential backoff (2s, 4s, 8s) before showing error state. New "retrying" sync state shows animated dot during retry attempts
- **Unhandled promise rejection logging** — Added global `unhandledrejection` listener in `main.jsx` for better error visibility

### Improvements
- **React Context extraction** — Extracted three contexts from the 3,077-line `BoojyNotes.jsx` god component:
  - `NoteDataContext` (split into data + actions sub-contexts for performance) — owns `noteData`, `setNoteData`, `useHistory`, `syncGeneration`, `activeNoteRef`
  - `SettingsContext` — owns font size, spell check, auto-update, AI settings, auth state, and related effects
  - `LayoutContext` — owns sidebar/panel dimensions, colors, tab styles, and panel resize logic
- **Prop drilling reduction** — `SettingsModal` dropped ~25 props, `TopBar` dropped ~15 props, `Sidebar` dropped 3 props, `TerminalPanel` dropped 4 props by consuming contexts directly
- **Test infrastructure** — Added supabase mock and `structuredClone` polyfill to test setup; added `makeNote` factory to test helpers; created `providers.jsx` with `mockContexts()` and `renderWithProviders()` for component tests

### Bug Fixes
- **Fix markdown shortcut reversion** — `commitNoteData` now cancels any pending debounced text flush before applying structural changes, preventing the 300ms timer from overwriting markdown shortcut conversions (`# ` → h1, `- ` → bullet, `[] ` → checkbox, etc.) with stale ref data
- **Fix blank screen on launch** — `useSync` referenced `editedNoteHint` before it was declared by `useHistory`; moved `useHistory` call before `useSync` to fix the ReferenceError
- **Fix missing favicon** — Added `<link rel="icon">` to `index.html` pointing to `favicon-32.png` in the public directory
- **Fix Geist font MIME type error** — Removed broken jsdelivr CDN link for Geist font that was returning `text/plain` instead of `text/css`; the font wasn't loading anyway, so this just eliminates a failed network request and console error

### Improvements
- **Sidebar caching: O(1) ref check** — Replaced O(n log n) folder-key string computation with a `textOnlyEditForSidebar` ref that skips `derivedRootNotes`/`folderNoteMap` rebuild entirely on text-only edits; cached `filteredTree` by input reference equality to avoid redundant `filterTree` calls when search/folder structure hasn't changed
- **Editor performance: 6 keystroke-path optimizations** — Pre-compile regex patterns at module scope instead of per-keystroke; use live DOM walking (`domNodeToMarkdown`) instead of double DOMParser round-trips; batch `setNoteData` calls with `requestAnimationFrame` to coalesce rapid keystrokes into one React update; debounce `savePersistedDirty` localStorage writes (1s) to avoid blocking main thread; skip `noteTitlesKey` recomputation on text-only edits; short-circuit sync dirty-detection loop with edited-note hint instead of iterating all notes
- **Pointer INP optimization** — Added CSS `contain: content` to all text block types (p, h1–h3, bullet, numbered, checkbox, blockquote) so layout changes in one block don't trigger reflow of sibling blocks; debounced `selectionchange` listeners via `requestAnimationFrame` to avoid forced synchronous layout from `getBoundingClientRect()` on every click
- **INP phase 2: sub-100ms keyboard interactions** — Removed 6 `[perf]` console.log calls from hot paths (2–5ms savings per keystroke in Chrome); wrapped debounced `setNoteData` flush in `startTransition` so React can interrupt reconciliation during user interactions; deferred `structuredClone` in `pushHistory` via `queueMicrotask` to move 5–30ms off the first-keystroke synchronous path; used `useDeferredValue` for word count so `stripMarkdownFormatting` runs in a subsequent frame; added folder-assignment key caching to skip sidebar `derivedRootNotes`/`folderNoteMap` rebuild on text-only edits

### Features
- **Tab / Shift+Tab block indentation** — Obsidian/Notion-style indent/outdent for bullet lists, numbered lists, checkboxes, blockquotes, paragraphs, and headings. Tab indents a block (up to 6 levels), Shift+Tab outdents. Visual rendering adds 24px padding per indent level. Bullet characters cycle through ● / ○ / ▪ by indent depth. Numbered lists maintain independent counters per indent level. Enter on an indented list item preserves indent; Enter on an empty indented list item outdents by 1. Backspace at position 0 or on empty indented block outdents before deleting/merging. Copy/paste preserves indent. Markdown serialization uses 2-space indentation for lists. Code blocks and tables are unaffected (they handle Tab internally).
- **Multi-provider AI chat panel** — Added AI chat as a tab type in the right panel, coexisting with terminal tabs. Users can create AI chat tabs via the new `[✦]` button in the tab bar. Supports Anthropic, OpenAI, Google Gemini, and local/custom models (Ollama, LM Studio). Each AI tab maintains an independent conversation with streaming responses, markdown rendering, and a copy button on AI messages.
- **AI Settings** — New "AI" section in Settings with provider selection, model dropdown, API key input (masked with show/test buttons), base URL override for proxies/local models, context toggle, and max tokens configuration. API keys are stored securely via Electron's `safeStorage` on desktop, `@capacitor/preferences` on mobile, and `localStorage` on web.
- **Note context for AI** — Toggle "ctx: on/off" in the AI chat header to include the current note's content as context in AI conversations.
- **Unified tab bar** — Terminal and AI tabs coexist in the same tab bar with type-specific icons (`>_` for terminal, `✦` for AI). On web/mobile where terminal isn't available, only the AI tab button appears. Default tab auto-created based on platform (terminal on desktop, AI on web).

## 0.1.5 — 2026-03-16

### Bug Fixes
- **Fix copy/paste losing paragraph breaks and block types in web browser** — Pasting HTML with block-level elements (`<p>`, `<div>`, `<li>`, headings) no longer merges all text together; `sanitizeNode` now inserts `<br>` separators when unwrapping block elements. Copy handler now encodes block structure (type, text, metadata) via custom clipboard data so pasting within the editor preserves H1/H2/H3, bullets, checkboxes, blockquotes, and numbered list types. External paste and plain-text fallback still work as before
- **Fix editor lag on long documents** — Eliminated two redundant DOMParser calls per keystroke by introducing `domNodeToMarkdown()` that walks live DOM elements directly; hoisted 10 regex pattern compilations from per-keystroke to module scope; added length guard to skip pattern matching on blocks with real content

### Features
- **Android support** — Added Android platform via Capacitor; all existing iOS Capacitor code (filesystem, attachments, settings, camera) works identically on Android with zero code changes; added Android back button handling
- **Capacitor iOS support** — Added Capacitor integration for iOS, reusing the existing React codebase; implemented unified API provider pattern (`src/services/apiProvider.js`) so all 14+ files that reference the native API use a single abstraction instead of direct `window.electronAPI` calls; created `src/services/nativeAPI.js` implementing the full electronAPI interface (~46 methods) backed by Capacitor plugins with .md file storage format matching Electron for future iCloud sync; added cross-platform attachment URL resolution, platform detection utilities, and Capacitor project skeleton with iOS platform

### Improvements
- **Component test coverage** — Added first component/integration tests (EditableBlock, SlashMenu, useBlockOperations) using @testing-library/react; set up test infrastructure with vitest jsdom environment, global mocks, and block data factories; total tests: 200 (up from 158)

## 0.1.4 — 2026-03-16

### Bug Fixes
- **Fix multi-block copy/paste collapsing into one block** — Copying text across multiple blocks and pasting now preserves all blocks and their types (headings, bullets, checkboxes, etc.) instead of merging everything into a single paragraph; also adds custom copy/cut handlers for cross-block selections and splits external multi-line pastes into separate blocks

### Features
- **Mobile responsive layout** — Full mobile-friendly layout for viewports ≤768px: hamburger menu opens sidebar as slide-in overlay with backdrop, compact top bar with note title and new-note button, full-screen settings with stacked sections, auto-close sidebar on note select, auto-open sidebar when no note selected

### Improvements
- **Larger mobile top bar buttons** — Increased top bar height to 48px, icon sizes to 19px, and button padding to 12px for better touch targets on mobile
- **Opaque mobile settings background** — Settings modal uses solid `BG.darkest` on mobile instead of semi-transparent `modalBg` to prevent editor content bleeding through
- **Full-screen mobile sidebar** — Sidebar now covers the entire screen (top: 0) instead of starting below the top bar, eliminating the ghostly blur effect; backdrop opacity increased to 0.55

### Known Bugs
- **"Type / for commands..." placeholder too dim in dark mode** — The empty-block placeholder text is barely visible in dark mode; should be brighter
- **Placeholder doesn't reappear after idle** — After typing and then pausing for a few seconds, the "Type / for commands..." placeholder should fade back in over ~1s to remind users of the slash command feature

## 0.1.3 — 2026-03-12

### Features
- **Cross-platform CI release workflow** — GitHub Actions workflow builds macOS and Windows installers on tag push (`v*`), with macOS code signing and notarization
- **Auto-updater** — App checks for updates on startup via `electron-updater` and GitHub Releases; new "Updates" section in Settings with auto-update toggle, version display, download progress bar, and "Restart & Update" button

### Bug Fixes
- **Service worker caching stale versions** — Switched from cache-first to stale-while-revalidate strategy and bumped cache version; existing users will get fresh assets on next visit instead of being stuck on old versions

## 0.1.2 — 2026-03-11

### Improvements
- **Pull-before-push sync** — Sync now pulls remote changes before pushing local edits, ensuring the client has up-to-date version numbers; eliminates ~90% of false conflict copies when switching between devices

### Features
- **Onboarding toast** — Anonymous web users see a toast after creating their 3rd note: "Your notes are saved locally…Sign in to sync." Dismisses via X button or auto-dismisses after 15s; persists dismissal in localStorage
- **First-sync confirmation modal** — When signing in for the first time with existing local notes, a modal asks "Sync your notes — X notes will be uploaded to your account" with Sync Now / Not Now buttons; prevents accidental bulk upload
- **PWA support** — Added `manifest.json` and service worker for offline capability and installability; cache-first for app shell, network-first for API calls; service worker registered on web only (not Electron)
- **Anonymous persistence warning** — After 5+ notes (and onboarding dismissed), a subtle toast warns: "You have X notes stored only in this browser. Sign in to back them up." Shows once per session

### Features
- **VS Code-style drag & drop** — Tab reordering within the same tab bar via drag insertion line; drag tabs across panes at exact positions; sidebar drag uses compact pill ghost (max 200px) with count badge for multi-drag; 20% edge zones (up from 10%) for split creation; vertical accent-colored insertion line shows exact drop position in any tab bar; Option+drag duplicates a tab to another pane; Escape cancels any drag in progress; sidebar ghost now moves in 2D (follows cursor into editor area)
- **Split view** — Open two notes side by side with `Cmd+Shift+\`; each pane has its own tab bar, editor, floating toolbar, and find bar; draggable divider with double-click-to-reset and snap-to-close; `Cmd+1`/`Cmd+2` to switch active pane (indicated by accent border); `Cmd+Click` on wikilinks opens the linked note in the other pane (creates split if needed); drag tabs between panes or to edge zones to create splits; drag notes from sidebar into editor edge zones to create splits; same note can be open in both panes with shared content but independent scroll/cursor; split state persists across app restarts; closing the last tab in a pane auto-collapses back to single view; supports both vertical and horizontal splits; works in Day and Night themes

### Improvements
- **Unify pane tab bar styling with top bar** — Pane tab bar height now matches top bar (44px instead of 36px); pane variant uses `chromeBg` background instead of transparent (which bled through to editor); removed accent-colored border-bottom from active pane tab bars

### Bug Fixes
- **Fix R2 content fetching returning `[object Response]`** — `getObject` in `_shared/r2.ts` wrapped a `Response` object inside `new Response()`, causing `.text()` to return the literal string `"[object Response]"` instead of note content; all pulled notes silently failed to parse; now checks `instanceof Response` before wrapping
- **Fix storage display resetting to 0** — Storage indicator showed 0 after re-opening settings because incremental sync pulls only return changed notes; sync-pull now always returns `totalStorageBytes` from a full DB query; value is persisted in localStorage across sessions
- **Fix storage formatting** — Storage now shows human-readable units: KB for small values, MB, GB for limits (e.g., "312 KB / 10 GB" instead of "0.3 / 10240.0 MB")
- **Speed up first sync** — Initial sync now pushes notes in parallel batches of 5 instead of sequentially; ~5x faster for large note collections
- **Enforce single-pane note exclusivity** — A note can now only exist in one tab bar at a time; opening/dragging a note into a pane automatically removes it from all other panes; if removing a note leaves a pane empty, the split auto-collapses; `Cmd+Shift+\` split now moves the active note to the new pane instead of duplicating it (requires 2+ tabs); Option+drag now behaves as a move since duplicates are not allowed
- **Fix horizontal split crash** — Horizontal split caused blank screen because `panes.left` was hardcoded in accessors; now dynamically resolves the first pane ID based on split mode (`top`/`bottom` for horizontal, `left`/`right` for vertical)
- **Fix drop-zone overlay covering sidebar** — Tab drag overlay used `.editor-scroll`'s parentElement (the main layout row including sidebar) instead of `.editor-scroll` itself; overlay now correctly bounds to the editor area only
- **Fix performance issues and memory leaks in split view** — Main-level `selectionchange` listener, `useLayoutEffect` for focus/caret, and editor fade-in effects now skip when split mode is active (PaneContainers have their own); `onMenuExport` IPC handler no longer re-registers on every keystroke (uses refs); `setWindowTitle` effect no longer re-runs on every text change (depends on title only); stale-note cleanup in split panes only runs when notes are actually deleted rather than on every `noteData` change; EditorArea tooltip timer now cleans up on unmount to prevent state updates on unmounted components

### Performance
- **Throttle StarField animation** — Canvas star twinkle animation now draws at ~10fps instead of 60fps; pauses entirely when tab is hidden; eliminates constant GPU/CPU drain especially in split view (2 canvases)
- **Fix SplitDivider listener leak** — Window `mousemove`/`mouseup` listeners now clean up on component unmount, preventing leaked listeners and closures when split is closed mid-drag
- **Memoize PaneContainer** — Wrapped in `React.memo` with custom comparator; prevents re-rendering both panes on every keystroke (only the active pane's structural changes trigger re-render); also eliminates unnecessary `useLayoutEffect` runs
- **Replace structuredClone in block drag** — Block drag undo snapshot now uses shallow array copy instead of deep clone; drag only reorders blocks without mutating them

### Known Issues
- **Split view is buggy** — There are visual and state issues with the split view feature; fixes are planned

## 0.1.1 — 2026-03-09

### Features
- **Sync conflict resolution** — When simultaneous edits are made on different devices, a conflict copy is created (e.g. "Note Title (conflict 2026-03-09 12:00:04)") so no data is ever lost; clickable toast notification appears for 8s; conflict copies listed in Settings > Sync with quick-open buttons
- **Offline sync recovery** — Dirty notes and their content are persisted to localStorage so edits survive app crashes and tab closes while offline; sync resumes automatically on reconnect with online/offline detection
- **Sync status indicators** — Sync dot in TopBar and Settings reflects conflict (yellow), offline (gray), and error (red) states in addition to syncing/synced/idle
- **Hide title bar on web** — The draggable title bar with note name is now only shown in the Electron desktop app

### Bug Fixes
- **Fix sync function routing** — Client was calling a non-existent unified `sync` function; now correctly calls separate `sync-push`, `sync-pull`, `sync-delete` edge functions
- **Fix isRemoteUpdate race condition** — Replaced single boolean flag with a Map of noteId-to-timestamp entries; stale entries auto-cleaned after 5s to prevent blocking dirty detection
- **Remove dead storage_usage subscription** — Removed realtime subscription to non-existent `storage_usage` table; 60s polling fallback already covers missed broadcasts
- **Fix logo images missing in production build** — TopBar and Settings modal images used absolute paths (`/assets/...`) that don't resolve under Electron's `file://` protocol; now imported as ES modules so Vite bundles them correctly
- **Fix memory leaks from drag event listeners** — Block drag, sidebar drag, and table drag-to-create handlers added `pointermove`/`pointerup` listeners to `window` that weren't removed if the component unmounted mid-drag; now stored in refs and cleaned up on unmount

### Features (continued)

- **Table edge-zone interactions** — Replaced the hover toolbar with edge-based interaction zones: click the left edge to select a row, click the top edge to select a column, hold and drag to reorder rows/columns (400ms hold-to-drag with floating clone and insertion line), hover the bottom/right edge for a `+` button to add rows/columns (click for one, drag to create multiple with live preview and counter badge), right-click context menus for insert/delete operations with column alignment controls, keyboard shortcuts (Arrow keys to move selection, Backspace/Delete to remove, Escape to deselect); header row is locked and cannot be dragged or deleted
- **Help button & cheat sheet** — Added a (?) help icon in the top-right corner of the toolbar; clicking it opens a floating quick-reference dropdown with categorized editing syntax, keyboard shortcuts, and feature tips; closes on click-outside or Escape; works in both Day and Night themes

### Bug Fixes
- **Fix DAY theme search input & settings modal** — Search input had hardcoded dark background (`#18191E`), now uses `theme.searchInputBg` (white in DAY mode); settings modal had hardcoded dark background and white-overlay borders that only worked in NIGHT mode, now uses `theme.modalBg`, `theme.modalShadow`, and `theme.overlay()` for all borders/backgrounds so both themes render correctly

### Improvements
- **Smooth theme transition** — Switching between Night and Day themes now crossfades all colors over 400ms instead of switching instantly; implemented via a temporary global CSS transition injected on theme change and removed after completion

### Features
- **Day/Night theme system** — Full light/dark theme support with smooth 400ms crossfade transitions; Day mode uses flat sky-blue backgrounds with warm gold accent; Night mode preserves the existing dark palette with teal accent and star field; toggle between Night, Day, and Auto modes in Settings > Appearance; Auto mode supports both system preference detection and time-of-day scheduling with configurable hours; theme state persisted in localStorage

### Improvements
- **Theme infrastructure** — Created `ThemeProvider` React context with `useTheme()` hook; two complete palettes in `src/constants/themes.js` (NIGHT and DAY) covering all color tokens; migrated all 22 component files from direct `colors.js` imports to `useTheme()` hook; terminal theme, scrollbar styles, inline code/link/wikilink colors, callout backgrounds, and code block styles all respond to theme changes; dev tools overlay includes theme quick-toggle

### Features
- **Blockquote support** — Lines starting with `>` now render as blockquotes with a thin accent-colored left border and italic muted text (Obsidian-style); consecutive `>` lines group into one block; type `> ` to auto-convert, use `/blockquote` slash command, or write `>` lines in markdown; Enter continues the blockquote, Backspace on empty reverts to paragraph; `> [!type]` callouts are unaffected

### Bug Fixes
- **Make code block and callout backgrounds opaque** — Pre-blended semi-transparent backgrounds (`rgba(0,0,0,0.3)` for code blocks, `rgba(...,0.20)` for callouts) against the `#040412` editor background to produce solid hex colors; prevents star field canvas from bleeding through these elements
- **Fix code block keyboard input and language selector** — Code block text and language changes were silently swallowed by `EditorArea`'s `React.memo` comparator, which only checked block `id` and `type` — intentionally skipping `text` for contentEditable blocks but unintentionally blocking textarea-based code blocks too; now the memo also compares `text` and `lang` for code-type blocks so state updates flow through to `CodeBlock`
- **Fix ghost note naming after promotion** — When typing in the body first, `promoteDraft` forced the title to the literal string "Untitled", replacing the faded placeholder with solid text that required manual clearing; now keeps the title empty so the CSS placeholder remains active and the user can type a title naturally; added `|| "Untitled"` fallback to tab labels for display consistency
- **Fix ghost note not appearing in empty vault** — On app start, `activeNote` could point to a deleted note via stale localStorage, preventing the draft-creation effect from firing; now resets `activeNote` to null when it references a non-existent note. Also fixed `onFileDeleted` disk sync wiping in-memory draft notes by preserving `_draft` entries during `setNoteData` overwrites
- **Fix deleted folders/notes retaining stale ordering position** — When a folder or note was deleted, its custom drag-order entry persisted in `sidebarOrder`; re-creating it would cause it to reappear at its old position instead of sorting alphabetically; now `deleteFolder` cleans the folder (and all subfolders) from both `customFolders` and `sidebarOrder`, and `deleteNote` removes the note ID from its folder's `noteOrder`; external deletions via Finder also clean `sidebarOrder` during folder sync
- **Fix orphaned folders remaining in sidebar after vault files deleted** — The `onFileDeleted` handler only merged folders into `customFolders` and never removed stale ones; when all files in a folder were deleted externally, the empty folder persisted in the sidebar; now syncs `customFolders` against actual disk state, removing folders that no longer contain notes
- **Fix progressive slowdown on note switch** — `useHistory` was cloning the entire `noteData` object (all notes) on every edit, accumulating massive memory pressure across 50 undo stack entries; now stores per-note `{ noteId, snapshot }` tuples, reducing memory ~100×. Wrapped all `useEditorHandlers` return values in `useCallback` so `React.memo` on `EditorArea` is no longer bypassed on every parent render. Fixed `visibilitychange` listener leak (anonymous function couldn't be removed in cleanup).

### Improvements
- **Ghost note empty state** — Replaced the static "Notes" logo splash screen with a live editor draft; when no note is open, a phantom note appears with "Untitled" and "Type / for commands..." placeholders; the note materializes into a real note (sidebar, tabs, disk) only when you start typing; navigating away from an empty draft silently discards it
- **Performance: reduce unnecessary re-renders** — Memoized sidebar tree computation (folder hierarchy, filtering, sorting) with `useMemo` chains so it only recomputes when `noteData`, `customFolders`, `sidebarOrder`, or `search` change; wrapped `Sidebar`, `ContextMenu`, and `EditorArea` in `React.memo`; removed unstable `isSelected` callback in favor of `selectedNotes.has()` inline; extracted inline `onNavigateToNote` closure to `useCallback`; memoized `activeFormats` default object to prevent spurious `FloatingToolbar` re-renders

### Features
- **Multi-select notes in sidebar** — Cmd+Click to toggle individual notes, Shift+Click to select a range; right-click shows bulk context menu with "Delete N notes", "Move to..." folder submenu, and "Move to root"; multi-drag moves all selected notes as a group with a count badge; selection clears on plain click, editor click, or search activation

### Bug Fixes
- **Fix nested folders flattened to root level** — Nested folder paths like `University/25-26 Semester 2/COMP208` were saved as flat directories with underscores (`University_25-26 Semester 2_COMP208`) because `sanitizeFilename()` was applied to the entire path; now each path segment is sanitized individually, preserving the nested directory structure; same fix applied to restore-from-trash
- **Fix folder drag-and-drop reordering** — Folder reordering now works correctly at all nesting levels; fixed root-level reorder using full paths instead of folder names, fixed nested folder reorder producing empty sibling lists, and fixed name-vs-path mismatch causing folders to jump to top
- **Fix default sidebar folder ordering** — Folders at every nesting level now sort naturally by default (e.g. Week 1, Week 2, … Week 10) instead of appearing in arbitrary insertion order; custom drag-to-reorder still takes priority when set
- **Fix sidebar folder nesting** — Deeply nested folders (e.g. `University/25-26 Semester 2/COMP208/Week 3`) now display as a proper nested tree instead of flat top-level entries; added `pathsToTree()` utility that splits slash-delimited paths into hierarchical nodes
- **Fix stars disappearing when scrolling past ~50 lines** — Replaced `inset: 0` with `top: 0; left: 0; width: 100%` so the canvas isn't clipped to viewport height; stars now generate dynamically in bands as content grows, so scrolling down always shows stars
- **Fix blank screen after native title bar switch** — Removed duplicate `noteData` destructuring in EditorArea that caused `undefined` prop when the redundant BoojyNotes prop was cleaned up
- **Fix useEffect dependency array** — Replace dynamic property access `noteData[activeNote]?.title` with `noteData` in window title effect dependency array

### Features
- **Separate title bar** — Added a thin 28px draggable title bar above the TopBar with centered window title; traffic lights sit in the title bar row instead of overlapping TopBar content; TopBar left padding reduced since traffic lights no longer occupy that space

### Improvements
- **Compact slash menu** — Single-line rows with smaller icon boxes (24px), reduced padding, and right-aligned monospace shortcut hints instead of verbose descriptions; removed redundant "Text" command; menu is shorter and easier to scan

### Features
- **Spell check** — Native Electron spell check with right-click suggestions, "Add to Dictionary", and language selection (8 languages); toggle on/off in Settings → Appearance; persists across sessions via app settings file
- **Word count tooltip** — Hover over "N words" in the top bar to see character count, character count without spaces, and estimated reading time
- **Find in note (Cmd+F)** — Floating search bar with CSS Custom Highlight API for non-destructive match highlighting; "n of N" counter, previous/next navigation (Enter/Shift+Enter), collapsible Replace section with Replace and Replace All; Escape to close
- **Table alignment** — Column alignment (left/center/right) via toolbar buttons when hovering a table; alignment round-trips through markdown separator row (`:---:`, `---:`, `---`); header row styled with bold + accent tint
- **Table cell formatting** — Bold, italic, code, strikethrough, highlight, and wikilinks now render inside table cells; formatting preserved on blur via `htmlToInlineMarkdown`
- **Table CSV/TSV paste** — Paste tab-separated or comma-separated data into a table cell to auto-fill cells; grid expands if pasted data exceeds current dimensions
- **PDF export** — Export any note as a styled PDF via right-click context menu or File → Export → PDF; renders in a hidden BrowserWindow with print-friendly CSS
- **DOCX export** — Export any note as a Word document via right-click or File → Export → DOCX; supports headings, lists, checkboxes, code, tables (with alignment), callouts, and inline formatting (bold, italic, code, strikethrough, highlight)
- **Import markdown files** — File → Import → Markdown Files to copy `.md`/`.txt` files into the vault; chokidar watcher auto-detects new files
- **Import HTML files** — File → Import → HTML Files converts HTML to markdown via Turndown and saves as `.md` in the vault
- **Import folder** — File → Import → Folder recursively imports all `.md`/`.txt` files preserving directory structure; "Import files here" in folder right-click menu
- **Embed / Transclusion (`![[Note Title]]`)** — Embed another note's content inline as a read-only preview with accent-colored left border; `![[Note#Heading]]` shows only the heading's section; "not found" placeholder with "Create note" button for broken embeds; nested embeds supported up to depth 3; `/embed` slash command; round-trips through markdown
- **Vitest test suite** — 158 tests across 6 test files covering markdown conversion (round-trip for all 14 block types), search (fuzzy matching, indexing, grouping), sidebar tree (sorting, nesting, filtering), backlink index (wikilinks, aliases, dedup), inline formatting (markdown↔HTML, sanitization), and slash command data validation
- **ESLint + Prettier** — Flat ESLint 9 config with React and React Hooks plugins; Prettier auto-formatting for consistent code style; `npm run lint` and `npm run format:check` scripts
- **TypeScript (incremental)** — `tsconfig.json` with `allowJs`, `@ts-check` + JSDoc on 5 pure utility files (`sidebarTree.js`, `backlinkIndex.js`, `search.js`, `data.js`, `markdown.js`); shared type definitions in `src/types.d.ts`; `npm run typecheck` script
- **GitHub Actions CI** — Runs lint, format check, type check, tests, and build on push/PR to master and feature branches

### Bug Fixes
- **Lightbox missing ArrowUp/ArrowDown close** — Pressing ArrowUp or ArrowDown now closes the image lightbox, matching Escape and ArrowLeft/ArrowRight behavior
- **Image deselection on typing** — Pressing a printable character while an image block is selected now deselects the image and lets the keystroke pass through to the editor
- **Timestamp filenames for clipboard pastes** — Pasted screenshots now get descriptive filenames like `paste-2026-03-05-143022.png` instead of generic `image.png`
- **Filename deduplication uses dash** — Duplicate filenames now get a `-2` suffix instead of ` 2` (space), avoiding issues with spaces in filenames
- **Friendly filename dots** — Dots in filenames are now converted to spaces in display labels (e.g., `song.final.mix.mp3` → "Song Final Mix")

- **Markdown shortcuts not triggering** — Typing `## `, `- `, `1. `, etc. did not convert to headings, bullets, or numbered lists; the browser inserts trailing spaces as `&nbsp;` entities, and the `htmlToInlineMarkdown` fast path returned the raw entity string without decoding it, so the shortcut regexes never matched; also fixes a latent data corruption bug where `&nbsp;` was stored literally and later displayed as `&amp;nbsp;` after undo/redo or note switching
- **Title text reversal when typing** — Fixed typing "Hello" appearing as "olleH" in the title; the `useLayoutEffect` that syncs external file renames depended on `currentTitle`, causing it to overwrite the contentEditable DOM on every keystroke and reset the cursor to position 0; changed dependency to `syncGeneration.current` (matching the `EditableBlock` pattern) so the DOM is only rewritten on note switch or external file sync
- **Critical: wikilink selection destroying all notes** — Selecting a note from the `[[` autocomplete menu called `commitTextChange(noteId, blockIndex, newText)` with three positional args, but the function expects a single updater function; this set the entire notes state to a string, wiping all data from React state and disk; now uses the correct updater-function pattern matching `updateBlockText`

### Features
- **Wikilink autocomplete menu** — Type `[[` in any block to open an autocomplete menu listing all note titles; fuzzy-filters as you type; Enter or click inserts `[[Title]]` and navigates to the note; "Create note" fallback for non-existent titles; Escape or click-outside to dismiss
- **Callout block rewrite** — Replaced emoji icons with Lucide line icons and native `<select>` with custom type picker dropdown (11 types with icons, colours, checkmark for active); switched from click-to-edit input/textarea to always-live `contentEditable` title and body; keyboard navigation: Enter in title focuses body, ArrowUp/Escape exits, Backspace on empty deletes block, ArrowUp/Down at body edges navigates between blocks
- **Callout alias resolution** — Obsidian aliases (`caution`, `hint`, `error`, `todo`, `faq`, `cite`, `tldr`, etc.) resolve to canonical types on parse while preserving the original alias in `calloutTypeRaw` for round-trip fidelity
- **Callout collapsible syntax** — `+`/`-` fold suffixes (`> [!note]+`) parsed and preserved in round-trip

### Bug Fixes
- **Cursor reversal when typing** — Fixed typing "hello" appearing as "olleh"; the `noteTitleSet` was getting a new object reference on every keystroke (because it depended on `noteData`), causing `EditableBlock` to re-render and rewrite `innerHTML`, destroying cursor position; stabilised the Set reference so it only changes when actual note titles change
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
