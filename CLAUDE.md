# Claude Code Instructions

Boojy Notes — a block-based note-taking app for web, desktop, and mobile.
Read files directly when needed. Do not ask before reading.

## Tech Stack

- **Frontend:** React 19, Vite 6
- **Desktop:** Electron 40
- **Mobile:** Capacitor 8 (iOS + Android)
- **Backend:** Supabase (auth + database), Cloudflare R2 (attachments)
- **Testing:** Vitest + @testing-library/react (unit), Playwright (E2E)
- **Linting:** ESLint 9 (flat config) + Prettier, enforced by Husky pre-commit hooks

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
- **Platform:** `src/utils/platform.js` exports `isElectron`, `isCapacitor`, `isWeb`, `isNative`. Services use `getAPI()` factory to return the right platform API.
- **Web/mobile builds:** Set `ELECTRON_DISABLE=1` to exclude Electron code. The `dev:web` script does this automatically.

## Dev Workflow

```bash
npm run dev           # Electron + Vite dev mode
npm run dev:web       # Web-only dev (ELECTRON_DISABLE=1)
npm test              # Unit tests (Vitest)
npm run test:e2e      # E2E tests (Playwright, Chromium)
npm run lint          # ESLint check
npm run format:check  # Prettier check
npm run typecheck     # TypeScript check
npm run build:electron  # Build desktop installer
```

See `TESTING.md` for full platform testing docs (iOS, Android, web preview).

## Testing

- **Unit tests:** `tests/` directory, Vitest + jsdom + @testing-library/react
- **E2E tests:** Playwright (Chromium only), configured in `playwright.config.js`
- **Coverage thresholds:** 60% lines, 50% branches, 55% functions, 60% statements
- **Before committing:** Always run `npm test` and `npm run format:check` — CI checks both
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
3. Run `npm test` and `npm run format:check` before committing
4. Commit all changes and push to `master`
5. Review `docs/private/ROADMAP.md` — move completed items, reassess priorities
6. Tag with version: `git tag v0.x.x && git push origin v0.x.x`

## Deployment

- **Web (boojy.org):** Cloudflare Pages auto-deploys on push to `master`. Build: `ELECTRON_DISABLE=1 npm run build`, serves from `dist/`.
- **macOS + Windows:** GitHub Actions (`release.yml`) triggers on `v*` tag push. Builds Electron installers, uploads to GitHub Release.

Pushing to `master` deploys web; pushing the tag builds desktop installers.

## Conventions

- **File naming:** PascalCase for components (`EditableBlock.jsx`), camelCase for hooks/utils/constants
- **Imports:** Relative paths only (no aliases). Order: React → hooks → context → constants → utils → components
- **IDs:** Use `genBlockId()` and `genNoteId()` from `src/utils/storage` — never hand-craft IDs
- **Performance:** Use `React.memo` for components that re-render often. Prefer refs over state for values that don't need to trigger renders.
- **Styles:** Always use theme tokens from `useTheme()`. Never hardcode colors.
- **Mixed JS/TS:** Mostly `.jsx`/`.js`, some `.ts`/`.tsx` for types and utilities
