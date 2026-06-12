# Boojy Notes — Feature Tracker

What's built vs not. **✅ shipped · 🚧 in progress · ⬜ planned.** Tick in the **same commit as
`CHANGELOG.md`** when a feature ships — never as a separate ritual. Ordering → `ROADMAP.md`;
feature ideas → `FUTURE-IDEAS.md`.

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
- ✅ Nested folders / note tree (sidebar)
- ✅ Search + tag filter
- ✅ In-note find

## Sync & storage
- ✅ Supabase (auth + data) + Cloudflare R2 (attachments) sync — **opt-in per device on
  desktop** (off by default; "Sync on this device" toggle in Settings → Profile)
- ✅ Conflict resolution + offline recovery + cross-tab consistency

## Views & theming
- ✅ Split view + multi-pane tabs
- ✅ Mobile-responsive layout (PWA)
- ✅ Themes (day / night) + starfield background

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
- **Native mobile** (iOS/Android, Capacitor) — dropped v0.3.0; not planned. Mobile is now
  responsive web only. Native-mobile release work is **stopped**.
- Terminal (`terminal-snapshot` tag), AI chat — see `CHANGELOG.md`
