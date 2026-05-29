# Claude Code Instructions

Boojy Notes — a block-based note-taking app for web (responsive PWA) and desktop.
Read files directly when needed. Do not ask before reading.

## Tech Stack

- **Frontend:** React 19, Vite 6 (responsive — mobile-browser layout via `useIsMobile`)
- **Desktop:** Electron 40
- **Backend:** Supabase (auth + database), Cloudflare R2 (attachments)
- **Testing:** Vitest + @testing-library/react (unit), Playwright (E2E)
- **Linting/Formatting:** Biome 2 (single tool for lint + format, `biome.json`), enforced by Husky pre-commit hooks
- **Package manager:** pnpm (`.npmrc` `node-linker=hoisted` for electron-builder)

## Project Structure

```
src/
├── BoojyNotes.jsx          # Root app component
├── main.jsx                # Entry point, provider setup
├── components/             # UI components (EditableBlock, EditorArea, Sidebar, TopBar, etc.)
│   ├── blocks/             # Block type components (code, table, callout, image, etc.)
│   └── settings/           # Settings modal panels
├── context/                # React Context providers (Theme, NoteData, Settings, Layout, Sidebar, Overlay)
├── hooks/                  # Custom hooks (useSync, useHistory, useFileSystem, etc.)
│   └── editor/             # Editor-specific hooks (keyboard, paste, drag, slash commands)
├── services/               # Platform services (nativeAPI, sync, AI)
├── utils/                  # Utilities (storage, search, domHelpers, inlineFormatting, platform)
├── constants/              # Themes, colors, z-index, slash commands, data defaults
├── styles/                 # Shared style objects (buttons, inputs)
├── tokens/                 # Design tokens (spacing, radius, typography, shadows)
└── types/                  # TypeScript type definitions
electron/                   # Electron main process (IPC, file I/O, export/import)
tests/                      # Unit + E2E tests
docs/private/               # Private docs (gitignored): roadmap, strategies, code signing
```

## Architecture

- **Editor:** Custom `contentEditable` implementation — not ProseMirror, TipTap, or any editor library. Text is stored as markdown tokens in `block.text` and rendered via `inlineMarkdownToHtml()` → `innerHTML`. Be careful with DOM operations.

> **⚠️ Editor gotchas (these have caused real bugs — read before touching the editor):**
> The editor is **uncontrolled**: the browser owns the live DOM; `block.text`/React state is updated on a **debounce** (`commitTextChange`) and therefore *lags the visible DOM during typing*. Two rules follow:
> 1. **Don't drive live-updating UI off `block.text`.** Anything that must respond to the current keystroke (e.g. the empty-block placeholder) must read the **DOM**, not state. Use CSS `:empty` / `:has(> br:only-child)` — note an "empty" block holds a `<br>` for the caret, so it is *never* `:empty` on its own. (This caused the placeholder-overlap bug.)
> 2. **The `syncGen` DOM-resync only fires from React events, not native listeners.** `EditableBlock`'s `useLayoutEffect` re-syncs `innerHTML` from `block.text` when `syncGen` changes — but only if the editor actually re-renders, which it's optimised *not* to do for text edits. Bumping `syncGeneration.current` works from React synthetic-event handlers (input/keydown/paste). It does **not** work from a **native `window` listener** (e.g. a menu's `addEventListener('keydown')`) — React won't re-render, so the effect never runs. To mutate a block from a native listener, write `el.innerHTML = inlineMarkdownToHtml(text, noteTitleSet)` **directly** (the `useInputHandler` pattern), plus `commitNoteData` for state. (This caused the wikilink-insert bug.)
> When a render/DOM-sync fix "should work" but the DOM doesn't update, **add a `console.log` in the layout effect + handler and observe** before proposing more fixes — don't theorise about React timing.
- **State:** React Context API (6 providers, no Redux/Zustand). NoteData separates data from actions for render optimization. Heavy use of refs to avoid unnecessary re-renders.
- **Styling:** Inline styles driven by theme objects (`useTheme()` → `{ BG, TEXT, ACCENT, SEMANTIC }`). No CSS modules, Tailwind, or styled-components. Design tokens live in `src/tokens/`.
- **Platform:** `src/utils/platform.js` exports `isElectron`, `isWeb`, `isNative` (`isNative === isElectron` — the only file-backed target). Services use `getAPI()` factory to return the Electron or web API.
- **Web builds:** Set `ELECTRON_DISABLE=1` to exclude Electron code. The `dev:web` script does this automatically.

## Dev Workflow

```bash
# Package manager: pnpm (node-linker=hoisted for electron-builder)
pnpm dev              # Electron + Vite dev mode
pnpm dev:web          # Web-only dev (ELECTRON_DISABLE=1)
pnpm test             # Unit tests (Vitest)
pnpm test:e2e         # E2E tests (Playwright, Chromium)
pnpm lint             # Biome lint
pnpm format:check     # Biome format check
pnpm check            # Biome lint + format (combined)
pnpm typecheck        # TypeScript check
pnpm build:electron   # Build desktop installer
```

See `TESTING.md` for full platform testing docs (desktop, web preview).

## Testing

- **Unit tests:** `tests/` directory, Vitest + jsdom + @testing-library/react
- **E2E tests:** Playwright (Chromium only), configured in `playwright.config.js`
- **Coverage thresholds:** 45% lines, 42% branches, 43% functions, 43% statements — a floor set just below current actuals (CI was red since the v0.2.0 mobile UI overhaul added untested component code). Ratchet UP as presentational code gets covered; never lower to pass.
- **CI runs `test:coverage`, not `test`** — run `pnpm test:coverage` before pushing, or the coverage gate can fail even when `pnpm test` is green.
- **Before committing:** Always run `pnpm test` and `pnpm format:check` — CI checks both
- **Pre-commit hooks:** Husky + lint-staged auto-formats and lints staged files. Never skip with `--no-verify`.

## Changelog Workflow

When making bug fixes or feature changes:
1. Update `CHANGELOG.md` immediately after each fix
2. Add entries under the "Unreleased" section at the top
3. Use categories: `### Bug Fixes`, `### Features`, `### Improvements`
4. When releasing, change "Unreleased" to the version number and date

## Release Process

1. Bump version in `package.json` (Settings reads from here — never hardcode versions elsewhere)
2. Update CHANGELOG.md heading from "Unreleased" to the version number and date
3. Run `pnpm test` and `pnpm format:check` before committing
4. Commit all changes and push to `master`
5. Review `docs/private/ROADMAP.md` — move completed items, reassess priorities
6. Tag with version: `git tag v0.x.x && git push origin v0.x.x`

## Deployment

- **Web (boojy.org):** Cloudflare Pages auto-deploys on push to `master`. Build: `ELECTRON_DISABLE=1 pnpm build`, serves from `dist/`. **The CF Pages build command must be set to pnpm in the dashboard** (it does not read from the repo).
- **macOS + Windows:** GitHub Actions (`release.yml`) triggers on `v*` tag push. Builds Electron installers, uploads to GitHub Release.

Pushing to `master` deploys web; pushing the tag builds desktop installers.

## Docs system & working memory

This repo uses the simplified, auto-memory-era docs-system (see
`~/Documents/Vault/Projects/Claude Docs System.md`). Learnings and session history live in
Claude Code's **auto memory** + `git log`; the committed docs hold only must-follow rules and
live working state:

- **`FEATURES.md`** — plain-language, recruiter/user-facing tour (no file paths or jargon). *(optional, not yet created)*
- **`README.md`** — dev/public-facing: what it is, stack, architecture, scripts.
- **`CLAUDE.md`** (this file) — the agent's rules: architecture, conventions, workflow. Always-true rules only.
- **`.claude/rules/`** — one topic per file. Genuinely global rules stay here in `CLAUDE.md`;
  per-area gotchas live in `rules/`. (`paths:` frontmatter is aspirational — conditional loading
  is unreliable in early-2026 Claude Code, so treat `rules/` as organization, not context savings.)
- **`dreams.md`** — *live working memory*: the Active Engineering Target + milestone/backlog
  checklist (§1 only). Volatile state, changes every session.

**Memory Synchronization Rule:** Read `dreams.md` at the start of every session to establish
target context. When you resolve an item, flip its checkbox `- [ ]` → `- [x]`.

**Automated Validation Hook:** `.claude/settings.json` wires a `PostToolUse` hook
(`.claude/hooks/post-edit-validation.sh`) that runs `biome check --write` → typecheck (`.ts/.tsx`
only) → `vitest related` after every `.js/.jsx/.ts/.tsx` edit. On failure it prints the error and
exits non-zero (it does **not** write to any doc). Do not bypass it.

**Keep docs current:** architecture/roadmap changes update `README.md` + `CLAUDE.md` in the
same commit; a release bumps `package.json` + `CHANGELOG.md`; feature changes update `FEATURES.md`.
Skim `/memory` after a big refactor — that's the whole maintenance loop now.

## Conventions

- **File naming:** PascalCase for components (`EditableBlock.jsx`), camelCase for hooks/utils/constants
- **Imports:** Relative paths only (no aliases). Order: React → hooks → context → constants → utils → components
- **IDs:** Use `genBlockId()` and `genNoteId()` from `src/utils/storage` — never hand-craft IDs
- **Performance:** Use `React.memo` for components that re-render often. Prefer refs over state for values that don't need to trigger renders.
- **Styles:** Always use theme tokens from `useTheme()`. Never hardcode colors.
- **Mixed JS/TS:** Mostly `.jsx`/`.js`, some `.ts`/`.tsx` for types and utilities
