# Changelog

## Unreleased

### Bug Fixes
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
