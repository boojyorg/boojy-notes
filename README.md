# Boojy Notes

A minimal, Markdown-based note-taking app for desktop. Local-first: your notes are plain `.md`
files on disk that you own. Boojy is just a calm way to edit them.

## What Boojy is

**Boojy Notes is a simple editor for Markdown files you own.** Common note-taking should be
obvious. Advanced syntax may be supported quietly. Unsupported Markdown must be preserved.
Features do not earn permanent UI merely because Boojy can support them.

One promise follows from that: **editing one part of a Markdown file must not unexpectedly
rewrite the rest of it.** Syntax Boojy doesn't understand is preserved, never "cleaned up".
That is what makes it safe to point Boojy at a folder of Markdown you care about, including an
Obsidian vault. It's a binding product rule, enforced by a round-trip test corpus in CI. The
full contract, including which syntax Boojy renders, keeps quiet about, or merely preserves,
is [docs/SPEC-markdown-source-of-truth.md](docs/SPEC-markdown-source-of-truth.md).

## Features

- Block-based editor with headings, lists, checkboxes, tables, images, code and quotes
- Slash commands and typed Markdown shortcuts (`# `, `- `, `> `, ` ``` `, …)
- Notes stored as `.md` files in a folder you choose; works directly on an existing Markdown
  folder, including an Obsidian vault
- `[[wikilinks]]`, `#tags`, callouts and frontmatter understood quietly, without extra chrome
- Sidebar with folder tree and search, sorted by recency or name
- One note open at a time. No tabs to manage
- Light and dark themes, with a per-note star field on the dark one

## Getting started

You need Node.js 22 (what CI runs) and pnpm (`corepack enable pnpm`).

```sh
pnpm install

# Desktop (Electron)
pnpm dev

# Browser only
pnpm dev:web
```

No accounts, keys or environment variables are needed. The app is fully local.

## Development

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `dev`            | Vite dev server + Electron            |
| `dev:web`        | Vite dev server (browser only)        |
| `build`          | Production build (web)                |
| `build:electron` | Production build + desktop installers |
| `test`           | Unit tests (Vitest)                   |
| `test:e2e`       | End-to-end tests (Playwright)         |
| `check`          | Biome lint + format in one pass       |
| `typecheck`      | TypeScript check (`tsc --noEmit`)     |

All scripts run via `pnpm <script>`. Architecture, project structure, conventions and the
things that will bite you live in [AGENTS.md](AGENTS.md); what's planned and what's known to
be broken is in [docs/BACKLOG.md](docs/BACKLOG.md).

Built with React 19 and Vite 6, Electron 42 for the desktop shell, Vitest and Playwright for
tests, Biome for lint and format, pnpm for packages.

## Status

Boojy Notes is in Beta and desktop-only. I use it every day as a local tool, and that daily
use is what decides what gets finished next. The web build still exists and is served at
[notes.boojy.org](https://notes.boojy.org), but it's there for development and tests; web
notes live in browser storage, not on disk.

Several things were built and then removed to keep the product small: cloud sync and sign-in,
PDF and DOCX export, tabs and split view, native mobile. Each is listed under Removed in
[CHANGELOG.md](CHANGELOG.md), and Git history keeps the code if a direction is ever
reconsidered.

## Contributing

Boojy Notes isn't accepting pull requests yet; contributions open with the v1.0 release.
Bug reports and feedback are very welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Boojy Notes is licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE).

Copyright (c) 2025–2026 Tyr Bujac
