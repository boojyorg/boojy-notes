# Testing All Platforms

Boojy Notes runs on Desktop (Electron) and Web (PWA). This doc covers how to build, run, and test each.

## Prerequisites

| Tool | Required for |
|------|-------------|
| Node.js (v18+) | All platforms |

## Unit Tests

```bash
npm test              # Run all tests once
npm run test:watch    # Watch mode (re-runs on file changes)
npm run test:coverage # Run with coverage report
```

## Linting & Formatting

```bash
npm run lint          # Check for lint errors
npm run lint:fix      # Auto-fix lint errors
npm run format:check  # Check formatting (runs in CI)
npm run format        # Auto-format files
```

Run `npm test` and `npm run format:check` before committing to catch CI failures early.

## Desktop (Electron)

### Development

```bash
npm run dev
```

This starts Vite + Electron in dev mode with hot reload.

### Build Installer

```bash
npm run build:electron
```

Produces platform-specific installers (`.dmg` on macOS, `.exe`/NSIS on Windows, `.AppImage` on Linux) in the `dist/` output directory.

## Web (PWA)

**Important:** All non-Electron commands require `ELECTRON_DISABLE=1` to exclude Electron-specific code. The `dev:web` script sets this automatically.

The web build is fully responsive — the small-screen (mobile browser) layout is driven by viewport width via `useIsMobile`, not a native wrapper.

### Development

```bash
npm run dev:web
```

### Production Preview

```bash
ELECTRON_DISABLE=1 npm run build
npm run preview
```

### Deployment

Web deploys automatically to [boojy.org](https://boojy.org) via Cloudflare Pages on every push to `master`. The Cloudflare build command is `ELECTRON_DISABLE=1 npm run build`, serving from `dist/`.
