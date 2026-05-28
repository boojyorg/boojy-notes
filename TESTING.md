# Testing All Platforms

Boojy Notes runs on Desktop (Electron) and Web (PWA). This doc covers how to build, run, and test each.

## Prerequisites

| Tool | Required for |
|------|-------------|
| Node.js (v18+) | All platforms |
| pnpm (`corepack enable pnpm`) | Package management |

## Unit Tests

```bash
pnpm test              # Run all tests once
pnpm test:watch        # Watch mode (re-runs on file changes)
pnpm test:coverage     # Run with coverage report
```

## Linting & Formatting

Linting and formatting are handled by [Biome](https://biomejs.dev) (`biome.json`).

```bash
pnpm lint              # Check for lint errors
pnpm lint:fix          # Auto-fix lint errors
pnpm format:check      # Check formatting (runs in CI)
pnpm format            # Auto-format files
pnpm check             # Lint + format in one pass
```

Run `pnpm test` and `pnpm format:check` before committing to catch CI failures early.

## Desktop (Electron)

### Development

```bash
pnpm dev
```

This starts Vite + Electron in dev mode with hot reload.

### Build Installer

```bash
pnpm build:electron
```

Produces platform-specific installers (`.dmg` on macOS, `.exe`/NSIS on Windows, `.AppImage` on Linux) in the `dist/` output directory.

## Web (PWA)

**Important:** All non-Electron commands require `ELECTRON_DISABLE=1` to exclude Electron-specific code. The `dev:web` script sets this automatically.

The web build is fully responsive — the small-screen (mobile browser) layout is driven by viewport width via `useIsMobile`, not a native wrapper.

### Development

```bash
pnpm dev:web
```

### Production Preview

```bash
ELECTRON_DISABLE=1 pnpm build
pnpm preview
```

### Deployment

Web deploys automatically to [boojy.org](https://boojy.org) via Cloudflare Pages on every push to `master`. The Cloudflare build command is `ELECTRON_DISABLE=1 pnpm build`, serving from `dist/`. **Set this build command in the Cloudflare Pages dashboard — it is not read from the repo.**
