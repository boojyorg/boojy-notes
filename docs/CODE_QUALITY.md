# Code Quality Review

Comprehensive review of Boojy Notes conducted March 2026. The codebase was assessed across 12 areas, improvements were implemented, and ratings updated.

**Overall: 6.5 → 8.8 / 10**

## Ratings

| Area | Before | After | Key changes |
|---|---|---|---|
| Performance | 8.5 | 9 | Memo'd 4 components, lazy loaded Settings+Terminal |
| Platform abstraction | 8 | 9 | Unsupported feature warnings, import validation |
| State management | 8 | 9 | EditorContext eliminates 51→18 props on EditorArea |
| Inline formatting | 7.5 | 9 | Backslash escapes, URL fixes, italic nesting, wikilink escaping |
| Sync | 7 | 9 | Timeouts, BroadcastChannel cross-tab, offline detection |
| Security | 7.5 | 9 | Terminal cwd validation, typed IPC, paste sanitization |
| Data integrity | 8 | 9 | Schema versioning, IndexedDB fallback, load validation |
| Component structure | 5.5 | 8.5 | TopBar split, EditorContext, hooks extracted, memo'd |
| Test coverage | 6 | 8.5 | 600 tests (+47), context/settings/terminal covered |
| Accessibility | 4 | 9 | Focus-visible, focus traps, ARIA on editor, sync announcements |
| Type safety | 4 | 8 | Strict mode, discriminated Block union, typed electronAPI |
| Export/import | 5.5 | 9 | All block types in DOCX, 50MB import limit |

---

## Breakdowns

### Performance (8.5 → 9)

**Why 8.5 before:** The app already had sophisticated performance patterns — custom `React.memo` comparators on `EditableBlock` and `EditorArea`, `textOnlyEdit` optimization flags to skip re-renders on keystroke, and heavy use of refs to avoid unnecessary state updates. The `useDeferredValue` hook on block arrays and debounced search (150ms) showed real care.

**What was missing:** Four heavy components (CalloutBlock 520 lines, CodeBlock 504 lines, TableBlock 414 lines, TopBar 701 lines) lacked `React.memo`. SettingsModal and TerminalPanel were eagerly loaded despite being off-screen by default. No virtual scrolling in Sidebar for large note lists.

**What was done:**
- Added `React.memo` to CalloutBlock, CodeBlock, TableBlock, TopBar
- Lazy loaded SettingsModal and TerminalPanel via `React.lazy` + `Suspense`

**What remains for 10:** Virtual scrolling in Sidebar for 1000+ note lists. Code splitting for more off-screen components.

---

### Platform Abstraction (8 → 9)

**Why 8 before:** Clean `platform.js` utility (`isElectron`/`isCapacitor`/`isWeb`/`isNative`) with a `getAPI()` factory. The `ELECTRON_DISABLE=1` conditional compilation pattern is elegant. Electron security was solid — `contextIsolation: true`, `nodeIntegration: false`, whitelisted IPC via preload.

**What was missing:** Capacitor (mobile) features like export, import, and terminal silently returned `undefined` — the user would tap "Export PDF" and nothing would happen with no feedback.

**What was done:**
- Replaced silent no-op stubs with `unsupportedOp()` that logs `console.warn` messages
- Added 50MB file size limit on all import operations
- Added 100MB limit on Electron file picker

**What remains for 10:** Show user-facing toast on mobile when attempting unsupported features (currently only logs to console).

---

### State Management (8 → 9)

**Why 8 before:** Well-scoped React Context architecture with 6 focused providers. The `NoteDataContext` / `NoteDataActionsContext` split (separating read from write) to prevent unnecessary re-renders was a strong pattern. No Redux/Zustand overhead.

**What was missing:** EditorArea received 51 props from its parent because all editor state (refs, handlers, block operations) was passed through props rather than context. This made the call sites in BoojyNotes.jsx and PaneContainer.jsx difficult to read and maintain.

**What was done:**
- Created `EditorContext` holding stable values (refs + callbacks that never change reference)
- EditorArea now receives 18 reactive props (checked by the memo comparator) and pulls ~33 stable values from context
- The memo comparator is fully preserved — context values never trigger re-renders because they're stable references

**What remains for 10:** Could eliminate more prop drilling by having EditorArea call `useOverlay()` and `useNoteDataActions()` directly for values it currently receives as props.

---

### Inline Formatting (7.5 → 9)

**Why 7.5 before:** The regex-based `inlineMarkdownToHtml()` handled 11 formatting types with correct processing order (escape HTML → code → bold+italic → bold → italic → etc.). HTML entity escaping at the top prevents XSS. The `domNodeToMarkdown()` hot-path optimization avoids DOMParser on every keystroke.

**What was missing:** Italic regex `*text*` consumed `**bold**` markers. Bare URL regex captured trailing punctuation (`)`, `.`). Wikilink `data-target` didn't escape quotes. URLs inside existing `<a href>` tags got double-linked. No backslash escape support.

**What was done:**
- Italic regex now uses lookbehind/lookahead to avoid consuming `**` markers
- URL regex strips trailing punctuation and skips matches inside `href` attributes
- Wikilink `data-target` escapes `"` with `&quot;`
- Added backslash escape support (`\*`, `\~`, `` \` ``, `\=`, `\[`, `\]`, `\#`) using placeholder-restore pattern
- 14 regression tests added for all edge cases

**What remains for 10:** Replace regex with a proper single-pass parser for full nesting support. Handle escaped characters in `htmlToInlineMarkdown` reverse direction.

---

### Sync (7 → 9)

**Why 7 before:** Pull-before-push architecture with version tracking and conflict detection. Supabase Realtime broadcast for cross-device sync. Dirty note persistence for crash recovery. Configurable concurrency on first sync push.

**What was missing:** No timeout on `pullNotes`/`pushNote` — a stalled server would freeze the app. `navigator.onLine` was the only offline check (unreliable). Two browser tabs couldn't see each other's edits instantly (only via 60s poll or Supabase Realtime which could drop). Broadcast payload validation only checked top-level types, not `content.blocks` structure.

**What was done:**
- Added 30-second timeout on all sync network calls via `Promise.race`
- Detect network failures (fetch errors, timeouts) and show "offline" state instead of generic "error"
- Added `BroadcastChannel` for instant cross-tab note sync (edit in one tab, other tab updates within a render cycle)
- Broadcast payload now validates `Array.isArray(payload.content?.blocks)`

**What remains for 10:** Tab leader election (only one tab pushes to Supabase). Conflict merge UI (currently creates a copy — no auto-merge).

---

### Security (7.5 → 9)

**Why 7.5 before:** Electron sandbox properly configured. Custom `sanitizeInlineHtml()` with tag whitelist was thorough. Supabase uses parameterized queries. No hardcoded API keys. `safeStorage` for Electron credential encryption.

**What was missing:** Terminal `cwd` accepted any path string — could escape to `/etc`. `[key: string]: any` on the electronAPI type defeated TypeScript's ability to catch IPC issues. AI API keys stored in plaintext localStorage on web with no warning. Export HTML title didn't escape `&` before `<`/`>`.

**What was done:**
- Terminal `resolveCwd()` validates path is within `os.homedir()`
- Preload whitelists terminal options (cols, rows, cwd only)
- Removed `[key: string]: any` from global.d.ts; typed all 40+ IPC methods
- Added AI key storage warning in settings UI on web/mobile
- Fixed export HTML title `&` escaping order
- Added 100MB file size limit on Electron file picker
- Verified paste handler calls `sanitizeInlineHtml()` in 12+ code paths

**What remains for 10:** Add DOMPurify as a second safety net for non-contentEditable `innerHTML` usage. Validate terminal `cwd` against symlinks.

---

### Data Integrity (8 → 9)

**Why 8 before:** localStorage persistence with try-catch. Block IDs used `Date.now()` + sequential counter. Error boundary with emergency backup to localStorage on crash.

**What was missing:** Block ID counter reset to 0 on restart (collision risk). No schema versioning — a future data format change would silently corrupt old data. localStorage has a ~5MB limit with no fallback. Notes loaded from storage weren't validated — malformed data propagated.

**What was done:**
- Block/note IDs now use random suffixes (`Math.random().toString(36)`) instead of sequential counter
- Added schema version tracking (`SCHEMA_VERSION = 1`) with migration framework in storage layer
- Added IndexedDB fallback — when localStorage `setItem` throws `QuotaExceededError`, data is saved to IndexedDB. On load, tries localStorage first, then falls back to IndexedDB.
- Notes loaded from localStorage/IndexedDB are validated: each note must have `content.blocks` as an array
- Table parser normalizes alignment array length to match header column count

**What remains for 10:** Use `crypto.randomUUID()` where available for even stronger ID uniqueness. Add IndexedDB-first storage for large vaults.

---

### Component Structure (5.5 → 8.5)

**Why 5.5 before:** BoojyNotes.jsx was 1,723 lines — a massive orchestrator mixing 15 hook calls, 20 effects, 30 callbacks, and 500 lines of JSX. TopBar.jsx was 701 lines with mobile and desktop renders completely duplicated. EditorArea received 51 props. Sidebar.jsx (755 lines) mixed recursive folder rendering with search results.

**What was done:**
- Extracted `useAppKeyboard` (global keyboard shortcuts, 150 lines) and `useAppPersistence` (localStorage save effects, 75 lines) from BoojyNotes
- Split TopBar into TopBarMobile (166 lines) + TopBarDesktop (545 lines) + 8-line router
- Created EditorContext eliminating 33 stable prop passes to EditorArea
- Added `React.memo` to 4 heavy components

**What remains for 9:** Extract OverlayLayer and ToastLayer from BoojyNotes render block. Extract SidebarNoteItem and SidebarFolderItem from Sidebar. BoojyNotes is still ~1,590 lines.

---

### Test Coverage (6 → 8.5)

**Why 6 before:** 553 tests passing across 42 files. Good coverage of utilities (inlineFormatting, search, backlinkIndex, sidebarTree) and hooks (useHistory, useSync, useBlockDrag, useSplitView). But zero tests for all 6 context providers, settings components, terminal components, and AI components.

**What was done:**
- Added ThemeContext tests (8 tests): theme toggle, persistence, auto mode
- Added NoteDataContext tests (9 tests): initialization, validation, data/actions split
- Added SettingsModal tests (8 tests): ARIA attributes, tab switching, close behavior
- Added TerminalPanel tests (8 tests): visibility, tab creation, active instance
- Added 14 inline formatting regression tests for all bug fixes
- Added 3 storage tests for random ID generation

**What remains for 9:** Test editor hooks more deeply (paste handling, keyboard shortcuts). Test remaining context providers (SettingsContext, LayoutContext, SidebarContext). Raise coverage thresholds from 60% to 80%.

---

### Accessibility (4 → 9)

**Why 4 before:** `GlobalStyles.jsx` had `[contenteditable]:focus { outline: none; }` with no alternative — keyboard users had zero visual feedback. SlashMenu, WikilinkMenu, and ContextMenu lacked focus traps — keyboard focus could escape. contentEditable blocks had no ARIA roles or labels. Sync status changes were invisible to screen readers.

**What already existed:** `useFocusTrap` hook (well-implemented, 82 lines). Used in SettingsModal and ImageLightbox. `role="menu"` + keyboard navigation on ContextMenu. `role="alert"` + `aria-live` on Toast. `role="treeitem"` + `aria-selected` on Sidebar notes. Skip-to-content link in BoojyNotes.

**What was done:**
- Replaced blanket `outline: none` with `:focus:not(:focus-visible)` + global `*:focus-visible` style using accent color
- Applied `useFocusTrap` to SlashMenu, WikilinkMenu, ContextMenu
- Added `role="textbox"` + `aria-multiline="true"` + `aria-label` to paragraph, heading, bullet, and numbered blocks
- Added `aria-label="Heading 1/2/3"` to heading elements
- Added `role="region"` + `aria-label="Note editor"` to editor container
- Added `role="textbox"` + `aria-label="Note title"` to title field
- Added visually-hidden `<span role="status" aria-live="polite">` in TopBar for sync state announcements

**What remains for 10:** Focus trap on LinkEditPopover. Keyboard navigation for CalloutTypePicker dropdown. High-contrast mode. Full axe-core audit pass.

---

### Type Safety (4 → 8)

**Why 4 before:** `strict: false` in tsconfig. Block type was a single interface with all optional fields — a `type: "code"` block could exist without `lang`. `[key: string]: any` on the electronAPI interface defeated all type checking. Only 12% of files were TypeScript.

**What was done:**
- Enabled `strict: true` (with `noImplicitAny: false` to avoid JS file noise)
- Converted Block type to discriminated union: `TextBlock | CodeBlock | ImageBlock | TableBlock | ...` where each variant has its required fields
- Removed `[key: string]: any` catch-all from global.d.ts; added explicit types for all 40+ IPC methods including terminal, secure storage, file operations
- Fixed all TSX strict mode errors (theme type casts in SpacerBlock, DropZoneOverlay, LinkTooltip)
- Fixed storage.ts strict null check issues

**What remains for 9:** Convert context providers to TypeScript (.tsx). Add JSDoc `@param`/`@returns` to high-traffic JS files. Enable `noImplicitAny` and fix remaining JS files.

---

### Export/Import (5.5 → 9)

**Why 5.5 before:** PDF export worked via HTML rendering (full block coverage through `blocksToHtml`). DOCX export handled headings, paragraphs, lists, checkboxes, code, tables, callouts, spacers. But image, file, embed, and blockquote blocks were silently skipped in DOCX. No file size limits on import. No encoding validation.

**What was done:**
- Added blockquote (indented paragraph with left border), image (alt text fallback), file (filename with paperclip), embed (text content) to DOCX export
- Added 50MB file size limit on markdown, HTML, and folder imports
- Fixed HTML title `&` escaping in PDF export wrapper

**What remains for 10:** Embed actual images in DOCX (requires fetching from R2/filesystem). Support PDF page size selection. Validate UTF-8 encoding on import.
