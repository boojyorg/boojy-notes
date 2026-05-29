# Boojy Notes

A minimal, markdown-based note-taking app for web and desktop.

## Features

- Block-based editor with headings, bullets, checkboxes, and dividers
- Slash commands and markdown shortcuts
- Notes stored as `.md` files on disk (Electron) or localStorage (web)
- Cloud sync via Supabase + Cloudflare R2
- Email, Google, and Apple sign-in
- Per-note seeded star field backgrounds
- Sidebar with folder tree, search, and tabs

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`corepack enable pnpm`)

### Setup

```sh
pnpm install
cp .env.example .env.local
```

Fill in your Supabase and R2 keys in `.env.local` (see `.env.example` for the required variables).

### Run

```sh
# Browser only
pnpm dev:web

# Electron (desktop + web)
pnpm dev
```

## Scripts

| Script             | Description                          |
| ------------------ | ------------------------------------ |
| `dev`              | Start Vite dev server with Electron  |
| `dev:web`          | Start Vite dev server (browser only) |
| `build`            | Production build (web)               |
| `build:electron`   | Production build + Electron packager |
| `preview`          | Preview the production build locally |
| `test`             | Run unit tests (Vitest)              |
| `lint`             | Lint with Biome                      |
| `format:check`     | Check formatting with Biome          |
| `check`            | Biome lint + format in one pass      |
| `typecheck`        | TypeScript type-check (`tsc --noEmit`) |

All scripts run via `pnpm <script>`.

## Project Structure

```text
src/
  BoojyNotes.jsx        # App root
  main.jsx              # Entry point
  components/           # UI components (EditableBlock, Sidebar, TopBar, StarField, …)
    blocks/             # Block types (code, table, callout, image, file, embed)
    mobile/             # Mobile-browser UI (toolbar, bottom sheet, FAB)
    settings/           # Settings modal panels (SettingsModal, ProfileTab, …)
  context/              # React Context providers (Theme, NoteData, Settings, Layout, Sidebar, Overlay, Editor)
  hooks/                # Custom hooks (useSync, useFileSystem, useNoteStats, …)
    editor/             # Editor hooks (keyboard, paste, drag, slash commands)
  services/             # Platform services (apiProvider, sync)
  utils/                # Helpers (storage.ts, search, markdown, inlineFormatting, platform)
  constants/            # Themes, colors, z-index, data defaults
  styles/               # Shared style objects
  tokens/               # Design tokens (spacing, radius, typography, shadows)
  types/                # TypeScript definitions
  lib/
    supabase.js         # Supabase client init
electron/               # Electron main process (IPC, file I/O, export/import)
```

## Tech Stack

- **React 19** — UI
- **Vite 6** — Build tooling
- **Electron 40** — Desktop shell
- **Supabase** — Auth and database
- **Chokidar** — File system watching (Electron)
- **pnpm** — Package manager
- **Biome** — Linting + formatting

## Roadmap

Focus is on the **web platform** (responsive PWA on [boojy.org](https://boojy.org)), with Electron as the desktop shell. Native mobile (iOS/Android via Capacitor) was removed in v0.3.0 to reduce scope.
