# Claude Code Instructions

You have full access to read all files in this repository. Do not ask before reading files — just read them directly when needed.

## Changelog Workflow

When making bug fixes or feature changes:
1. Update `CHANGELOG.md` immediately after each fix
2. Add entries under the "Unreleased" section at the top
3. Use categories: `### Bug Fixes`, `### Features`, `### Improvements`
4. When releasing, change "Unreleased" to the version number and date

## Project Structure

- `ui/` - Flutter frontend
- `ui/lib/` - Dart application code
  - `screens/` - Main views
  - `widgets/` - Reusable UI components
  - `widgets/shared/` - Shared widgets (buttons, dropdowns, toggles)
  - `widgets/painters/` - Custom painters
  - `widgets/start_screen/` - Start screen components
  - `services/` - Business logic and platform services
  - `models/` - Data models
  - `state/` - State management
  - `theme/` - Theme system and colors
  - `constants/` - Shared constants
  - `utils/` - Utility functions
- `ui/windows/` - Windows platform code
- `ui/macos/` - macOS platform code
- `ui/ios/` - iOS platform code
- `ui/web/` - Web platform code

## Release Process

1. Bump version in `package.json` (the app version in Settings reads from here automatically — never hardcode versions elsewhere)
2. Update CHANGELOG.md heading from "Unreleased" to the version number and date
3. Run `npm test` and `npm run format:check` before committing to catch CI failures early
4. Commit all changes and push to `master`
5. Review `ROADMAP.md` — move completed items, reassess priorities
6. Tag with version: `git tag v0.x.x && git push origin v0.x.x`

## Deployment

Three platforms are deployed via two independent pipelines:

- **Web (boojy.org):** Cloudflare Pages auto-deploys on every push to `master`. Project name: `boojy`. Builds with `ELECTRON_DISABLE=1 npm run build` and serves from `dist/`.
- **macOS + Windows:** GitHub Actions (`release.yml`) triggers on `v*` tag push. Builds Electron installers and uploads them to the GitHub Release.

This means pushing to `master` (step 4) deploys the web version, and pushing the tag (step 5) builds the desktop installers. Both happen as part of a single release.

## Code Signing Secrets (GitHub)

- `MACOS_CERTIFICATE` - Base64-encoded .p12 file (use `-legacy` flag when exporting)
- `MACOS_CERTIFICATE_PWD` - Password for the .p12
- `DEVELOPER_ID` - Full signing identity name
- `APPLE_APP_PASSWORD` - App-specific password from appleid.apple.com
