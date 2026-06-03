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
- 🚧 Lossless block↔markdown round-trip (v0.5 constraint, enforced by `markdown.test.js`)
- ✅ `.md` import/round-trip

## Organize & find
- ✅ Nested folders / note tree (sidebar)
- ✅ Search + tag filter
- ✅ In-note find

## Sync & storage
- ✅ Supabase (auth + data) + Cloudflare R2 (attachments) sync
- ✅ Conflict resolution + offline recovery + cross-tab consistency

## Views & theming
- ✅ Split view + multi-pane tabs
- ✅ Mobile-responsive layout (PWA)
- ✅ Themes (day / night) + starfield background

## Platform
- ✅ Web (PWA, `notes.boojy.org`)
- ✅ Desktop (Electron, auto-update, DMG/EXE)
- ⬜ Native mobile (Capacitor dropped v0.3.0 — web responsive instead)

## Export / import
- ✅ Export — PDF, DOCX, Markdown
- ✅ Folder import

## Removed (recoverable via git tag)
- Terminal (`terminal-snapshot` tag), AI chat, Capacitor mobile — see `CHANGELOG.md`
