# Boojy Notes

A minimal, markdown-based note-taking app for desktop and web. Local-first: your notes are
plain `.md` files on disk that you own — Boojy is just a calm way to edit them.

## Features

- Block-based editor with headings, lists, checkboxes, tables, images, code, and quotes
- Slash commands and typed markdown shortcuts (`# `, `- `, `> `, ` ``` `, …)
- Notes stored as `.md` files on disk (desktop) or localStorage (web)
- Works directly on existing markdown folders — including an Obsidian vault
- `[[wikilinks]]`, `#tags`, callouts, and frontmatter understood quietly, without extra chrome
- Sidebar with folder tree and search; one note open at a time, no tabs to manage
- Per-note seeded star field backgrounds on the night theme

## The preservation promise

**Editing one part of a markdown file must not unexpectedly rewrite the rest of it.**
Syntax Boojy doesn't understand is preserved, never "cleaned up" — that's what makes it safe
to point Boojy at a folder of markdown you care about. The promise is a binding product rule,
enforced by a round-trip test corpus in CI. Read [docs/PHILOSOPHY.md](docs/PHILOSOPHY.md)
(what Boojy is and isn't) and
[docs/SPEC-markdown-source-of-truth.md](docs/SPEC-markdown-source-of-truth.md)
(the architectural rule behind it).

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`corepack enable pnpm`)

### Run

```sh
pnpm install

# Desktop (Electron)
pnpm dev

# Browser only
pnpm dev:web
```

No accounts, keys, or environment variables are needed — the app is fully local.
(`.env.example` lists the Supabase/R2 variables used only for developing the parked
cloud-sync backend; leave them unset otherwise.)

## Development

| Script           | Description                            |
| ---------------- | -------------------------------------- |
| `dev`            | Vite dev server + Electron             |
| `dev:web`        | Vite dev server (browser only)         |
| `build`          | Production build (web)                 |
| `build:electron` | Production build + desktop installers  |
| `test`           | Unit tests (Vitest)                    |
| `test:e2e`       | End-to-end tests (Playwright)          |
| `check`          | Biome lint + format in one pass        |
| `typecheck`      | TypeScript check (`tsc --noEmit`)      |

All scripts run via `pnpm <script>`. Architecture, project structure, and contributor
conventions live in [AGENTS.md](AGENTS.md).

## Tech Stack

- **React 19** + **Vite 6** — UI and build tooling
- **Electron 42** — desktop shell
- **Vitest** + **Playwright** — unit and E2E tests
- **Biome** — linting + formatting
- **pnpm** — package manager

## Status

Boojy Notes is desktop-first right now: the app is being dogfooded daily as a local-only
tool, and no cloud features ship until the offline app is trusted. The web build is a
responsive PWA at [notes.boojy.org](https://notes.boojy.org). Cloud sync and sign-in exist
as parked backend code, deliberately unmounted from the UI. Native mobile (Capacitor) was
removed in v0.3.0 to reduce scope.

## Contributing

Boojy Notes is in **Early Access** and isn't accepting pull requests yet — contributions will
open with the v1.0 release. **Bug reports and feedback are very welcome** — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

Boojy Notes is licensed under the **GNU General Public License v3.0** — see [LICENSE](LICENSE).

Copyright (c) 2025–2026 Tyr Bujac
