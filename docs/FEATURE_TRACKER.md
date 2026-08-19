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
- ✅ Block reorder — drag (hold-and-drag) + keyboard (`Cmd/Ctrl+Shift+↑/↓`)
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
- ✅ Recently Deleted (trash) — desktop: wordmark menu → modal; mobile: inline sidebar section
- ✅ Search + tag filter
- ✅ In-note find

## Sync & storage
- ✅ Supabase (auth + data) + Cloudflare R2 (attachments) sync — engine intact but the whole
  sign-in/Profile surface is unmounted (2026-08-18): no cloud UI ships until local-first is
  stable. Recoverable: `ProfileTab.jsx`, `OnboardingToast`/`PersistenceWarning`, `useWebNags`
  stay on disk with zero importers.
- ✅ Conflict resolution + offline recovery + cross-tab consistency

## Views & theming
- ✅ Single-active-note navigation — opening a note replaces the current one; no tabs, no split
  view (removed 2026-08-18, see Removed)
- ✅ Mobile-responsive layout (PWA)
- ✅ Themes (day / night) + starfield background — DAY is now a neutral light palette (the blue-sky
  DAY theme was replaced); starfield remains NIGHT-only (`DAY.starField: false`)
- ✅ Lucide icon set (16px inline / 20px standalone / stroke 1.5) — replaced hand-rolled SVGs

## Platform
- ✅ Web (PWA, `notes.boojy.org`)
- ✅ Desktop (Electron, auto-update, DMG/EXE)
- ✅ Mobile = responsive web only (no native app — see Removed)

## Export / import
- 🚧 Export — PDF / DOCX, **desktop (Electron) only**; on the web app the menu items
  render but no-op (`useExportImport` bails when `getAPI()?.exportPdf` is absent). **No
  Markdown export** — import only.
- ✅ Markdown / folder import (desktop)

## Removed (recoverable via git tag)
- **Settings: Profile/sign-in, Editor (spell check + language) and UI Scale rows** — removed
  2026-08-18 subtraction pass; Settings is a single pane (Appearance · Storage · Updates ·
  About line). Spell check still applies from the stored Electron setting (default on); UI
  scale lives on as Cmd+Plus/Minus/0.
- **Trash's permanent sidebar row (desktop)** — replaced by the wordmark menu's
  "Recently Deleted…" modal over the unchanged trash implementation.
- **Tabs + split view** — removed 2026-08-18 with the single-active-note refactor (state, input
  paths, and components all deleted; old persisted state migrates to the active pane's note).
  Matches `docs/PHILOSOPHY.md`. Quick Open / Recents / back-forward are candidate follow-ups.
- **Native mobile** (iOS/Android, Capacitor) — dropped v0.3.0; not planned. Mobile is now
  responsive web only. Native-mobile release work is **stopped**.
- Terminal (`terminal-snapshot` tag), AI chat — see `CHANGELOG.md`
