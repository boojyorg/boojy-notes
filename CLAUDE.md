# Claude Code Instructions

Boojy Notes — a block-based note-taking app for web (responsive PWA) and desktop.
Read files directly when needed. Do not ask before reading.

## Tech Stack

- **Frontend:** React 19, Vite 6 (responsive — mobile-browser layout via `useIsMobile`)
- **Desktop:** Electron 40
- **Backend:** Supabase (auth + database), Cloudflare R2 (attachments)
- **Testing:** Vitest + @testing-library/react (unit), Playwright (E2E)
- **Linting/Formatting:** Biome 2 (single tool for lint + format, `biome.json`), enforced by Husky pre-commit hooks

## Project Structure

```
src/
├── BoojyNotes.jsx          # Root app component
├── main.jsx                # Entry point, provider setup
├── components/             # UI components (EditableBlock, EditorArea, Sidebar, TopBar, etc.)
│   ├── blocks/             # Block type components (code, table, callout, image, etc.)
│   ├── settings/           # Settings modal panels
│   └── terminal/           # Terminal emulator components
├── context/                # React Context providers (Theme, NoteData, Settings, Layout, Sidebar, Overlay)
├── hooks/                  # Custom hooks (useSync, useHistory, useFileSystem, etc.)
│   └── editor/             # Editor-specific hooks (keyboard, paste, drag, slash commands)
├── services/               # Platform services (nativeAPI, sync, AI)
├── utils/                  # Utilities (storage, search, domHelpers, inlineFormatting, platform)
├── constants/              # Themes, colors, z-index, slash commands, data defaults
├── styles/                 # Shared style objects (buttons, inputs)
├── tokens/                 # Design tokens (spacing, radius, typography, shadows)
└── types/                  # TypeScript type definitions
electron/                   # Electron main process (IPC, file I/O, terminal, export/import)
tests/                      # Unit + E2E tests
docs/private/               # Private docs (gitignored): roadmap, strategies, code signing
```

## Architecture

- **Editor:** Custom `contentEditable` implementation — not ProseMirror, TipTap, or any editor library. Text is stored as markdown tokens in `block.text` and rendered via `inlineMarkdownToHtml()` → `innerHTML`. Be careful with DOM operations.
- **State:** React Context API (6 providers, no Redux/Zustand). NoteData separates data from actions for render optimization. Heavy use of refs to avoid unnecessary re-renders.
- **Styling:** Inline styles driven by theme objects (`useTheme()` → `{ BG, TEXT, ACCENT, SEMANTIC }`). No CSS modules, Tailwind, or styled-components. Design tokens live in `src/tokens/`.
- **Platform:** `src/utils/platform.js` exports `isElectron`, `isWeb`, `isNative` (`isNative === isElectron` — the only file-backed target). Services use `getAPI()` factory to return the Electron or web API.
- **Web builds:** Set `ELECTRON_DISABLE=1` to exclude Electron code. The `dev:web` script does this automatically.

## Dev Workflow

```bash
# Package manager: pnpm (node-linker=hoisted for electron-builder/node-pty)
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
- **Coverage thresholds:** 60% lines, 50% branches, 55% functions, 60% statements
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

This repo uses the docs-system methodology (see `~/Documents/Vault/Projects/Claude Docs System.md`).
Five docs, split by audience and time-horizon:

- **`FEATURES.md`** — plain-language, recruiter/user-facing tour (no file paths or jargon).
- **`README.md`** — dev/public-facing: what it is, stack, architecture, scripts.
- **`CLAUDE.md`** (this file) — the agent's rules: architecture, conventions, workflow.
- **`dreams.md`** — *live working memory*: active target (§1), incident logs (§2), gotchas (§3).
- **`.claude/history/session_ledger.md`** — *append-only* per-session history.

**Memory Synchronization Rule:** Read `dreams.md` at the start of every session to
establish target context. When you resolve an item, flip its checkbox `- [ ]` → `- [x]`.
Active targets, unresolved compile failures, and manual UI bugs are centralized there.

**Automated Validation Hook:** `.claude/settings.json` wires a `PostToolUse` hook
(`.claude/hooks/post-edit-validation.sh`) that runs `biome check --write` → typecheck (`.ts/.tsx`
only) → `vitest related` after every `.js/.jsx/.ts/.tsx` edit, and logs failures into
`dreams.md` §2. Do not bypass it. During multi-file refactors it may log *transient*
mid-edit typecheck failures — clear §2 back to "_None open._" once gates are green.

**Keep docs current:** architecture/roadmap changes update `README.md` + `CLAUDE.md` in the
same commit; a release bumps `package.json` + `CHANGELOG.md`; feature changes update `FEATURES.md`.

## Conventions

- **File naming:** PascalCase for components (`EditableBlock.jsx`), camelCase for hooks/utils/constants
- **Imports:** Relative paths only (no aliases). Order: React → hooks → context → constants → utils → components
- **IDs:** Use `genBlockId()` and `genNoteId()` from `src/utils/storage` — never hand-craft IDs
- **Performance:** Use `React.memo` for components that re-render often. Prefer refs over state for values that don't need to trigger renders.
- **Styles:** Always use theme tokens from `useTheme()`. Never hardcode colors.
- **Mixed JS/TS:** Mostly `.jsx`/`.js`, some `.ts`/`.tsx` for types and utilities
