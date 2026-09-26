# AGENTS.md

Boojy Notes is a desktop (Electron) editor for Markdown files you own. The web build
(`pnpm dev:web`) is a development and test surface, not the product. Read files directly when
needed; do not ask before reading.

Naming: **Boojy** is the suite; this product is **Boojy Notes** (then "the app" or "it") in
documentation and product prose. Identifiers, stored keys, filenames and URLs stay as they are.
Suite-wide process lives in `~/Documents/Projects/boojy/AGENTS.md`.

## Which file answers which question

| Question | File |
| --- | --- |
| What it is, how to run it | `README.md` |
| What may exist: blocks, Markdown support, the preservation promise | `docs/SPEC-markdown-source-of-truth.md` |
| Direction, Beta requirements and candidates, known issues, after Beta | `docs/BACKLOG.md` |
| What shipped and what was removed | `CHANGELOG.md` |
| Chrome, theme, sidebar, search | `.claude/rules/ui-chrome-and-theme.md` |
| Editor invariants | `.claude/rules/editor.md` |
| Files, watcher, outside edits, folders, title-is-filename | `.claude/rules/files-and-watcher.md` |
| CI, build, release, dependencies | `.claude/rules/ci-build-deploy.md` |

The rules files are updated in the same commit as the code they describe, and win over this
file when they disagree.

**Rules files have a budget** (they load into every session): editor 20k characters, UI 15k,
files 8k, CI 7k. A bullet is the rule, one reason, and the spec that proves it; never dates,
measurements or "before this" stories (git and `CHANGELOG.md` keep those), never values the
code already holds. A change that adds to a file at its budget cuts something.

## Stack and commands

React 19 + Vite 8 · Electron 44 · Vitest + Testing Library, Playwright · Biome 2 (Husky on
commit) · pnpm with `node-linker=hoisted` · TypeScript on new files.

```sh
pnpm dev              # Electron + Vite
pnpm dev:web          # browser only (ELECTRON_DISABLE=1)
pnpm test:coverage    # unit tests with the CI coverage gate; run before pushing
pnpm test:e2e         # Playwright, web build
pnpm test:electron    # real Electron against a throwaway vault
pnpm check            # Biome lint + format
pnpm typecheck        # tsc --noEmit
pnpm build:electron   # desktop installers into release/
```

## Structure

```text
src/
├── BoojyNotes.jsx      # root component; main.jsx is the entry
├── components/         # UI; blocks/ (media blocks), settings/
├── context/            # Theme, NoteData, Settings, Layout, Sidebar, Overlay, Editor
├── hooks/              # app hooks; editor/ holds keyboard, paste, drag, slash commands
├── services/           # getAPI(): the Electron or web API
├── utils/              # markdown.js (the converters), storage, search, platform, …
├── constants/          # themes.js (the only colour authority), layout.js, slash commands, z-index
├── tokens/  styles/    # spacing, radius, type, shadows; shared style fragments
└── types/              # notes.ts (Block/Note/NoteData), global.d.ts (window.electronAPI)
electron/               # main process: IPC, file I/O, watcher, OS trash, folders, menu
tests/  e2e/            # unit tests + preservation corpus; Playwright (e2e/electron/ = real app)
dev/                    # dev-only tooling (?tweak); never bundled
```

## Invariants

- **Markdown is the source of truth.** Blocks render a note's *structure*, not its lines. Every
  block round-trips losslessly; editing one part never rewrites the rest; nothing Markdown
  cannot express. Read the spec before changing a block type.
- **A persisted note's title is its filename**; only the write decides the final name
  (files rule).
- **The editor is a custom, uncontrolled `contentEditable`**, no editor library. Text lives as
  Markdown in `block.text`, rendered by `inlineMarkdownToHtml()`.
- **One active note**; no tabs or split view.
- **State is React Context**, no Redux/Zustand; refs for anything that must not render. **Note
  state has one owner**: every change through a `useHistory` action (editor rule).
- **Styling is inline from `useTheme()`**, never a hardcoded hex. **Icons are Lucide only**
  via `Icons.jsx`.
- **Every path that crosses IPC stays inside the vault** (`insideVault()`,
  `resolveVaultDir()`). The window never opens a second window or navigates; http(s) links go
  to the system browser. Config and settings are written atomically.
- Platform flags live in `src/utils/platform.js`; `ELECTRON_DISABLE=1` excludes Electron code.

## Keep it small

One person must be able to hold the app in their head.

- Abstract only what is repeated now; no speculative frameworks, buses or state layers.
- Prefer deleting a duplicate path to wrapping it.
- Enforce an invariant at the existing ownership seam, so the invalid path is impossible.
- Complexity is earned only by simplifying the product.

## Editor gotchas

Each has caused a real bug.

1. **State lags the DOM.** `block.text` updates on a debounce; anything answering the current
   keystroke reads the DOM. An empty block holds a `<br>`, so use `:has(> br:only-child)`,
   never `:empty`.
2. **A text block is painted from the keystroke ref, only on a signal** (mount, `syncGen`, title
   set), never from the render. A programmatic text edit edits the DOM and reads it back. When a
   DOM-sync fix "should work" but doesn't, log in the effect and observe; don't theorise.
3. **`EditorContext` is frozen at mount** (memoised with `[]`): handlers read changing state
   through refs (`activeNoteRef`, `noteDataRef`, `blockRefs`), as does any listener registered
   once.
4. **Every desktop save echoes back through chokidar, up to ~3 s later.** The watcher drops only
   events it can trace to the app's own operation, by bytes, never by timer (files rule). An
   escaped echo re-parses the note, remounts every block and loses the caret and keystroke.
   Reproduce desktop bugs in real Electron, not jsdom.

## Testing

- Unit tests in `tests/` (Vitest, jsdom); E2E in `e2e/`. `tests/fixtures/preservation/` is
  byte-sensitive (`.gitattributes`).
- **Markdown has four contracts**: `markdown.test.js` (block → md → block),
  `preservation.test.js` (md → blocks → md, byte for byte), `domRoundTrip.test.js` (rendered,
  painted and read back), `markdownInterop.test.js` (meaning judged by `markdown-it`, never by
  our own parser; known mismatches are narrow `it.fails`).
- Coverage floors sit just below actuals: ratchet up, never lower. CI gates are
  `test:coverage`, web E2E and the Electron suite.
- **Three verification surfaces**: `dev:web` for iteration and visual judgement, a visible
  Electron build for final desktop acceptance, `pnpm test:electron` for automated proof. The
  installed app is rebuilt at checkpoints, not per PR.
- **The Electron suite proves cross-layer behaviour from the outside** (editor text, Markdown on
  disk, filenames, state after restart); no test-only bridge into React state unless an
  invariant cannot otherwise be proven. Window hidden locally, shown on CI (CI rule).
- **Correctness fixes include a regression test that fails first**, at the lowest trustworthy
  layer; anything crossing debounces, IPC, the watcher or a restart goes in the Electron suite.
- Never skip the pre-commit hook with `--no-verify`.

## Release

The version source is `package.json`; never hardcode one. Mechanics and the draft-release trap:
CI rule. Every release runs the docs pass: shipped items leave `docs/BACKLOG.md` for
`CHANGELOG.md`; re-read the README Status and the backlog's Direction; bump the backlog's
last-reviewed date; update the Notes row in the suite `README.md` and `VISION.md`; run
`/suite-sync`.

## Conventions

- PascalCase components, camelCase hooks/utils/constants. Relative imports, ordered React →
  hooks → context → constants → utils → components.
- IDs come from `genBlockId()` / `genNoteId()`; never hand-craft one.
- **TypeScript on touch**: new files `.ts`/`.tsx`; convert existing files only during
  substantive edits. `src/types/notes.ts` is the only home of `Block`/`Note`/`NoteData`;
  `global.d.ts` mirrors `electron/preload.js` in the same commit.

## Docs and Claude Code

One planning file (`docs/BACKLOG.md`, tiered, including direction) and one history file
(`CHANGELOG.md`); deliberately no roadmap, tracker or direction document. A change to UI or
editor behaviour updates its rules file in the same commit.

`.claude/hooks/post-edit-validation.sh` runs after every `.js/.jsx/.ts/.tsx` edit (Biome,
typecheck for TS, `vitest related`). Do not bypass it. `CLAUDE.md` points here.
