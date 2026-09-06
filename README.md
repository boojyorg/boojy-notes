# Boojy Notes

A simple desktop notes app for Markdown files you own.

## What Boojy Notes is

Write normally, organise notes into folders, and everything stays as ordinary `.md` files on
your computer. There's no account to make, no proprietary note format, and no workspace to
set up. Point it at a folder of Markdown and start writing.

The idea is to combine the simplicity of a traditional notes app with the ownership of local
Markdown. Common note-taking should be obvious. The more advanced Markdown you might already
have in those files (wikilinks, tags, callouts, frontmatter) is understood quietly, and only
shows up when you reach for it.

One promise sits under all of it: editing part of a file must not rewrite the rest of it.
Syntax the app doesn't understand is preserved, never "cleaned up", which is what makes it safe
to use on a folder you care about. The full contract is in
[docs/SPEC-markdown-source-of-truth.md](docs/SPEC-markdown-source-of-truth.md).

## Features

- Block editor with headings, lists, checkboxes, tables, images, code and quotes
- Slash commands and typed Markdown shortcuts (`#`, `-`, `>` and a space, or a code fence)
- Notes are `.md` files in a folder you choose, including an existing Obsidian vault
- Wikilinks, tags, callouts and frontmatter understood without extra chrome
- Folder tree sorted by most recent or by name, and a search palette (Cmd+K)
- One note open at a time
- Light, Dark and System appearance

## Getting started

You need Node.js 22 and pnpm (`corepack enable pnpm`).

```sh
pnpm install
pnpm dev        # the desktop app (Electron)
pnpm dev:web    # browser-only dev server, for fast UI iteration
```

The desktop app is the product. The browser build is a development target: quick to reload,
handy for tests, and its notes live in browser storage rather than on disk.

## Development

| Script           | Description                           |
| ---------------- | ------------------------------------- |
| `dev`            | Vite dev server + Electron            |
| `dev:web`        | Vite dev server (browser only)        |
| `build`          | Production build (web)                |
| `build:electron` | Production build + desktop installers |
| `test`           | Unit tests (Vitest)                   |
| `test:coverage`  | Unit tests with the CI coverage floor |
| `test:e2e`       | Web end-to-end tests (Playwright)     |
| `test:electron`  | Real desktop app against a temp vault |
| `test:electron:headed` | The few desktop tests that need real focus or the clipboard |
| `check`          | Biome lint + format in one pass       |
| `typecheck`      | TypeScript check (`tsc --noEmit`)     |

All scripts run via `pnpm <script>`. CI gates every push on `check`, `typecheck`,
`test:coverage`, `test:e2e` and `test:electron`, plus a critical-level dependency audit; `test`
alone is not the gate. Architecture, conventions and the things that will bite you are in
[AGENTS.md](AGENTS.md); remaining work is in [docs/BACKLOG.md](docs/BACKLOG.md).

Built with React 19 and Vite 6, Electron 42 for the desktop shell, Vitest and Playwright for
tests, Biome for lint and format, pnpm for packages.

## Status

Boojy Notes is preparing for its first desktop Beta. Beta starts when the local desktop app
feels complete enough for ordinary daily use that I no longer feel limited by missing core
features. It isn't there yet. I use it every day, and what I bump into decides what gets
finished next.

Beta is desktop-first: local files, no account, no sync. Web, mobile and a free sync service
are future work, after the desktop release. The direction, what is being considered for Beta
and what is deliberately not being built are in [docs/BACKLOG.md](docs/BACKLOG.md).

Several things were built and then removed to keep the product small: cloud sync and sign-in,
PDF and DOCX export, tabs and split view, native mobile. Each is listed under Removed in
[CHANGELOG.md](CHANGELOG.md), and Git keeps the code if a direction is ever reconsidered.

## Contributing

Boojy Notes isn't currently accepting code contributions. Bug reports and feedback are
welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).

Copyright (c) 2025–2026 Tyr Bujac
