# AGENTS.md

Boojy Notes is a block-based editor for Markdown files you own. Desktop (Electron) is the
product; the web build is a responsive PWA used for development, tests and `notes.boojy.org`.
Read files directly when needed. Do not ask before reading.

Suite-wide process lives in the suite root's `AGENTS.md` (`~/Documents/Projects/boojy/AGENTS.md`):
branch discipline, changelog and release skeleton, context hygiene, working preferences. This
file is the app-specific entry point: what the stack is, where things live, and what will bite.

## Which file answers which question

| Question | File |
|---|---|
| What is Boojy, how do I run it | `README.md` |
| What may exist: blocks, syntax support levels, the preservation promise | `docs/SPEC-markdown-source-of-truth.md` |
| What are we doing now, what might we do, what is known-broken | `docs/BACKLOG.md` (Now section first) |
| What shipped, when, and what was removed | `CHANGELOG.md` |
| How the UI is built, and which oddities are deliberate | `.claude/rules/ui-chrome-and-theme.md` |
| CI, build, release, dependency policy | `.claude/rules/ci-build-deploy.md` |

The rules files are kept accurate in the same commits that change the code. When this file and
a rules file disagree, the rules file wins; fix the drift here.

## Stack

React 19 + Vite 6 · Electron 42 · Vitest + Testing Library (unit) + Playwright (E2E) · Biome 2
for lint and format, enforced by Husky pre-commit · pnpm with `node-linker=hoisted` (required by
electron-builder) · TypeScript on new files.

## Commands

```bash
pnpm dev              # Electron + Vite dev mode
pnpm dev:web          # Web-only dev (ELECTRON_DISABLE=1)
pnpm test             # Unit tests
pnpm test:coverage    # Unit tests with the CI coverage gate — run this before pushing
pnpm test:e2e         # Playwright (Chromium)
pnpm check            # Biome lint + format
pnpm typecheck        # tsc --noEmit
pnpm build:electron   # Web build + desktop installers into dist/
```

Production web preview: `ELECTRON_DISABLE=1 pnpm build && pnpm preview`.

## Structure

```
src/
├── BoojyNotes.jsx          # Root app component
├── main.jsx                # Entry point, provider setup
├── components/             # UI (EditableBlock, EditorArea, Sidebar, EditorChrome, …)
│   ├── blocks/             # Media blocks (image, file, embed, spacer)
│   ├── mobile/             # Touch-device UI (toolbar, bottom sheet, FAB, more-menu)
│   └── settings/           # Settings modal sections
├── context/                # React Context providers (Theme, NoteData, Settings, Layout, Sidebar, Overlay, Editor)
├── hooks/                  # App hooks (useActiveNote, useHistory, useFileSystem, …)
│   └── editor/             # Editor hooks (keyboard, paste, drag, slash commands)
├── services/               # getAPI(): the Electron or web API
├── utils/                  # markdown, storage, search, domHelpers, platform, …
├── constants/              # themes.js (the only colour authority), slash commands, z-index
├── tokens/                 # spacing, radius, typography, shadows
└── types/                  # notes.ts (Block/Note/NoteData), global.d.ts (window.electronAPI)
electron/                   # Main process: IPC, file I/O, watcher, OS trash, import
tests/                      # Unit tests + the preservation fixture corpus
e2e/                        # Playwright
docs/private/               # Gitignored personal notes and strategy
```

## Architecture invariants

- **Markdown is the source of truth.** A note *is* its markdown; blocks are an in-memory
  rendering. Every block round-trips block→markdown→block losslessly
  (`tests/utils/markdown.test.js`), and editing one part of a file must not rewrite the rest
  (`tests/utils/preservation.test.js`). No nesting, columns or JSON-blob blocks. Read the spec
  before adding or changing a block type, and check its support levels before planning any
  feature or UI.
- **Editor:** a custom `contentEditable` implementation, not ProseMirror, TipTap or any editor
  library. Text is stored as markdown in `block.text` and rendered via `inlineMarkdownToHtml()`
  into `innerHTML`.
- **Navigation is one string.** `useActiveNote` holds the single active note; opening a note
  replaces the current one. There are no tabs and no split view. Old persisted `boojy-ui-state`
  blobs still migrate in `resolveInitialActiveNote()`; don't "clean up" that read path, it is
  three lines and keeps old installs safe.
- **State:** React Context (7 providers, no Redux/Zustand). NoteData separates data from
  actions; heavy use of refs to avoid re-renders.
- **Styling:** inline styles from `useTheme()` → `{ BG, TEXT, ACCENT, SEMANTIC }`. No CSS
  modules, Tailwind or styled-components. `src/constants/themes.js` is the only colour
  authority; never hardcode a hex. Surface roles, interaction grammar and known leaks are in
  the UI rule.
- **Icons:** Lucide via `src/components/Icons.jsx`, always `currentColor`. Sizes and stroke
  tiers are in the UI rule. Don't hand-roll SVG.
- **Platform:** `src/utils/platform.js` exports `isElectron`, `isWeb`, `isNative`
  (`isNative === isElectron`, the only file-backed target). `ELECTRON_DISABLE=1` excludes
  Electron code from a build.

## Editor gotchas

These have each caused a real bug. Read before touching the editor.

1. **The editor is uncontrolled and state lags the DOM.** The browser owns the live DOM;
   `block.text` is updated on a debounce (`commitTextChange`). Anything that must respond to
   the current keystroke (the empty-block placeholder, for instance) must read the DOM, not
   state. Use CSS `:empty` / `:has(> br:only-child)`; an "empty" block holds a `<br>` for the
   caret, so it is never `:empty` on its own.
2. **The `syncGen` DOM re-sync only fires from React events.** `EditableBlock` re-syncs
   `innerHTML` from `block.text` when `syncGen` changes, but only if the editor re-renders,
   which it is optimised not to do for text edits. Bumping `syncGeneration.current` works from
   React synthetic handlers. It does not work from a native `window` listener. To mutate a
   block from a native listener, write `el.innerHTML = inlineMarkdownToHtml(text, noteTitleSet)`
   directly (the `useInputHandler` pattern) plus `commitNoteData` for state. When a DOM-sync
   fix "should work" but doesn't, add a `console.log` in the layout effect and the handler and
   observe; don't theorise about React timing.
3. **`EditorContext` is frozen at mount.** `EditorProvider` memoises its value with `[]`, so
   every handler pulled from `useEditorContext()` is the one from the first render. Handlers
   must read changing state through refs (`activeNoteRef`, `noteDataRef`, `blockRefs`), never
   a captured value. The same applies to anything handed to a listener registered once
   (`useAppKeyboard`, the window-blur drag cancel).
4. **Every desktop save echoes back through chokidar ~350ms later as `file-changed`.**
   `electron/fileWatcher.js` suppresses it with one resettable timer per path
   (`suppressWatcher`); the renderer's `blocksEqual` bail-out in `useFileSystem.js` is only the
   second line of defence. An echo that escapes re-parses the file with fresh block IDs, every
   block remounts, the caret collapses to the top and the unsaved keystroke is lost. Reproduce
   desktop-only bugs in the real Electron build (Playwright `_electron` with a temp `userData`
   and vault), not jsdom.

## Testing

- Unit tests live in `tests/`, Vitest + jsdom + Testing Library. E2E in `e2e/`, Playwright,
  Chromium only. The preservation corpus in `tests/fixtures/preservation/` is byte-sensitive
  and protected by `.gitattributes`.
- Coverage floors live in `vitest.config.js`, set just below actuals. Ratchet them up as code
  gets covered; never lower them to pass.
- CI runs `test:coverage` and the E2E suite, not `pnpm test`. Run `pnpm test:coverage` before
  pushing.
- Husky + lint-staged format and lint staged files. Never skip with `--no-verify`.

## Release and deployment

- The version source is `package.json`; Settings reads it via import. Never hardcode a version
  string elsewhere.
- Push to `master` deploys the web build to Cloudflare Pages. The build command
  (`ELECTRON_DISABLE=1 pnpm build`) is set in the Cloudflare dashboard, not read from the repo.
- Push a `v*` tag and `release.yml` builds the macOS and Windows installers. Releases land as
  drafts and the matrix can split them; see the CI rule before and after every tag.
- Suite-root files to update on release (outside this repo): the Notes row in
  `~/Documents/Projects/boojy/README.md` and `VISION.md`. Run `/suite-sync` afterwards.

## Conventions

- **Files:** PascalCase components, camelCase hooks/utils/constants. Relative imports only, no
  aliases. Order: React → hooks → context → constants → utils → components.
- **IDs:** `genBlockId()` and `genNoteId()` from `src/utils/storage`; never hand-craft one.
- **Performance:** `React.memo` for components that re-render often; refs over state for
  values that don't need to trigger renders.
- **TypeScript:** new files are `.ts`/`.tsx`. Existing `.js`/`.jsx` files convert on touch,
  when you are already making substantive edits, never in conversion-only commits. Types live
  in `src/types/notes.ts` (the only place `Block`/`Note`/`NoteData` are defined; `NoteData` is
  the id→note map) and `src/types/global.d.ts` (a truthful mirror of `electron/preload.js`;
  change both in the same commit). `@ts-check` + JSDoc typedefs are the halfway house for hot
  `.js` files not yet worth converting.

## Docs

This repo keeps one planning file. `docs/BACKLOG.md` holds Now / Next / Later and known debt;
`CHANGELOG.md` holds what shipped; there is deliberately no roadmap, feature tracker or
current-target file. A change that alters UI behaviour updates the UI rule in the same commit.
A release bumps the version and `CHANGELOG.md`.

## Claude Code

- `.claude/settings.json` wires a `PostToolUse` hook (`.claude/hooks/post-edit-validation.sh`)
  that runs `biome check --write`, then typecheck for `.ts`/`.tsx`, then `vitest related` after
  every `.js/.jsx/.ts/.tsx` edit. On failure it prints the error and exits non-zero. Do not
  bypass it.
- `CLAUDE.md` here is a one-line pointer to this file, a regular file rather than the symlink
  the suite root describes.
