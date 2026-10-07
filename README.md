# Boojy Notes

A simple desktop notes app for Markdown files you own.

## What Boojy Notes is

Write normally, organise notes into folders, and everything stays as ordinary `.md` files on your computer. There's no account to make, no proprietary note format, and no workspace to set up. Point it at a folder of Markdown and start writing.

The idea is to combine the simplicity of a traditional notes app with the ownership of local Markdown. Common note-taking should be obvious. The more advanced Markdown you might already have in those files (wikilinks, tags, callouts, frontmatter) is understood quietly, and only shows up when you reach for it.

One promise sits under all of it: editing part of a file must not rewrite the rest of it. Syntax the app doesn't understand is preserved, never "cleaned up", which is what makes it safe to use on a folder you care about. The full contract is in [docs/SPEC-markdown-source-of-truth.md](docs/SPEC-markdown-source-of-truth.md).

## Features

- Block editor with six heading levels, lists and to-dos, tables, images, code and quotes
- Slash commands and typed Markdown shortcuts: `#`, `-`, `>` and a space, a code fence, `**bold**` as you type, `|||` for a table, `![]` for an image
- Notes are `.md` files in a folder you choose, including an existing Obsidian vault
- Wikilinks, tags, callouts and frontmatter understood without extra chrome
- A folder tree sorted by most recent or by name, and a search palette on Cmd+P
- The note's folder path in the top row, and a full menu bar with every command and its shortcut
- A Markdown view (Cmd+/) that shows and edits the note as its file
- Spell checking as you write, with suggestions and Add to dictionary on right-click
- Version history for every note, with save points on Cmd+S, and Recently Deleted for 30 days
- More than one storage location, including folders in iCloud Drive or Dropbox, and other files shown beside your notes
- PDFs and pictures open in the note's place, with page links (`[[Slides.pdf#page=12]]`) and Copy as Quote
- One note open at a time
- Light, Dark and System appearance, and quiet motion that respects Reduce Motion
- macOS, Windows and Linux

## Getting started

You need Node.js 22 and pnpm (`corepack enable pnpm`).

```sh
pnpm install
pnpm dev        # the desktop app (Electron)
pnpm dev:web    # browser-only dev server, for fast UI iteration
```

The desktop app is the product. The browser build is a development target: quick to reload, handy for tests, and its notes live in browser storage rather than on disk.

## Development

| Script           | Description                                            |
| ---------------- | ------------------------------------------------------ |
| `dev`            | Vite dev server + Electron                             |
| `dev:web`        | Vite dev server (browser only)                         |
| `build`          | Production build (web)                                 |
| `build:electron` | Production build + desktop installers, into `release/` |
| `test`           | Unit tests (Vitest)                                    |
| `test:coverage`  | Unit tests with the CI coverage floor                  |
| `test:e2e`       | Web end-to-end tests (Playwright)                      |
| `test:electron`  | Real desktop app against a temp vault                  |
| `check`          | Biome lint + format in one pass                        |
| `typecheck`      | TypeScript check (`tsc --noEmit`)                      |

All scripts run via `pnpm <script>`. CI gates every push on `check`, `typecheck`, `test:coverage`, `test:e2e` and `test:electron`, plus a dependency audit at high severity; `test` alone is not the gate. Architecture, conventions and the things that will bite you are in [AGENTS.md](AGENTS.md); remaining work is in [docs/BACKLOG.md](docs/BACKLOG.md).

Built with React 19 and Vite 8, Electron 44 for the desktop shell, Vitest and Playwright for tests, Biome for lint and format, pnpm for packages.

## Status

Boojy Notes is in Beta, since v0.15.0, published on 2026-10-07 for macOS, Windows and Linux. It's the build [boojy.org](https://boojy.org) offers, and an installed copy from v0.8.0 onward updates itself to it. The desktop app is complete enough for ordinary daily use: I use it every day, and what I bump into decides what gets finished next. The next big step is having the same notes on my Android phone. On Windows the installer isn't signed yet, so Windows warns about an unknown publisher; choose More info, then Run anyway.

Several things were built and then removed to keep the product small: cloud sync and sign-in, PDF and DOCX export, tabs and split view, native mobile. Each is listed under Removed in [CHANGELOG.md](CHANGELOG.md), and Git keeps the code if a direction is ever reconsidered.

## Contributing

Boojy Notes isn't accepting code contributions right now; see [CONTRIBUTING.md](CONTRIBUTING.md) for feedback and bug reports.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).

Copyright (c) 2025–2026 Tyr Bujac
