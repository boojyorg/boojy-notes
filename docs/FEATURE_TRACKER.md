# Boojy Notes — Feature Tracker

What's built vs not. **✅ shipped · 🚧 in progress · ⬜ planned.** Tick in the **same commit as
`CHANGELOG.md`** when a feature ships — never as a separate ritual. Ordering → `ROADMAP.md`;
feature ideas → `BACKLOG.md` (Feature ideas section).

> _Draft seeded from `CHANGELOG.md` — verify the 🚧/⬜ calls against the running app._

## Editor & blocks
- ✅ `contentEditable` block editor (markdown-backed, uncontrolled)
- ✅ Block types — paragraph, h1–h3, bullet/numbered/checkbox list, blockquote, code, callout,
  table, image, file, embed, spacer, frontmatter
- ✅ Slash commands + markdown input shortcuts
- ✅ Block reorder — drag by the hover-revealed gutter handle (text never drags; hold-to-drag
  removed 2026-09-03), committing on drop behind a 3px accent insertion marker (live reorder
  removed 2026-09-03) + keyboard (`Cmd/Ctrl+Shift+↑/↓`)
- ✅ List-only indent (paragraph/heading indent removed — round-trip safe)

## Formatting & linking
- ✅ Inline formatting — bold, italic, strikethrough, highlight, inline code
- ✅ Wikilinks + backlinks
- ✅ Tags + tag autocomplete

## Markdown source-of-truth
- ✅ Lossless block↔markdown round-trip (v0.5.0 constraint, enforced by `markdown.test.js`;
  known import gaps tracked in `BACKLOG.md`: tilde fences, `:---` tables, indented content)
- ✅ `.md` import/round-trip

## Organize & find
- ✅ Nested folders / note tree (sidebar) — folder rows toggle by whole-row click; no
  disclosure chevrons (2026-08-18 experiment, reversible)
- ✅ Delete — Electron sends Boojy-managed Markdown files to the OS Trash/Recycle Bin; web uses
  confirmed permanent deletion
- ✅ Search + tag filter
- ✅ In-note find

## Storage
- ✅ Desktop notes are Markdown files in a user-chosen folder
- ✅ Web notes persist locally in browser storage

## Views & theming
- ✅ Single-active-note navigation — opening a note replaces the current one; no tabs, no split
  view (removed 2026-08-18, see Removed)
- ✅ Mobile-responsive layout (PWA)
- ✅ Themes (day / night / auto) + starfield background — Light is the no-preference default;
  saved choices persist. DAY is a neutral light palette; starfield remains NIGHT-only
  (`DAY.starField: false`)
- ✅ Lucide icon set (16px inline / 20px standalone / stroke 1.5) — replaced hand-rolled SVGs

## Platform
- ✅ Web (PWA, `notes.boojy.org`)
- ✅ Desktop (Electron, auto-update, DMG/EXE)
- ✅ Mobile = responsive web only (no native app — see Removed)

## Import
- ✅ Markdown / folder import (desktop)

## Removed (recoverable via git tag)
- **Cloud sync and sign-in** — the Supabase auth/client, R2-backed Edge Functions, realtime and
  cross-tab sync engine, conflict UI, tests, environment template and dependency were removed
  together. Boojy is fully local; Git history retains the former implementation if the product
  direction changes.
- **PDF / DOCX export** — removed 2026-08-19 as non-core to a Markdown editor; the UI,
  Electron implementation and `docx` dependency were deleted together. Recoverable from
  `v0.5.0` / Git history if the product decision changes. No replacement Print command was added.
- **Recently Deleted / private `.trash`** — removed 2026-08-19. Electron uses the platform
  Trash/Recycle Bin; web retains confirmed permanent deletion. Existing private-trash notes are
  migrated conservatively to the OS Trash, while ambiguous or failed items remain untouched and
  are reported.
- **Wordmark app menu / separate About destination** — removed 2026-08-19; the Notes wordmark
  opens Settings directly, whose quiet footer retains version and credit.
- **Settings: Profile/sign-in, Editor (spell check + language) and UI Scale rows** — removed
  2026-08-18 subtraction pass; Settings is a single pane (Appearance · Storage · Updates ·
  About line). Spell check still applies from the stored Electron setting (default on); UI
  scale lives on as Cmd+Plus/Minus/0.
- **Tabs + split view** — removed 2026-08-18 with the single-active-note refactor (state, input
  paths, and components all deleted; old persisted state migrates to the active pane's note).
  Matches `docs/PHILOSOPHY.md`. Quick Open / Recents / back-forward are candidate follow-ups.
- **Native mobile** (iOS/Android, Capacitor) — dropped v0.3.0; not planned. Mobile is now
  responsive web only. Native-mobile release work is **stopped**.
- Terminal (`terminal-snapshot` tag), AI chat — see `CHANGELOG.md`
