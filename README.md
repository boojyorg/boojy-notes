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

## Project Structure

```text
assets/
  boojy-logo.png          # Brand logo
  boojy-notes-text-N.png  # "N" wordmark segment
  boojy-notes.text-tes.png # "tes" wordmark segment
src/
  BoojyNotes.jsx        # App root
  main.jsx              # Entry point
  components/
    EditableBlock.jsx    # Block-based editor
    Icons.jsx            # SVG icon components
    SettingsModal.jsx    # Settings UI
    StarField.jsx        # Seeded star field background
  hooks/
    useAuth.js           # Authentication state
    useFileSystem.js     # Local file read/write (Electron)
    useSync.js           # Cloud sync logic
  constants/
    colors.js            # Theme palette
    data.js              # Static data and defaults
  utils/
    colorUtils.js        # Color manipulation helpers
    random.js            # Seeded random number generator
    storage.js           # localStorage abstraction
  services/
    sync.js              # Sync service
  lib/
    supabase.js          # Supabase client init
electron/
  main.js               # Electron main process
  preload.js             # Preload script (IPC bridge)
  markdown.js            # Markdown file read/write
```

## Tech Stack

- **React 19** — UI
- **Vite 6** — Build tooling
- **Electron 40** — Desktop shell
- **Supabase** — Auth and database
- **Chokidar** — File system watching (Electron)

## Roadmap

Focus is on the **web platform** (responsive PWA on [boojy.org](https://boojy.org)), with Electron as the desktop shell. Native mobile (iOS/Android via Capacitor) was removed in v0.3.0 to reduce scope.
