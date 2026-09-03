# AGENTS.md

Boojy Notes — a block-based note-taking app for web (responsive PWA) and desktop.
Read files directly when needed. Do not ask before reading.

**Suite-wide process/conventions live in the suite root's `AGENTS.md`
(`~/Documents/Projects/boojy/AGENTS.md`)** (memory model, changelog/release skeleton, branch
discipline, context-hygiene, working prefs); this file is the app-specific architecture, stack,
and gotchas.

## Tech Stack

- **Frontend:** React 19, Vite 6 (responsive — mobile-browser layout via `useIsMobile`)
- **Desktop:** Electron 42
- **Testing:** Vitest + @testing-library/react (unit), Playwright (E2E)
- **Linting/Formatting:** Biome 2 (single tool for lint + format, `biome.json`), enforced by Husky pre-commit hooks
- **Package manager:** pnpm (`.npmrc` `node-linker=hoisted` for electron-builder)

## Project Structure

```
src/
├── BoojyNotes.jsx          # Root app component
├── main.jsx                # Entry point, provider setup
├── components/             # UI components (EditableBlock, EditorArea, Sidebar, EditorChrome, etc.)
│   ├── blocks/             # Media block components (image, file, embed, spacer)
│   ├── mobile/             # Mobile-browser UI (toolbar, bottom sheet, FAB, more-menu)
│   └── settings/           # Settings modal sections
├── context/                # React Context providers (Theme, NoteData, Settings, Layout, Sidebar, Overlay, Editor)
├── hooks/                  # Custom hooks (useActiveNote, useHistory, useFileSystem, etc.)
│   └── editor/             # Editor-specific hooks (keyboard, paste, drag, slash commands)
├── services/               # Platform services (apiProvider)
├── utils/                  # Utilities (storage, search, domHelpers, inlineFormatting, platform)
├── constants/              # Themes, z-index, slash commands, data defaults
├── styles/                 # Shared style objects (buttons, inputs)
├── tokens/                 # Design tokens (spacing, radius, typography, shadows)
└── types/                  # TypeScript type definitions
electron/                   # Electron main process (IPC, file I/O, import)
tests/                      # Unit + E2E tests
docs/private/               # Private docs (gitignored): roadmap, strategies, code signing
```

## Architecture

> **⚠️ BINDING CONSTRAINT — markdown is the source of truth.** A note *is* its markdown;
> blocks are only an in-memory rendering. Every block MUST round-trip block→markdown→block
> losslessly, enforced by `tests/utils/markdown.test.js`. No nesting/columns/JSON-blob blocks.
> Read `docs/SPEC-markdown-source-of-truth.md` before adding or changing any block type.

> **⚠️ PRODUCT PHILOSOPHY — read `docs/PHILOSOPHY.md` before planning features or UI.**
> Boojy is a simple editor for Markdown files you own; unsupported Markdown must be
> *preserved*, not cleaned up (the other round-trip direction: markdown→blocks→markdown,
> enforced by `tests/utils/preservation.test.js` with known failures explicitly marked).
> Every syntax sits at one of four support levels: Native / Compatible / Preserved / Out
> of scope. Features do not earn permanent UI merely because Boojy can support them.

**For current UI/chrome state, `.claude/rules/*.md` is the authority** — those files are kept
accurate in the same commits that change the code. When this file and a rules file disagree on
implementation detail, trust the rules file (and fix the drift here).

- **Editor:** Custom `contentEditable` implementation — not ProseMirror, TipTap, or any editor library. Text is stored as markdown tokens in `block.text` and rendered via `inlineMarkdownToHtml()` → `innerHTML`. Be careful with DOM operations.

> **⚠️ Editor gotchas (these have caused real bugs — read before touching the editor):**
> The editor is **uncontrolled**: the browser owns the live DOM; `block.text`/React state is updated on a **debounce** (`commitTextChange`) and therefore *lags the visible DOM during typing*. Two rules follow:
> 1. **Don't drive live-updating UI off `block.text`.** Anything that must respond to the current keystroke (e.g. the empty-block placeholder) must read the **DOM**, not state. Use CSS `:empty` / `:has(> br:only-child)` — note an "empty" block holds a `<br>` for the caret, so it is *never* `:empty` on its own. (This caused the placeholder-overlap bug.)
> 2. **The `syncGen` DOM-resync only fires from React events, not native listeners.** `EditableBlock`'s `useLayoutEffect` re-syncs `innerHTML` from `block.text` when `syncGen` changes — but only if the editor actually re-renders, which it's optimised *not* to do for text edits. Bumping `syncGeneration.current` works from React synthetic-event handlers (input/keydown/paste). It does **not** work from a **native `window` listener** (e.g. a menu's `addEventListener('keydown')`) — React won't re-render, so the effect never runs. To mutate a block from a native listener, write `el.innerHTML = inlineMarkdownToHtml(text, noteTitleSet)` **directly** (the `useInputHandler` pattern), plus `commitNoteData` for state. (This caused the wikilink-insert bug.)
> When a render/DOM-sync fix "should work" but the DOM doesn't update, **add a `console.log` in the layout effect + handler and observe** before proposing more fixes — don't theorise about React timing.
> 3. **`EditorContext` is frozen at mount.** `EditorProvider` memoises its value with `[]`, so
>    every handler EditorArea/EditableBlock/MobileToolbar pull from `useEditorContext()` is the
>    one from BoojyNotes' *first* render. Handlers must read changing state through refs
>    (`activeNoteRef`, `noteDataRef`, `blockRefs`…), never through a captured value. A handler
>    closing over `activeNote` acts on the launch-time note forever (this is why hold-and-drag
>    silently worked only on the first note until 2026-09). Same rule for anything handed to a
>    listener registered once (`useAppKeyboard`, the window-blur drag cancel).
> 4. **Every desktop save echoes back through chokidar ~350ms later as `file-changed`.** `electron/fileWatcher.js` suppresses it with ONE resettable timer per path (`suppressWatcher`); the renderer's `blocksEqual` bail-out in `useFileSystem.js` is only the second line of defence, and it fails whenever a keystroke reached state after the write. An echo that escapes re-parses the file with fresh `md-N` block IDs → every block remounts → caret collapses to the top of the note and the un-saved keystroke is lost. Reproduce desktop-only bugs like this in the real Electron build (Playwright `_electron` + a temp `userData`/vault), not jsdom.
- **Navigation — single-active-note (2026-08-18):** there are **no tabs and no split view**;
  navigation state is one string (`useActiveNote` in `src/hooks/useActiveNote.js`) and opening a
  note replaces the current one. The old pane/tab components and hooks are *deleted* (git history
  has them); old persisted `boojy-ui-state` blobs still migrate deterministically in
  `resolveInitialActiveNote()` — don't "clean up" that read path. Details + revert paths in
  `.claude/rules/ui-chrome-and-theme.md`.
- **State:** React Context API (7 providers, no Redux/Zustand). NoteData separates data from actions for render optimization. Heavy use of refs to avoid unnecessary re-renders.
- **Styling:** Inline styles driven by theme objects (`useTheme()` → `{ BG, TEXT, ACCENT, SEMANTIC }`). No CSS modules, Tailwind, or styled-components. Design tokens live in `src/tokens/`. **`src/constants/themes.js` is the only colour authority** — never hardcode a hex in a component (see `.claude/rules/ui-chrome-and-theme.md` for the surface roles and the remaining known leaks).
- **Icons:** Lucide (`lucide-react`), wrapped in `src/components/Icons.jsx` so call sites import stable names. **16px** inline / **20px** standalone controls / **stroke 1.5**, all `currentColor`. Don't hand-roll SVG icons.
- **Desktop/web chrome:** there is no top bar. `TitleBar` (28px, drag region) is desktop-only; the only editor-level controls are the two pinned buttons in `EditorChrome.jsx`. Mobile keeps `TopBarMobile` unchanged.
- **Platform:** `src/utils/platform.js` exports `isElectron`, `isWeb`, `isNative` (`isNative === isElectron` — the only file-backed target). Services use `getAPI()` factory to return the Electron or web API.
- **Web builds:** Set `ELECTRON_DISABLE=1` to exclude Electron code. The `dev:web` script does this automatically.

## Dev Workflow

```bash
# Package manager: pnpm (node-linker=hoisted for electron-builder)
pnpm dev              # Electron + Vite dev mode
pnpm dev:web          # Web-only dev (ELECTRON_DISABLE=1)
pnpm test             # Unit tests (Vitest)
pnpm test:watch       # Unit tests, watch mode
pnpm test:coverage    # Unit tests with the CI coverage gate
pnpm test:e2e         # E2E tests (Playwright, Chromium)
pnpm lint             # Biome lint (lint:fix / format auto-fix variants exist)
pnpm format:check     # Biome format check
pnpm check            # Biome lint + format (combined)
pnpm typecheck        # TypeScript check
pnpm build:electron   # Build desktop installers (.dmg / .exe → dist/, alongside the web build)
```

**Production web preview:** `ELECTRON_DISABLE=1 pnpm build && pnpm preview`. The web build is
fully responsive — the small-screen layout is driven by viewport width via `useIsMobile`, not a
native wrapper.

## Testing

- **Unit tests:** `tests/` directory, Vitest + jsdom + @testing-library/react
- **E2E tests:** Playwright (Chromium only), configured in `playwright.config.js`
- **Coverage thresholds:** set in `vitest.config.js` (currently 47% lines, 43% branches, 45% functions, 45% statements) — a floor set just below current actuals (CI was red since the v0.2.0 mobile UI overhaul added untested component code). Ratchet UP as presentational code gets covered; never lower to pass.
- **CI runs `test:coverage`, not `test`** — run `pnpm test:coverage` before pushing, or the coverage gate can fail even when `pnpm test` is green.
- **Before committing:** Always run `pnpm test` and `pnpm format:check` — CI checks both
- **Pre-commit hooks:** Husky + lint-staged auto-formats and lints staged files. Never skip with `--no-verify`.

## Release (repo-specific)

General changelog + release flow → suite root `AGENTS.md`. Local specifics: the version source is
**`package.json`** (Settings reads it via import — never hardcode a version string elsewhere), and
on release review **`docs/private/ROADMAP.md`** (move completed items, reassess priorities). The
`master`→web / `v*` tag→desktop split is in **Deployment** below.

**Suite-root files that also need updating on release** (these live outside this repo):
- `~/Documents/Projects/boojy/README.md` — apps table Notes row (version)
- `~/Documents/Projects/boojy/VISION.md` — product table Notes row + "Status as of" date

Run `/suite-sync` after releasing to catch any remaining drift.

## Deployment

- **Web (notes.boojy.org):** Cloudflare Pages auto-deploys on push to `master`. (`boojy.org` is
  the separate marketing site, `boojy-web` repo.) Build: `ELECTRON_DISABLE=1 pnpm build`, serves from `dist/`. **The CF Pages build command must be set to pnpm in the dashboard** (it does not read from the repo).
- **macOS + Windows:** GitHub Actions (`release.yml`) triggers on `v*` tag push. Builds Electron installers, uploads to GitHub Release.

Pushing to `master` deploys web; pushing the tag builds desktop installers.

## Memory & docs (repo-specific)

Docs/memory model (AGENTS.md / `.claude/rules/` / `dreams.md` / agent memory / git log) and the
keep-docs-current rule → suite root `AGENTS.md`. This repo's local layout: `dreams.md` holds the
current target only; `docs/ROADMAP.md` (ordered) / `docs/BACKLOG.md` (someday) /
`docs/FEATURE_TRACKER.md` (built-vs-not) split the overflow; per-area gotchas live in
`.claude/rules/*.md` (plain markdown — readable by any agent).

## Conventions

- **File naming:** PascalCase for components (`EditableBlock.jsx`), camelCase for hooks/utils/constants
- **Imports:** Relative paths only (no aliases). Order: React → hooks → context → constants → utils → components
- **IDs:** Use `genBlockId()` and `genNoteId()` from `src/utils/storage` — never hand-craft IDs
- **Performance:** Use `React.memo` for components that re-render often. Prefer refs over state for values that don't need to trigger renders.
- **Styles:** Always use theme tokens from `useTheme()`. Never hardcode colors.
- **TypeScript policy (adopted 2026-08-19):** new files are written in TS (`.ts`/`.tsx`);
  existing `.js`/`.jsx` files are converted **on touch** — when you're already making
  substantive edits to one, not in conversion-only commits. No big-bang rename campaigns.
  The type homes: `src/types/notes.ts` (note model + app data shapes — the only place
  `Block`/`Note`/`NoteData` are defined; `NoteData` means the id→note map, matching app
  vocabulary) and `src/types/global.d.ts` (the `window.electronAPI` surface — a truthful
  mirror of `electron/preload.js`; **change it in the same commit as any preload change**).
  `@ts-check` + JSDoc typedefs importing from `types/notes` are the halfway house for
  hot `.js` files not yet worth converting.

## Claude Code–specific

Only applies when the agent is Claude Code; other agents can skip this section (but note the hook
runs on Claude Code's edits regardless of who wrote the guidance).

- **Automated Validation Hook:** `.claude/settings.json` wires a `PostToolUse` hook
  (`.claude/hooks/post-edit-validation.sh`) that runs `biome check --write` → typecheck (`.ts/.tsx`
  only) → `vitest related` after every `.js/.jsx/.ts/.tsx` edit. On failure it prints the error and
  exits non-zero (it does **not** write to any doc). Do not bypass it.
- `CLAUDE.md` in this repo is a one-line pointer telling agents to read this file (a regular
  file, not a symlink).
