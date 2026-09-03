# AGENTS.md

Boojy Notes is a desktop (Electron) editor for Markdown files you own. The web build
(`pnpm dev:web`) is a development and test surface, not the product. Read files directly when
needed; do not ask before reading.

Suite-wide process (branch discipline, changelog and release skeleton, working preferences)
lives in the suite root's `AGENTS.md` (`~/Documents/Projects/boojy/AGENTS.md`). This file is
the map: stack, layout, the invariants, the editor traps, and where the detailed rules live.

## Which file answers which question

| Question | File |
| --- | --- |
| What is Boojy, how do I run it | `README.md` |
| What may exist: blocks, syntax support levels, the preservation promise | `docs/SPEC-markdown-source-of-truth.md` |
| What is left to do, what is known-broken | `docs/BACKLOG.md` |
| What shipped, and what was removed | `CHANGELOG.md` |
| How the UI is built, and which oddities are deliberate | `.claude/rules/ui-chrome-and-theme.md` |
| CI, build, release, dependency policy | `.claude/rules/ci-build-deploy.md` |

The rules files are kept accurate in the same commit as the code they describe. When this
file and a rules file disagree, the rules file wins; fix the drift here.

## Stack

React 19 + Vite 6 · Electron 42 · Vitest + Testing Library (unit), Playwright (E2E) · Biome 2
for lint and format, run by Husky on commit · pnpm with `node-linker=hoisted` · TypeScript on
new files.

## Commands

```sh
pnpm dev              # Electron + Vite
pnpm dev:web          # browser only (ELECTRON_DISABLE=1)
pnpm test             # unit tests
pnpm test:coverage    # unit tests with the CI coverage gate; run before pushing
pnpm test:e2e         # Playwright, Chromium
pnpm check            # Biome lint + format
pnpm typecheck        # tsc --noEmit
pnpm build:electron   # web build + desktop installers into dist/
```

## Structure

```text
src/
├── BoojyNotes.jsx      # root component
├── main.jsx            # entry, providers
├── components/         # UI; blocks/ (media blocks), mobile/ (touch UI), settings/
├── context/            # Theme, NoteData, Settings, Layout, Sidebar, Overlay, Editor
├── hooks/              # app hooks; editor/ holds keyboard, paste, drag, slash commands
├── services/           # getAPI(): the Electron or web API
├── utils/              # markdown.js (the converters), storage, search, platform, …
├── constants/          # themes.js (the only colour authority), slash commands, z-index
├── tokens/             # spacing, radius, typography, shadows
└── types/              # notes.ts (Block/Note/NoteData), global.d.ts (window.electronAPI)
electron/               # main process: IPC, file I/O, watcher, OS trash, import
tests/                  # unit tests and the preservation fixture corpus
e2e/                    # Playwright
docs/private/           # gitignored personal notes
```

## Invariants

- **Markdown is the source of truth.** A note *is* its markdown; blocks are an in-memory
  rendering. Every block round-trips block→markdown→block losslessly, and editing one part of
  a file must not rewrite the rest. No nesting, columns or JSON-blob blocks. Read the spec
  before adding or changing a block type, and check its support levels before planning a
  feature.
- **The editor is a custom, uncontrolled `contentEditable`.** No ProseMirror, TipTap or editor
  library. Text lives as markdown in `block.text` and is rendered through
  `inlineMarkdownToHtml()` into `innerHTML`.
- **One active note.** `useActiveNote` holds a single note ID; opening a note replaces it.
  There are no tabs and no split view. Old persisted `boojy-ui-state` blobs still migrate in
  `resolveInitialActiveNote()`; leave that read path alone, it keeps old installs safe.
- **State is React Context** (7 providers, no Redux/Zustand). NoteData separates data from
  actions; refs carry anything that must not trigger renders.
- **Styling is inline from `useTheme()`** (`BG`, `TEXT`, `ACCENT`, `SEMANTIC`), never a
  hardcoded hex. Tokens live in `src/tokens/`. Roles, grammar and known leaks: UI rule.
- **Icons are Lucide only**, via `src/components/Icons.jsx`, always `currentColor`. Size and
  stroke tiers: UI rule.
- **Platform:** `src/utils/platform.js` exports `isElectron`, `isWeb`, `isNative`
  (`isNative === isElectron`). `ELECTRON_DISABLE=1` excludes Electron code from a build.

## Editor gotchas

Each of these has caused a real bug. Read before touching the editor.

1. **State lags the DOM.** The browser owns the live DOM; `block.text` updates on a debounce
   (`commitTextChange`). Anything that must respond to the current keystroke (the empty-block
   placeholder, for one) reads the DOM, not state. An "empty" block holds a `<br>` for the
   caret, so it is never `:empty`; use `:has(> br:only-child)`.
2. **The `syncGen` re-sync only fires from React events.** `EditableBlock` repaints
   `innerHTML` from `block.text` when `syncGen` changes, but only if the editor re-renders,
   which it is optimised not to do for text edits. Bumping `syncGeneration.current` works from
   React synthetic handlers and not from a native `window` listener. To mutate a block from a
   native listener, set `el.innerHTML = inlineMarkdownToHtml(text, noteTitleSet)` directly (the
   `useInputHandler` pattern) plus `commitNoteData`. When a DOM-sync fix "should work" but
   doesn't, add a `console.log` in the layout effect and observe; don't theorise about timing.
3. **`EditorContext` is frozen at mount.** Its value is memoised with `[]`, so every handler
   from `useEditorContext()` is the first render's. Handlers read changing state through refs
   (`activeNoteRef`, `noteDataRef`, `blockRefs`), never a captured value. The same applies to
   any listener registered once (`useAppKeyboard`, the window-blur drag cancel).
4. **Every desktop save echoes back through chokidar ~350ms later.** `electron/fileWatcher.js`
   suppresses it with one resettable timer per path; the renderer's `blocksEqual` bail-out is
   only the second line of defence. An echo that escapes re-parses the file with fresh block
   IDs, every block remounts, the caret jumps to the top and the unsaved keystroke is lost.
   Reproduce desktop-only bugs in the real Electron build (Playwright `_electron`, temp
   `userData` and vault), not jsdom.

## Testing

- Unit tests in `tests/` (Vitest, jsdom, Testing Library); E2E in `e2e/`. The preservation
  corpus in `tests/fixtures/preservation/` is byte-sensitive and protected by `.gitattributes`.
- Coverage floors in `vitest.config.js` sit just below actuals. Ratchet up; never lower to pass.
- CI runs `test:coverage` and E2E, not `pnpm test`. Desktop behaviour is only proven in a real
  Electron build; the web build cannot stand in for it.
- Never skip the pre-commit hook with `--no-verify`.

## Release

The version source is `package.json` (Settings imports it; never hardcode a version). Pushing a
`v*` tag builds the installers; pushing `master` deploys the web build. Mechanics, the draft
release trap and the dependency policy: CI rule. On release also update the Notes row in the
suite root's `README.md` and `VISION.md`, then run `/suite-sync`.

## Conventions

- PascalCase components, camelCase hooks/utils/constants. Relative imports only, ordered React
  → hooks → context → constants → utils → components.
- IDs come from `genBlockId()` / `genNoteId()` in `src/utils/storage`; never hand-craft one.
- `React.memo` for components that re-render often; refs over state for non-rendering values.
- **TypeScript on touch.** New files are `.ts`/`.tsx`. Existing `.js`/`.jsx` convert when you
  are already making substantive edits, never in conversion-only commits. `src/types/notes.ts`
  is the only home of `Block`/`Note`/`NoteData` (the id→note map); `src/types/global.d.ts`
  mirrors `electron/preload.js` and changes in the same commit. `@ts-check` + JSDoc is the
  halfway house for hot `.js` files.

## Docs and Claude Code

One planning file (`docs/BACKLOG.md`) and one history file (`CHANGELOG.md`); there is
deliberately no roadmap, feature tracker or current-target file. A change to UI behaviour
updates the UI rule in the same commit; a release bumps the version and `CHANGELOG.md`.

`.claude/settings.json` runs `.claude/hooks/post-edit-validation.sh` after every
`.js/.jsx/.ts/.tsx` edit: Biome with fixes, typecheck for `.ts`/`.tsx`, then `vitest related`.
Do not bypass it. `CLAUDE.md` is a one-line pointer to this file.
